import { MODULES } from './moduleRegistry';
import { ConnectionGraph } from './connectionGraph';
import type { SimulationState } from './types';

const LOAD_CURRENT = {
  motor: .45,
} as const;

export class SimulationEngine {
  constructor(private graph: ConnectionGraph) {}

  evaluate(): SimulationState {
    const powered = new Set<string>();
    const active = new Set<string>();
    const rpm = new Map<string, number>();
    const voltage = new Map<string, number>();
    const current = new Map<string, number>();
    const torque = new Map<string, number>();

    const powerQueue: string[] = [];

    for (const module of this.graph.modules.values()) {
      const behavior = MODULES[module.type].behavior;
      if (behavior.kind !== 'source') continue;
      powered.add(module.id);
      active.add(module.id);
      voltage.set(module.id, behavior.voltage);
      powerQueue.push(module.id);
    }

    while (powerQueue.length) {
      const id = powerQueue.shift()!;
      const volts = voltage.get(id) ?? 6;

      for (const edge of this.graph.outgoing(id, 'power')) {
        const next = this.graph.modules.get(edge.toModuleId);
        if (!next || powered.has(next.id)) continue;

        const behavior = MODULES[next.type].behavior;
        if (behavior.kind === 'switch' && next.switchOn === false) continue;

        powered.add(next.id);
        active.add(next.id);
        voltage.set(next.id, volts);
        if (next.type === 'motor') current.set(next.id, LOAD_CURRENT.motor);
        powerQueue.push(next.id);
      }
    }

    const rotationQueue: { id: string; rpm: number; torque: number }[] = [];

    for (const module of this.graph.modules.values()) {
      const behavior = MODULES[module.type].behavior;
      if (behavior.kind !== 'motor' || !powered.has(module.id)) continue;

      rpm.set(module.id, behavior.rpm);
      torque.set(module.id, behavior.torque);
      active.add(module.id);
      rotationQueue.push({
        id: module.id,
        rpm: behavior.rpm,
        torque: behavior.torque,
      });
    }

    while (rotationQueue.length) {
      const node = rotationQueue.shift()!;

      for (const edge of this.graph.outgoing(node.id, 'rotation')) {
        const next = this.graph.modules.get(edge.toModuleId);
        if (!next || rpm.has(next.id)) continue;

        const behavior = MODULES[next.type].behavior;
        let nextRpm = node.rpm;
        let nextTorque = node.torque * .98;

        if (behavior.kind === 'transmission') {
          nextRpm = node.rpm * behavior.ratio;
          nextTorque = node.torque / Math.max(.05, behavior.ratio) * behavior.efficiency;
        }

        rpm.set(next.id, nextRpm);
        torque.set(next.id, nextTorque);
        active.add(next.id);

        if (behavior.kind === 'transmission') {
          rotationQueue.push({
            id: next.id,
            rpm: nextRpm,
            torque: nextTorque,
          });
        }
      }
    }

    for (const source of this.graph.modules.values()) {
      const behavior = MODULES[source.type].behavior;
      if (behavior.kind !== 'source') continue;
      let amps = 0;
      const seen = new Set<string>([source.id]);
      const queue = [source.id];

      while (queue.length) {
        const id = queue.shift()!;
        for (const edge of this.graph.outgoing(id, 'power')) {
          const next = this.graph.modules.get(edge.toModuleId);
          if (!next || seen.has(next.id) || !powered.has(next.id)) continue;
          seen.add(next.id);
          if (next.type === 'motor') amps += LOAD_CURRENT.motor;
          queue.push(next.id);
        }
      }

      current.set(source.id, amps);
    }

    return { powered, active, rpm, voltage, current, torque };
  }
}
