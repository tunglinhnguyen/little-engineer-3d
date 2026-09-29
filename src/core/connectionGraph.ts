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
  snapModule(id: string): boolean {
    const moving = this.modules.get(id);
    if (!moving) return false;
    const axisY = new Vector3(0, 1, 0);
    const worldPort = (m: ModuleInstance, p: PortDefinition) =>
      new Vector3(...p.position).applyAxisAngle(axisY, m.rotationY).add(new Vector3(...m.position));
    const worldAxis = (m: ModuleInstance, p: PortDefinition) =>
      new Vector3(...p.axis).applyAxisAngle(axisY, m.rotationY);
    const candidates = () => {
      const pairs: { movingPort: PortDefinition; other: ModuleInstance; otherPort: PortDefinition; distance: number; delta: Vector3 }[] = [];
      for (const movingPort of MODULES[moving.type].ports) {
        if (this.isPortUsed(id, movingPort.id)) continue;
        for (const other of this.modules.values()) {
          if (other.id === id) continue;
          for (const otherPort of MODULES[other.type].ports) {
            if (this.isPortUsed(other.id, otherPort.id) || !portsCompatible(movingPort, otherPort)) continue;
            if (worldAxis(moving, movingPort).dot(worldAxis(other, otherPort)) >= -.6) continue;
            const delta = worldPort(other, otherPort).sub(worldPort(moving, movingPort));
            pairs.push({ movingPort, other, otherPort, distance: delta.length(), delta });
          }
        }
      }
      return pairs.sort((a, b) => a.distance - b.distance);
    };
    const nearest = candidates()[0];
    if (!nearest || nearest.distance >= .72) return false;
    // Align once, then connect every matching port without shifting the first joint.
    moving.position = new Vector3(...moving.position).add(nearest.delta).toArray();
    let connected = false;
    for (const pair of candidates()) {
      if (pair.distance > .12) continue;
      if (this.isPortUsed(id, pair.movingPort.id) || this.isPortUsed(pair.other.id, pair.otherPort.id)) continue;
      const connection = normalizeConnection(moving, pair.movingPort, pair.other, pair.otherPort);
      if (connection) { this.connect({ id: crypto.randomUUID(), ...connection }); connected = true; }
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
      version: 1,
      modules: [...this.modules.values()],
      connections: [...this.connections.values()],
    };
  }
  restore(data: { modules?: ModuleInstance[]; connections?: Connection[] }) {
    this.modules.clear(); this.connections.clear();
    for (const m of data.modules ?? []) if (MODULES[m.type]) this.modules.set(m.id, m);
    for (const c of data.connections ?? []) if (this.modules.has(c.fromModuleId) && this.modules.has(c.toModuleId)) this.connections.set(c.id, c);
  }
}
