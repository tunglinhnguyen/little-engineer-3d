import { MODULES } from './moduleRegistry';
import { ConnectionGraph } from './connectionGraph';
import type { SimulationState } from './types';

export class SimulationEngine {
  constructor(private graph: ConnectionGraph) {}

  evaluate(): SimulationState {
    const powered = new Set<string>();
    const rpm = new Map<string, number>();
    const active = new Set<string>();

    const powerQueue: string[] = [];
    for (const module of this.graph.modules.values()) {
      if (MODULES[module.type].behavior.kind === 'source') {
        powered.add(module.id);
        active.add(module.id);
        powerQueue.push(module.id);
      }
    }

    while (powerQueue.length) {
      const id = powerQueue.shift()!;
      for (const edge of this.graph.outgoing(id, 'power')) {
        const next = this.graph.modules.get(edge.toModuleId);
        if (!next || powered.has(next.id)) continue;
        const behavior = MODULES[next.type].behavior;
        if (behavior.kind === 'switch' && next.switchOn === false) continue;
        powered.add(next.id);
        active.add(next.id);
        powerQueue.push(next.id);
      }
    }

    const rotationQueue: { id: string; rpm: number }[] = [];
    for (const module of this.graph.modules.values()) {
      const behavior = MODULES[module.type].behavior;
      if (behavior.kind === 'motor' && powered.has(module.id)) {
        const speed = behavior.rpm ?? 120;
        rpm.set(module.id, speed);
        active.add(module.id);
        rotationQueue.push({ id: module.id, rpm: speed });
      }
      if (behavior.kind === 'rotation-source') {
        const speed = behavior.rpm ?? 45;
        rpm.set(module.id, speed);
        active.add(module.id);
        rotationQueue.push({ id: module.id, rpm: speed });
      }
    }

    const bestMagnitude = new Map<string, number>();
    while (rotationQueue.length) {
      const current = rotationQueue.shift()!;
      const currentModule = this.graph.modules.get(current.id);
      if (!currentModule) continue;
      const currentBehavior = MODULES[currentModule.type].behavior;

      for (const edge of this.graph.outgoing(current.id, 'rotation')) {
        const next = this.graph.modules.get(edge.toModuleId);
        if (!next) continue;
        const behavior = MODULES[next.type].behavior;
        let nextRpm = current.rpm;

        // Two meshing gears rotate in opposite directions. Their speed ratio is
        // driver-teeth / driven-teeth. Other shaft-like links preserve RPM.
        if (currentBehavior.kind === 'gear' && behavior.kind === 'gear') {
          const driverTeeth = currentBehavior.teeth ?? 1;
          const drivenTeeth = behavior.teeth ?? 1;
          nextRpm = -current.rpm * driverTeeth / drivenTeeth;
        }

        const mag = Math.abs(nextRpm);
        if ((bestMagnitude.get(next.id) ?? -1) >= mag) continue;
        bestMagnitude.set(next.id, mag);
        rpm.set(next.id, nextRpm);
        active.add(next.id);

        if (
          behavior.kind === 'pass-rotation' ||
          behavior.kind === 'gear'
        ) {
          rotationQueue.push({ id: next.id, rpm: nextRpm });
        }
      }
    }

    return { powered, rpm, active };
  }
}
