import { Vector3 } from 'three';
import { MODULES } from './moduleRegistry';
import type { Connection, ModuleInstance, ModuleType } from './types';
import { ConnectionGraph } from './connectionGraph';

export type RouteKind = 'road' | 'rail' | 'runway';

const ROUTE_TYPES: Record<RouteKind, Set<ModuleType>> = {
  road: new Set<ModuleType>(['road-straight', 'road-curve', 'bridge']),
  rail: new Set<ModuleType>(['rail-straight', 'rail-curve', 'rail-crossing', 'bridge']),
  runway: new Set<ModuleType>(['runway']),
};

export function routeKindForVehicle(type: ModuleType): RouteKind | null {
  if (type === 'train-engine') return 'rail';
  if (type === 'airplane') return 'runway';
  if (type === 'car-base' || type === 'motorcycle-base' || type === 'firetruck') return 'road';
  return null;
}

function worldPoint(module: ModuleInstance, local: [number, number, number]) {
  const c = Math.cos(module.rotationY), s = Math.sin(module.rotationY);
  const [x, y, z] = local;
  return new Vector3(
    module.position[0] + x * c + z * s,
    module.position[1] + y,
    module.position[2] - x * s + z * c,
  );
}

function routeHeightOffset(module: ModuleInstance) {
  return module.type === 'bridge' ? .72 : 0;
}

function routePoint(module: ModuleInstance, local: [number, number, number]) {
  const point = worldPoint(module, local);
  point.y += routeHeightOffset(module);
  return point;
}

function connectionPoint(graph: ConnectionGraph, connection: Connection, moduleId: string): Vector3 | null {
  const module = graph.modules.get(moduleId);
  if (!module) return null;
  const portId = connection.fromModuleId === moduleId ? connection.fromPortId : connection.toPortId;
  const port = MODULES[module.type].ports.find(p => p.id === portId);
  if (!port) return null;
  return routePoint(module, port.position);
}

function center(module: ModuleInstance) {
  return new Vector3(module.position[0], module.position[1] + routeHeightOffset(module), module.position[2]);
}

function structuralNeighbors(graph: ConnectionGraph, id: string, allowed: Set<ModuleType>) {
  const out: { id: string; connection: Connection }[] = [];
  for (const connection of graph.connections.values()) {
    if (connection.signal !== 'structural') continue;
    let otherId: string | null = null;
    if (connection.fromModuleId === id) otherId = connection.toModuleId;
    else if (connection.toModuleId === id) otherId = connection.fromModuleId;
    if (!otherId) continue;
    const other = graph.modules.get(otherId);
    if (other && allowed.has(other.type)) out.push({ id: otherId, connection });
  }
  return out;
}

function nearestRouteModule(graph: ConnectionGraph, vehicle: ModuleInstance, allowed: Set<ModuleType>, maxDistance: number) {
  let best: ModuleInstance | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const module of graph.modules.values()) {
    if (!allowed.has(module.type)) continue;
    const dx = module.position[0] - vehicle.position[0];
    const dz = module.position[2] - vehicle.position[2];
    const d = dx * dx + dz * dz;
    if (d < bestDistance) {
      bestDistance = d;
      best = module;
    }
  }
  return best && bestDistance <= maxDistance * maxDistance ? best : null;
}

