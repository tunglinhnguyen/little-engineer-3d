import { Vector3 } from 'three';
import { MODULES } from './moduleRegistry';
import type { Connection, ModuleInstance, ModuleType, PortDefinition, SignalType } from './types';

export function portsCompatible(a: PortDefinition, b: PortDefinition): boolean {
  if (a.signal !== b.signal) return false;
  if (a.direction === 'bi' || b.direction === 'bi') return true;
  return (a.direction === 'out' && b.direction === 'in') || (a.direction === 'in' && b.direction === 'out');
}

export function normalizeConnection(
  aModule: ModuleInstance,
  aPort: PortDefinition,
  bModule: ModuleInstance,
  bPort: PortDefinition,
): Omit<Connection, 'id'> | null {
  if (!portsCompatible(aPort, bPort)) return null;
  if (aPort.direction === 'out' || bPort.direction === 'in') {
    return { fromModuleId: aModule.id, fromPortId: aPort.id, toModuleId: bModule.id, toPortId: bPort.id, signal: aPort.signal };
  }
  return { fromModuleId: bModule.id, fromPortId: bPort.id, toModuleId: aModule.id, toPortId: aPort.id, signal: bPort.signal };
}

export class ConnectionGraph {
  readonly modules = new Map<string, ModuleInstance>();
  readonly connections = new Map<string, Connection>();

