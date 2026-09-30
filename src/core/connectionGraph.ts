import { MODULES } from './moduleRegistry';
import type {
  Connection,
  ModuleInstance,
  ModulePort,
  ModuleType,
  SignalType,
  Vector3Tuple,
} from './types';

export function portsCompatible(a: ModulePort, b: ModulePort) {
  if (a.signal !== b.signal) return false;
  if (a.direction === 'bi' && b.direction === 'bi') return true;
  return (
    (a.direction === 'out' && b.direction === 'in') ||
    (a.direction === 'in' && b.direction === 'out')
  );
}

export function modulePortsCompatible(
  _aType: ModuleType,
  a: ModulePort,
  _bType: ModuleType,
  b: ModulePort,
) {
  return portsCompatible(a, b);
}

export function normalizeConnection(
  a: ModuleInstance,
  aPort: ModulePort,
  b: ModuleInstance,
  bPort: ModulePort,
): Omit<Connection, 'id'> | null {
  if (!portsCompatible(aPort, bPort)) return null;

  if (aPort.direction === 'out' && bPort.direction === 'in') {
    return {
      fromModuleId: a.id,
      fromPortId: aPort.id,
      toModuleId: b.id,
      toPortId: bPort.id,
      signal: aPort.signal,
    };
  }

  if (bPort.direction === 'out' && aPort.direction === 'in') {
    return {
      fromModuleId: b.id,
      fromPortId: bPort.id,
      toModuleId: a.id,
      toPortId: aPort.id,
      signal: aPort.signal,
    };
  }

  return {
    fromModuleId: a.id,
    fromPortId: aPort.id,
    toModuleId: b.id,
    toPortId: bPort.id,
    signal: aPort.signal,
  };
}

function rotateY(v: Vector3Tuple, angle: number): Vector3Tuple {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    v[0] * c + v[2] * s,
    v[1],
    -v[0] * s + v[2] * c,
  ];
}

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vector3Tuple) {
  return Math.hypot(v[0], v[1], v[2]);
}

function dot(a: Vector3Tuple, b: Vector3Tuple) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

type SnapCandidate = {
  movingPort: ModulePort;
  otherPort: ModulePort;
  other: ModuleInstance;
  position: Vector3Tuple;
  rotationY: number;
  distance: number;
};

export class ConnectionGraph {
  readonly modules = new Map<string, ModuleInstance>();
  readonly connections = new Map<string, Connection>();

  addModule(module: ModuleInstance) {
    this.modules.set(module.id, module);
  }

  removeModule(id: string) {
    this.disconnectModule(id);
    this.modules.delete(id);
  }

  connect(connection: Connection) {
    this.connections.set(connection.id, connection);
  }

  disconnectModule(id: string) {
    for (const [key, connection] of this.connections) {
      if (connection.fromModuleId === id || connection.toModuleId === id) {
        this.connections.delete(key);
      }
    }
  }

  incoming(id: string, signal?: SignalType) {
    return [...this.connections.values()].filter(
      connection =>
        connection.toModuleId === id &&
        (!signal || connection.signal === signal),
    );
  }

  outgoing(id: string, signal?: SignalType) {
    return [...this.connections.values()].filter(
      connection =>
        connection.fromModuleId === id &&
        (!signal || connection.signal === signal),
    );
  }

  isPortUsed(moduleId: string, portId: string) {
    return [...this.connections.values()].some(
      connection =>
        (connection.fromModuleId === moduleId && connection.fromPortId === portId) ||
        (connection.toModuleId === moduleId && connection.toPortId === portId),
    );
  }

  private snapCandidate(id: string, maxDistance: number) {
    const moving = this.modules.get(id);
    if (!moving) return null;

    let best: SnapCandidate | null = null;

    for (const other of this.modules.values()) {
      if (other.id === moving.id) continue;

      for (const movingPort of MODULES[moving.type].ports) {
        if (this.isPortUsed(moving.id, movingPort.id)) continue;

        for (const otherPort of MODULES[other.type].ports) {
          if (this.isPortUsed(other.id, otherPort.id)) continue;
          if (!modulePortsCompatible(moving.type, movingPort, other.type, otherPort)) continue;

          const otherWorldPort = add(other.position, rotateY(otherPort.position, other.rotationY));
          const otherWorldAxis = rotateY(otherPort.axis, other.rotationY);

          for (let quarter = 0; quarter < 4; quarter++) {
            const rotationY = quarter * Math.PI / 2;
            const movingAxis = rotateY(movingPort.axis, rotationY);
            if (dot(movingAxis, otherWorldAxis) > -.92) continue;

            const movingOffset = rotateY(movingPort.position, rotationY);
            const position = sub(otherWorldPort, movingOffset);
            const distance = length(sub(position, moving.position));
            if (distance > maxDistance) continue;

            if (!best || distance < best.distance) {
              best = {
                movingPort,
                otherPort,
                other,
                position,
                rotationY,
                distance,
              };
            }
          }
        }
      }
    }

    return best;
  }

