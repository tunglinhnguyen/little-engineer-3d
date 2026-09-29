import { Vector3 } from 'three';
import { MODULES } from './moduleRegistry';
import type { Connection, ModuleInstance, ModuleType } from './types';
import { ConnectionGraph } from './connectionGraph';

export type RouteKind = 'road' | 'rail' | 'runway';

const ROUTE_TYPES: Record<RouteKind, Set<ModuleType>> = {
  road: new Set<ModuleType>(['road-straight', 'road-curve', 'road-crossing', 'road-t-junction', 'bridge']),
  rail: new Set<ModuleType>(['rail-straight', 'rail-curve', 'rail-crossing', 'rail-switch', 'train-station', 'rail-bridge']),
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
  return module.type === 'bridge' || module.type === 'rail-bridge' ? .72 : 0;
}

function routePoint(module: ModuleInstance, local: [number, number, number]) {
  const point = worldPoint(module, local);
  point.y += routeHeightOffset(module);
  return point;
}

function center(module: ModuleInstance) {
  return new Vector3(
    module.position[0],
    module.position[1] + routeHeightOffset(module),
    module.position[2],
  );
}

function connectionPoint(graph: ConnectionGraph, connection: Connection, moduleId: string): Vector3 | null {
  const module = graph.modules.get(moduleId);
  if (!module) return null;
  const portId = connection.fromModuleId === moduleId ? connection.fromPortId : connection.toPortId;
  const port = MODULES[module.type].ports.find(p => p.id === portId);
  return port ? routePoint(module, port.position) : null;
}

function connectionMidpoint(graph: ConnectionGraph, connection: Connection) {
  const a = connectionPoint(graph, connection, connection.fromModuleId);
  const b = connectionPoint(graph, connection, connection.toModuleId);
  if (!a) return b;
  if (!b) return a;
  return a.add(b).multiplyScalar(.5);
}