function singleModulePath(module: ModuleInstance, kind: RouteKind) {
  const def = MODULES[module.type];

  if (kind === 'runway') {
    const half = Math.max(1.7, def.size[2] * .46);
    return [
      routePoint(module, [0, 0, -half]).toArray() as [number, number, number],
      routePoint(module, [0, 0, 0]).toArray() as [number, number, number],
      routePoint(module, [0, 0, half]).toArray() as [number, number, number],
    ];
  }

  if (module.type === 'road-curve' || module.type === 'rail-curve') {
    const radius = module.type === 'road-curve' ? 1.28 : 1.3;
    const points: [number, number, number][] = [];
    // The rendered quarter-circle is centered on the module origin:
    // inlet at (0,-r), outlet at (+r,0).
    for (let i = 0; i <= 8; i++) {
      const angle = (Math.PI / 2) * (1 - i / 8);
      const local: [number, number, number] = [
        Math.cos(angle) * radius,
        0,
        -Math.sin(angle) * radius,
      ];
      points.push(routePoint(module, local).toArray() as [number, number, number]);
    }
    return points;
  }

  const structuralPorts = def.ports.filter(p => p.signal === 'structural');
  if (structuralPorts.length === 2) {
    return [
      routePoint(module, structuralPorts[0].position).toArray() as [number, number, number],
      center(module).toArray() as [number, number, number],
      routePoint(module, structuralPorts[1].position).toArray() as [number, number, number],
    ];
  }

  const alongZ = def.size[2] >= def.size[0];
  const half = Math.max(1, (alongZ ? def.size[2] : def.size[0]) * .46);
  const a: [number, number, number] = alongZ ? [0, 0, -half] : [-half, 0, 0];
  const b: [number, number, number] = alongZ ? [0, 0, half] : [half, 0, 0];
  return [
    routePoint(module, a).toArray() as [number, number, number],
    center(module).toArray() as [number, number, number],
    routePoint(module, b).toArray() as [number, number, number],
  ];
}

export function buildVehicleRoute(graph: ConnectionGraph, vehicleId: string): [number, number, number][] {
  const vehicle = graph.modules.get(vehicleId);
  if (!vehicle) return [];
  const kind = routeKindForVehicle(vehicle.type);
  if (!kind) return [];
  const allowed = ROUTE_TYPES[kind];
  const maxDistance = kind === 'runway' ? 5.5 : kind === 'rail' ? 3.8 : 4.2;
  const nearest = nearestRouteModule(graph, vehicle, allowed, maxDistance);
  if (!nearest) return [];

  const component = new Set<string>([nearest.id]);
  const queue = [nearest.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of structuralNeighbors(graph, id, allowed)) {
      if (component.has(n.id)) continue;
      component.add(n.id);
      queue.push(n.id);
    }
  }

  if (component.size === 1) return singleModulePath(nearest, kind);

  const endpoints = [...component].filter(id =>
    structuralNeighbors(graph, id, allowed).filter(n => component.has(n.id)).length <= 1
  );
  const startId = (endpoints.length ? endpoints : [nearest.id])
    .map(id => graph.modules.get(id)!)
    .sort((a, b) => center(a).distanceTo(center(vehicle)) - center(b).distanceTo(center(vehicle)))[0].id;

  const ordered: string[] = [];
  const used = new Set<string>();
  let previous: string | null = null;
  let current: string | null = startId;

  while (current && !used.has(current)) {
    ordered.push(current);
    used.add(current);
    const options: { id: string; connection: Connection }[] = structuralNeighbors(graph, current, allowed)
      .filter(n => component.has(n.id) && n.id !== previous && !used.has(n.id));
    if (!options.length) break;

    if (previous) {
      const p = center(graph.modules.get(previous)!);
      const here = center(graph.modules.get(current)!);
      const incoming = here.clone().sub(p).normalize();
      options.sort((a, b) => {
        const da = center(graph.modules.get(a.id)!).sub(here).normalize();
        const db = center(graph.modules.get(b.id)!).sub(here).normalize();
        return incoming.angleTo(da) - incoming.angleTo(db);
      });
    }

    previous = current;
    current = options[0].id;
  }

  const points: Vector3[] = [];
  const push = (p: Vector3) => {
    if (!points.length || points[points.length - 1].distanceTo(p) > .08) points.push(p);
  };

  push(center(graph.modules.get(ordered[0])!));
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i], b = ordered[i + 1];
    const connection = [...graph.connections.values()].find(c =>
      c.signal === 'structural' &&
      ((c.fromModuleId === a && c.toModuleId === b) || (c.fromModuleId === b && c.toModuleId === a))
    );
    if (connection) {
      const pa = connectionPoint(graph, connection, a);
      const pb = connectionPoint(graph, connection, b);
      if (pa && pb) push(pa.clone().add(pb).multiplyScalar(.5));
    }
    push(center(graph.modules.get(b)!));
  }

  return points.map(p => p.toArray() as [number, number, number]);
}
