import { MODULES } from './moduleRegistry';
import { ConnectionGraph } from './connectionGraph';
import type { ModuleType, SimulationState } from './types';

const SOURCE_VOLTAGE: Partial<Record<ModuleType, number>> = {
  battery: 6,
  solar: 5,
};

const LOAD_CURRENT: Partial<Record<ModuleType, number>> = {
  motor: .45,
  lamp: .25,
  led: .08,
  buzzer: .15,
  sensor: .05,
  streetlight: .18,
  'traffic-light': .12,
};

const BASE_TORQUE: Partial<Record<ModuleType, number>> = {
  motor: .35,
  'hand-crank': .55,
};

export class SimulationEngine {
  constructor(private graph: ConnectionGraph) {}

  evaluate(): SimulationState {
    const powered = new Set<string>();
    const rpm = new Map<string, number>();
    const active = new Set<string>();
    const fluid = new Set<string>();
    const voltage = new Map<string, number>();
    const current = new Map<string, number>();
    const torque = new Map<string, number>();
    const flow = new Map<string, number>();
    const pressure = new Map<string, number>();
    const faults = new Map<string, string[]>();

    const addFault = (id: string, message: string) => {
      const list = faults.get(id) ?? [];
      if (!list.includes(message)) list.push(message);
      faults.set(id, list);
    };

    // 1) Electrical network: deterministic low-voltage educational model.
    const powerQueue: { id: string; volts: number }[] = [];
    for (const module of this.graph.modules.values()) {
      if (MODULES[module.type].behavior.kind !== 'source') continue;
      const volts = SOURCE_VOLTAGE[module.type] ?? 6;
      powered.add(module.id);
      active.add(module.id);
      voltage.set(module.id, volts);
      powerQueue.push({ id: module.id, volts });
    }

    while (powerQueue.length) {
      const { id, volts } = powerQueue.shift()!;
      for (const edge of this.graph.outgoing(id, 'power')) {
        const next = this.graph.modules.get(edge.toModuleId);
        if (!next || powered.has(next.id)) continue;
        const behavior = MODULES[next.type].behavior;
        if (behavior.kind === 'switch' && next.switchOn === false) continue;

        powered.add(next.id);
        active.add(next.id);
        voltage.set(next.id, volts);
        const amps = LOAD_CURRENT[next.type] ?? 0;
        if (amps > 0) current.set(next.id, amps);
        powerQueue.push({ id: next.id, volts });
      }
    }

    // Sum approximate load current at each electrical source for educational display.
    for (const source of this.graph.modules.values()) {
      if (MODULES[source.type].behavior.kind !== 'source') continue;
      let amps = 0;
      const seen = new Set<string>([source.id]);
      const q = [source.id];
      while (q.length) {
        const id = q.shift()!;
        for (const edge of this.graph.outgoing(id, 'power')) {
          const next = this.graph.modules.get(edge.toModuleId);
          if (!next || seen.has(next.id) || !powered.has(next.id)) continue;
          seen.add(next.id);
          amps += LOAD_CURRENT[next.type] ?? 0;
          q.push(next.id);
        }
      }
      current.set(source.id, amps);
      if (amps > 1.4) addFault(source.id, 'Tải điện khá lớn so với nguồn.');
    }

    // 2) Mechanical rotation and torque.
    const rotationQueue: { id: string; rpm: number; torque: number }[] = [];
    for (const module of this.graph.modules.values()) {
      const behavior = MODULES[module.type].behavior;
      if (behavior.kind === 'motor' && powered.has(module.id)) {
        const speed = behavior.rpm ?? 120;
        const t = BASE_TORQUE[module.type] ?? .35;
        rpm.set(module.id, speed);
        torque.set(module.id, t);
        active.add(module.id);
        rotationQueue.push({ id: module.id, rpm: speed, torque: t });
      } else if (behavior.kind === 'rotation-source') {
        const speed = behavior.rpm ?? 45;
        const t = BASE_TORQUE[module.type] ?? .55;
        rpm.set(module.id, speed);
        torque.set(module.id, t);
        active.add(module.id);
        rotationQueue.push({ id: module.id, rpm: speed, torque: t });
      }
    }

    const bestMagnitude = new Map<string, number>();
    while (rotationQueue.length) {
      const currentNode = rotationQueue.shift()!;
      const currentModule = this.graph.modules.get(currentNode.id);
      if (!currentModule) continue;
      const currentBehavior = MODULES[currentModule.type].behavior;

      for (const edge of this.graph.outgoing(currentNode.id, 'rotation')) {
        const next = this.graph.modules.get(edge.toModuleId);
        if (!next) continue;
        const behavior = MODULES[next.type].behavior;
        let nextRpm = currentNode.rpm;
        let nextTorque = currentNode.torque * .97; // bearing/coupling losses.

        if (currentBehavior.kind === 'gear' && behavior.kind === 'gear') {
          const driverTeeth = currentBehavior.teeth ?? 1;
          const drivenTeeth = behavior.teeth ?? 1;
          const ratio = driverTeeth / drivenTeeth;
          nextRpm = -currentNode.rpm * ratio;
          nextTorque = currentNode.torque / Math.max(.05, Math.abs(ratio)) * .92;
        } else if (behavior.kind === 'transmission') {
          const ratio = behavior.ratio ?? 1;
          nextRpm = currentNode.rpm * ratio;
          nextTorque = currentNode.torque / Math.max(.05, Math.abs(ratio)) * .9;
        }

        const mag = Math.abs(nextRpm);
        if ((bestMagnitude.get(next.id) ?? -1) >= mag) continue;

        bestMagnitude.set(next.id, mag);
        rpm.set(next.id, nextRpm);
        torque.set(next.id, nextTorque);
        active.add(next.id);

        if (
          behavior.kind === 'pass-rotation' ||
          behavior.kind === 'gear' ||
          behavior.kind === 'transmission'
        ) {
          rotationQueue.push({ id: next.id, rpm: nextRpm, torque: nextTorque });
        }
      }
    }

    // 3) Fluid network with approximate pressure and flow.
    const fluidQueue: { id: string; lpm: number; bar: number }[] = [];
    for (const module of this.graph.modules.values()) {
      if (MODULES[module.type].behavior.kind !== 'fluid-source') continue;
      const baseFlow = module.type === 'hydrant' ? 10 : 3.5;
      const basePressure = module.type === 'hydrant' ? 2.4 : .15;
      fluid.add(module.id);
      active.add(module.id);
      flow.set(module.id, baseFlow);
      pressure.set(module.id, basePressure);
      fluidQueue.push({ id: module.id, lpm: baseFlow, bar: basePressure });
    }

    while (fluidQueue.length) {
      const node = fluidQueue.shift()!;
      for (const edge of this.graph.outgoing(node.id, 'fluid')) {
        const next = this.graph.modules.get(edge.toModuleId);
        if (!next || fluid.has(next.id)) continue;
        const behavior = MODULES[next.type].behavior;

        if (behavior.kind === 'fluid-valve' && next.switchOn === false) continue;
        if (behavior.kind === 'pump' && !rpm.has(next.id)) {
          addFault(next.id, 'Có nước nhưng bơm chưa nhận truyền động.');
          continue;
        }
        if (next.type === 'firetruck' && !rpm.has(next.id)) {
          addFault(next.id, 'Xe cứu hỏa chưa có truyền động để chạy bơm.');
          continue;
        }

        let nextFlow = node.lpm * .97;
        let nextPressure = Math.max(.03, node.bar - .03);

        if (behavior.kind === 'pump') {
          const speedFactor = Math.max(.35, Math.min(1.4, Math.abs(rpm.get(next.id) ?? 0) / 120));
          nextFlow = Math.max(nextFlow, 6 * speedFactor);
          nextPressure = Math.max(nextPressure, 1.8 * speedFactor);
        } else if (next.type === 'firetruck') {
          nextFlow = Math.max(nextFlow, 8);
          nextPressure = Math.max(nextPressure, 2.2);
        } else if (behavior.kind === 'fluid-output') {
          nextFlow *= .82;
          nextPressure *= .72;
        }

        fluid.add(next.id);
        active.add(next.id);
        flow.set(next.id, nextFlow);
        pressure.set(next.id, nextPressure);

        if (
          behavior.kind === 'fluid-pass' ||
          behavior.kind === 'fluid-valve' ||
          behavior.kind === 'pump' ||
          next.type === 'firetruck'
        ) {
          fluidQueue.push({ id: next.id, lpm: nextFlow, bar: nextPressure });
        }
      }
    }

    for (const module of this.graph.modules.values()) {
      const behavior = MODULES[module.type].behavior;
      if (behavior.kind === 'pump') {
        if (rpm.has(module.id) && !fluid.has(module.id)) addFault(module.id, 'Bơm đang quay nhưng thiếu nước đầu hút.');
        if (!rpm.has(module.id) && fluid.has(module.id)) addFault(module.id, 'Bơm có nước nhưng thiếu truyền động.');
      }
      if (behavior.kind === 'motor' && powered.has(module.id) && !this.graph.outgoing(module.id, 'rotation').length) {
        addFault(module.id, 'Mô tơ đang quay không tải.');
      }
    }

    return { powered, rpm, active, fluid, voltage, current, torque, flow, pressure, faults };
  }
}