function connectionBetween(graph: ConnectionGraph, a: string, b: string) {
  return [...graph.connections.values()].find(c =>
    c.signal === 'structural' &&
    ((c.fromModuleId === a && c.toModuleId === b) ||
      (c.fromModuleId === b && c.toModuleId === a))
  );
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

function nearestRouteModule(
  graph: ConnectionGraph,
  vehicle: ModuleInstance,
  allowed: Set<ModuleType>,
  maxDistance: number,
) {
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

function curveRadius(module: ModuleInstance) {
  const ports = MODULES[module.type].ports.filter(p => p.signal === 'structural');
  const radius = ports.reduce((best, p) => Math.max(best, Math.hypot(p.position[0], p.position[2])), 0);
  return radius || (module.type === 'road-curve' ? .925 : 1.15);
}

function singleModulePath(module: ModuleInstance, kind: RouteKind): Vector3[] {
  const def = MODULES[module.type];

  if (kind === 'runway') {
    const half = Math.max(1.7, def.size[2] * .46);
    return [
      routePoint(module, [0, 0, -half]),
      routePoint(module, [0, 0, 0]),
      routePoint(module, [0, 0, half]),
    ];
  }

  if (module.type === 'road-curve' || module.type === 'rail-curve') {
    const radius = curveRadius(module);
    const points: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const angle = (Math.PI / 2) * (1 - i / 12);
      points.push(routePoint(module, [
        Math.cos(angle) * radius,
        0,
        -Math.sin(angle) * radius,
      ]));
    }
    return points;
  }

  const structuralPorts = def.ports.filter(p => p.signal === 'structural');
  if (structuralPorts.length === 2) {
    return [
      routePoint(module, structuralPorts[0].position),
      center(module),
      routePoint(module, structuralPorts[1].position),
    ];
  }

  const alongZ = def.size[2] >= def.size[0];
  const half = Math.max(1, (alongZ ? def.size[2] : def.size[0]) * .46);
  return alongZ
    ? [routePoint(module, [0, 0, -half]), center(module), routePoint(module, [0, 0, half])]
    : [routePoint(module, [-half, 0, 0]), center(module), routePoint(module, [half, 0, 0])];
}

function traversalThroughModule(
  graph: ConnectionGraph,
  module: ModuleInstance,
  kind: RouteKind,
  previousConnection?: Connection,
  nextConnection?: Connection,
  approachPoint?: Vector3,
) {
  const base = singleModulePath(module, kind);
  const entry = previousConnection ? connectionMidpoint(graph, previousConnection) : null;
  const exit = nextConnection ? connectionMidpoint(graph, nextConnection) : null;

  // Junction pieces can have 3–4 exits. Route through the exact ports chosen
  // by the current branch instead of assuming a fixed axis.
  const structuralCount = MODULES[module.type].ports.filter(p => p.signal === 'structural').length;
  if (structuralCount > 2 && (entry || exit)) {
    if (entry && exit) return [entry, center(module), exit];
    const known = entry ?? exit!;
    const alternatives = MODULES[module.type].ports
      .filter(p => p.signal === 'structural')
      .map(p => routePoint(module, p.position))
      .filter(p => p.distanceTo(known) > .15);
    const other = alternatives.sort((a, b) => b.distanceTo(known) - a.distanceTo(known))[0] ?? center(module);
    return entry ? [entry, center(module), other] : [other, center(module), exit!];
  }

  let oriented = base.map(p => p.clone());
  const reference = entry ?? approachPoint;
  if (reference && oriented.length > 1) {
    const firstDistance = oriented[0].distanceTo(reference);
    const lastDistance = oriented[oriented.length - 1].distanceTo(reference);
    if (lastDistance < firstDistance) oriented.reverse();
  } else if (exit && oriented.length > 1) {
    const firstDistance = oriented[0].distanceTo(exit);
    const lastDistance = oriented[oriented.length - 1].distanceTo(exit);
    if (firstDistance < lastDistance) oriented.reverse();
  }

  if (entry) oriented[0] = entry;
  if (exit) oriented[oriented.length - 1] = exit;
  return oriented;
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
    for (const neighbor of structuralNeighbors(graph, id, allowed)) {
      if (component.has(neighbor.id)) continue;
      component.add(neighbor.id);
      queue.push(neighbor.id);
    }
  }

  if (component.size === 1) {
    return singleModulePath(nearest, kind).map(p => p.toArray() as [number, number, number]);
  }

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
      .filter((n: { id: string; connection: Connection }) => component.has(n.id) && n.id !== previous && !used.has(n.id));

    if (!options.length) break;
    if (previous) {
      const previousCenter = center(graph.modules.get(previous)!);
      const currentCenter = center(graph.modules.get(current)!);
      const incoming = currentCenter.clone().sub(previousCenter).normalize();
      options.sort((a: { id: string; connection: Connection }, b: { id: string; connection: Connection }) => {
        const da = center(graph.modules.get(a.id)!).sub(currentCenter).normalize();
        const db = center(graph.modules.get(b.id)!).sub(currentCenter).normalize();
        return incoming.angleTo(da) - incoming.angleTo(db);
      });
    }

    const currentModule = graph.modules.get(current)!;
    const chosen =
      currentModule.type === 'rail-switch' && currentModule.switchOn === true && options.length > 1
        ? options[options.length - 1]
        : options[0];
    previous = current;
    current = chosen.id;
  }

  const points: Vector3[] = [];
  const push = (point: Vector3) => {
    if (!points.length || points[points.length - 1].distanceTo(point) > .055) points.push(point.clone());
  };

  for (let i = 0; i < ordered.length; i++) {
    const module = graph.modules.get(ordered[i])!;
    const previousConnection = i > 0 ? connectionBetween(graph, ordered[i - 1], ordered[i]) : undefined;
    const nextConnection = i < ordered.length - 1 ? connectionBetween(graph, ordered[i], ordered[i + 1]) : undefined;
    const segment = traversalThroughModule(
      graph,
      module,
      kind,
      previousConnection,
      nextConnection,
      points[points.length - 1] ?? center(vehicle),
    );
    segment.forEach(push);
  }

  return points.map(p => p.toArray() as [number, number, number]);
}
