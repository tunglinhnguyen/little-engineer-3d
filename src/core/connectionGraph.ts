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
  findPathByTypes(required: ModuleType[]): boolean {
    if (!required.length) return true;
    const starts = [...this.modules.values()].filter(m => m.type === required[0]);
    const visit = (id: string, index: number, seen: Set<string>): boolean => {
      if (index === required.length - 1) return true;
      for (const edge of this.outgoing(id)) {
        if (seen.has(edge.toModuleId)) continue;
        const next = this.modules.get(edge.toModuleId);
        if (!next || next.type !== required[index + 1]) continue;
        const nextSeen = new Set(seen); nextSeen.add(next.id);
        if (visit(next.id, index + 1, nextSeen)) return true;
      }
      return false;
    };
    return starts.some(start => visit(start.id, 0, new Set([start.id])));
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