  addModule(module: ModuleInstance) { this.modules.set(module.id, module); }
  removeModule(id: string) {
    this.modules.delete(id);
    for (const [key, c] of this.connections) if (c.fromModuleId === id || c.toModuleId === id) this.connections.delete(key);
  }
  connect(connection: Connection) { this.connections.set(connection.id, connection); }
  disconnectModule(id: string) {
    for (const [key, c] of this.connections) if (c.fromModuleId === id || c.toModuleId === id) this.connections.delete(key);
  }
  isPortUsed(moduleId: string, portId: string): boolean {
    return [...this.connections.values()].some(c =>
      (c.fromModuleId === moduleId && c.fromPortId === portId) || (c.toModuleId === moduleId && c.toPortId === portId));
  }
  outgoing(moduleId: string, signal?: SignalType): Connection[] {
    return [...this.connections.values()].filter(c => c.fromModuleId === moduleId && (!signal || c.signal === signal));
  }
  incoming(moduleId: string, signal?: SignalType): Connection[] {
    return [...this.connections.values()].filter(c => c.toModuleId === moduleId && (!signal || c.signal === signal));
  }
  private snapCandidate(id: string, maxDistance = 1.05) {
    const moving = this.modules.get(id);
    if (!moving) return null;
    const axisY = new Vector3(0, 1, 0);
    const worldPort = (m: ModuleInstance, p: PortDefinition, rotationY = m.rotationY) =>
      new Vector3(...p.position).applyAxisAngle(axisY, rotationY).add(new Vector3(...m.position));
    const worldAxis = (m: ModuleInstance, p: PortDefinition, rotationY = m.rotationY) =>
      new Vector3(...p.axis).applyAxisAngle(axisY, rotationY);

    let best: {
      rotationY: number;
      movingPort: PortDefinition;
      other: ModuleInstance;
      otherPort: PortDefinition;
      distance: number;
      delta: Vector3;
    } | null = null;

    const rotations = MODULES[moving.type].ports.length
      ? [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(step => (moving.rotationY + step) % (Math.PI * 2))
      : [moving.rotationY];

    for (const rotationY of rotations) {
      for (const movingPort of MODULES[moving.type].ports) {
        if (this.isPortUsed(id, movingPort.id)) continue;
        for (const other of this.modules.values()) {
          if (other.id === id) continue;
          for (const otherPort of MODULES[other.type].ports) {
            if (this.isPortUsed(other.id, otherPort.id) || !portsCompatible(movingPort, otherPort)) continue;
            if (worldAxis(moving, movingPort, rotationY).dot(worldAxis(other, otherPort)) >= -.72) continue;
            const delta = worldPort(other, otherPort).sub(worldPort(moving, movingPort, rotationY));
            const distance = delta.length();
            if (distance > maxDistance) continue;
            if (!best || distance < best.distance) {
              best = { rotationY, movingPort, other, otherPort, distance, delta };
            }
          }
        }
      }
    }
    return best;
  }

  attachModuleToTarget(id: string, targetId: string): boolean {
    const moving = this.modules.get(id);
    const target = this.modules.get(targetId);
    if (!moving || !target || id === targetId) return false;

    const axisY = new Vector3(0, 1, 0);
    const targetPosition = new Vector3(...target.position);
    const movingPosition = new Vector3(...moving.position);
    let best: {
      rotationY: number;
      movingPort: PortDefinition;
      targetPort: PortDefinition;
      delta: Vector3;
      distance: number;
    } | null = null;

    for (const rotationY of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (const movingPort of MODULES[moving.type].ports) {
        if (this.isPortUsed(id, movingPort.id)) continue;
        const movingAxis = new Vector3(...movingPort.axis).applyAxisAngle(axisY, rotationY);
        const movingPortWorld = new Vector3(...movingPort.position).applyAxisAngle(axisY, rotationY).add(movingPosition);

        for (const targetPort of MODULES[target.type].ports) {
          if (this.isPortUsed(targetId, targetPort.id) || !portsCompatible(movingPort, targetPort)) continue;
          const targetAxis = new Vector3(...targetPort.axis).applyAxisAngle(axisY, target.rotationY);
          if (movingAxis.dot(targetAxis) >= -.72) continue;

          const targetPortWorld = new Vector3(...targetPort.position).applyAxisAngle(axisY, target.rotationY).add(targetPosition);
          const delta = targetPortWorld.clone().sub(movingPortWorld);
          const distance = delta.length();
          if (!best || distance < best.distance) best = { rotationY, movingPort, targetPort, delta, distance };
        }
      }
    }

    if (!best) return false;
    moving.rotationY = best.rotationY;
    moving.position = movingPosition.add(best.delta).toArray();
    const connection = normalizeConnection(moving, best.movingPort, target, best.targetPort);
    if (!connection) return false;
    this.connect({ id: crypto.randomUUID(), ...connection });
    return true;
  }

  magnetizeModule(id: string, maxDistance = 1.05): boolean {
    const moving = this.modules.get(id);
    const nearest = this.snapCandidate(id, maxDistance);
    if (!moving || !nearest) return false;
    moving.rotationY = nearest.rotationY;
    moving.position = new Vector3(...moving.position).add(nearest.delta).toArray();
    return true;
  }

  snapModule(id: string): boolean {
    const moving = this.modules.get(id);
    const nearest = this.snapCandidate(id, 1.05);
    if (!moving || !nearest) return false;

    moving.rotationY = nearest.rotationY;
    moving.position = new Vector3(...moving.position).add(nearest.delta).toArray();

    const axisY = new Vector3(0, 1, 0);
    const worldPort = (m: ModuleInstance, p: PortDefinition) =>
      new Vector3(...p.position).applyAxisAngle(axisY, m.rotationY).add(new Vector3(...m.position));
    const worldAxis = (m: ModuleInstance, p: PortDefinition) =>
      new Vector3(...p.axis).applyAxisAngle(axisY, m.rotationY);

    const pairs: {
      movingPort: PortDefinition;
      other: ModuleInstance;
      otherPort: PortDefinition;
      distance: number;
    }[] = [];

    for (const movingPort of MODULES[moving.type].ports) {
      if (this.isPortUsed(id, movingPort.id)) continue;
      for (const other of this.modules.values()) {
        if (other.id === id) continue;
        for (const otherPort of MODULES[other.type].ports) {
          if (this.isPortUsed(other.id, otherPort.id) || !portsCompatible(movingPort, otherPort)) continue;
          if (worldAxis(moving, movingPort).dot(worldAxis(other, otherPort)) >= -.72) continue;
          const distance = worldPort(other, otherPort).distanceTo(worldPort(moving, movingPort));
          if (distance <= .16) pairs.push({ movingPort, other, otherPort, distance });
        }
      }
    }

    pairs.sort((a, b) => a.distance - b.distance);
    let connected = false;
    for (const pair of pairs) {
      if (this.isPortUsed(id, pair.movingPort.id) || this.isPortUsed(pair.other.id, pair.otherPort.id)) continue;
      const connection = normalizeConnection(moving, pair.movingPort, pair.other, pair.otherPort);
      if (!connection) continue;
      this.connect({ id: crypto.randomUUID(), ...connection });
      connected = true;
    }
    return connected;
  }

  findPathByTypes(required: ModuleType[], accepts: (path: ModuleInstance[]) => boolean = () => true): boolean {
    if (!required.length) return true;
    const starts = [...this.modules.values()].filter(m => m.type === required[0]);
    const visit = (id: string, index: number, path: ModuleInstance[]): boolean => {
      if (index === required.length - 1) return accepts(path);
      for (const edge of this.outgoing(id)) {
        if (path.some(m => m.id === edge.toModuleId)) continue;
        const next = this.modules.get(edge.toModuleId);
        if (!next || next.type !== required[index + 1]) continue;
        if (visit(next.id, index + 1, [...path, next])) return true;
      }
      return false;
    };
    return starts.some(start => visit(start.id, 0, [start]));
  }
  serialize() {
    return {
      version: 2,
      modules: [...this.modules.values()],
      connections: [...this.connections.values()],
    };
  }
  restore(data: { version?: number; modules?: ModuleInstance[]; connections?: Connection[] }) {
    this.modules.clear(); this.connections.clear();

    for (const m of data.modules ?? []) {
      if (!MODULES[m.type] || !m.id || !Array.isArray(m.position) || m.position.length !== 3) continue;
      this.modules.set(m.id, {
        ...m,
        position: [Number(m.position[0]) || 0, Number(m.position[1]) || .65, Number(m.position[2]) || 0],
        rotationY: Number.isFinite(m.rotationY) ? m.rotationY : 0,
        switchOn: (m.type === 'switch' || m.type === 'valve') ? m.switchOn !== false : m.switchOn,
      });
    }

    const addValidated = (c: Connection) => {
      const from = this.modules.get(c.fromModuleId), to = this.modules.get(c.toModuleId);
      if (!from || !to || from.id === to.id) return;
      const fromPort = MODULES[from.type].ports.find(p => p.id === c.fromPortId);
      const toPort = MODULES[to.type].ports.find(p => p.id === c.toPortId);
      if (!fromPort || !toPort || !portsCompatible(fromPort, toPort)) return;
      const normalized = normalizeConnection(from, fromPort, to, toPort);
      if (!normalized || normalized.signal !== c.signal) return;
      if (this.isPortUsed(normalized.fromModuleId, normalized.fromPortId) || this.isPortUsed(normalized.toModuleId, normalized.toPortId)) return;
      const id = c.id || crypto.randomUUID();
      this.connections.set(id, { id, ...normalized });
    };

    if ((data.version ?? 1) >= 2) {
      for (const c of data.connections ?? []) addValidated(c);
      return;
    }

    // v1 projects were saved by the old drag code, which could silently drop one
    // side of a two-port module. Rebuild connections from the physical layout so
    // existing users do not keep a visually assembled but electrically open machine.
    for (const m of this.modules.values()) this.snapModule(m.id);
  }
}