  attachModuleToTarget(id: string, targetId: string) {
    const moving = this.modules.get(id);
    const target = this.modules.get(targetId);
    if (!moving || !target || moving.id === target.id) return false;

    let best: SnapCandidate | null = null;

    for (const movingPort of MODULES[moving.type].ports) {
      if (this.isPortUsed(moving.id, movingPort.id)) continue;

      for (const targetPort of MODULES[target.type].ports) {
        if (this.isPortUsed(target.id, targetPort.id)) continue;
        if (!modulePortsCompatible(moving.type, movingPort, target.type, targetPort)) continue;

        const targetWorldPort = add(target.position, rotateY(targetPort.position, target.rotationY));
        const targetWorldAxis = rotateY(targetPort.axis, target.rotationY);

        for (let quarter = 0; quarter < 4; quarter++) {
          const rotationY = quarter * Math.PI / 2;
          const movingAxis = rotateY(movingPort.axis, rotationY);
          if (dot(movingAxis, targetWorldAxis) > -.92) continue;

          const movingOffset = rotateY(movingPort.position, rotationY);
          const position = sub(targetWorldPort, movingOffset);
          const distance = length(sub(position, moving.position));

          if (!best || distance < best.distance) {
            best = {
              movingPort,
              otherPort: targetPort,
              other: target,
              position,
              rotationY,
              distance,
            };
          }
        }
      }
    }

    if (!best) return false;

    moving.position = best.position;
    moving.rotationY = best.rotationY;

    const normalized = normalizeConnection(
      moving,
      best.movingPort,
      best.other,
      best.otherPort,
    );
    if (!normalized) return false;

    this.connect({ id: crypto.randomUUID(), ...normalized });
    return true;
  }

  snapModule(id: string) {
    const moving = this.modules.get(id);
    if (!moving) return false;

    const best = this.snapCandidate(id, 1.45);
    if (!best) return false;

    moving.position = best.position;
    moving.rotationY = best.rotationY;

    const normalized = normalizeConnection(
      moving,
      best.movingPort,
      best.other,
      best.otherPort,
    );
    if (!normalized) return false;

    this.connect({ id: crypto.randomUUID(), ...normalized });
    return true;
  }

  findPathByTypes(types: ModuleType[]) {
    if (!types.length) return false;

    const starts = [...this.modules.values()].filter(module => module.type === types[0]);

    const walk = (id: string, index: number, seen: Set<string>): boolean => {
      if (index === types.length - 1) return true;

      for (const edge of this.outgoing(id)) {
        const next = this.modules.get(edge.toModuleId);
        if (!next || seen.has(next.id) || next.type !== types[index + 1]) continue;
        const nextSeen = new Set(seen);
        nextSeen.add(next.id);
        if (walk(next.id, index + 1, nextSeen)) return true;
      }

      return false;
    };

    return starts.some(start => walk(start.id, 0, new Set([start.id])));
  }

  serialize() {
    return {
      version: 1,
      modules: [...this.modules.values()],
      connections: [...this.connections.values()],
    };
  }

  restore(data: {
    version?: number;
    modules?: ModuleInstance[];
    connections?: Connection[];
  }) {
    this.modules.clear();
    this.connections.clear();

    for (const module of data.modules ?? []) {
      if (!MODULES[module.type]) continue;
      if (!module.id || !Array.isArray(module.position) || module.position.length !== 3) continue;
      this.modules.set(module.id, {
        id: module.id,
        type: module.type,
        position: [
          Number(module.position[0]) || 0,
          Number(module.position[1]) || .65,
          Number(module.position[2]) || 0,
        ],
        rotationY: Number.isFinite(module.rotationY) ? module.rotationY : 0,
        switchOn: module.type === 'switch' ? module.switchOn !== false : undefined,
      });
    }

    for (const connection of data.connections ?? []) {
      const from = this.modules.get(connection.fromModuleId);
      const to = this.modules.get(connection.toModuleId);
      if (!from || !to || from.id === to.id) continue;

      const fromPort = MODULES[from.type].ports.find(port => port.id === connection.fromPortId);
      const toPort = MODULES[to.type].ports.find(port => port.id === connection.toPortId);
      if (!fromPort || !toPort) continue;

      const normalized = normalizeConnection(from, fromPort, to, toPort);
      if (!normalized || normalized.signal !== connection.signal) continue;
      if (this.isPortUsed(normalized.fromModuleId, normalized.fromPortId)) continue;
      if (this.isPortUsed(normalized.toModuleId, normalized.toPortId)) continue;

      this.connections.set(connection.id || crypto.randomUUID(), {
        id: connection.id || crypto.randomUUID(),
        ...normalized,
      });
    }
  }
}
