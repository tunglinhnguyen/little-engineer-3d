import { ROAD_TYPES, MODULES } from './moduleRegistry';
import { ConnectionGraph } from './connectionGraph';
import type { Connection, ModuleInstance, Vector3Tuple } from './types';

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

function distanceXZ(a: Vector3Tuple, b: Vector3Tuple) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function worldRoadPort(module: ModuleInstance, portId: string): Vector3Tuple | null {
  const port = MODULES[module.type].ports.find(item => item.id === portId);
  if (!port) return null;
  return add(module.position, rotateY(port.position, module.rotationY));
}

function roadEdges(graph: ConnectionGraph, id: string) {
  const result: Array<{ otherId: string; connection: Connection; ownPort: string; otherPort: string }> = [];
  const module = graph.modules.get(id);
  if (!module || !ROAD_TYPES.has(module.type)) return result;

  for (const connection of graph.connections.values()) {
    let otherId: string | null = null;
    let ownPort = '';
    let otherPort = '';

    if (connection.fromModuleId === id) {
      otherId = connection.toModuleId;
      ownPort = connection.fromPortId;
      otherPort = connection.toPortId;
    } else if (connection.toModuleId === id) {
      otherId = connection.fromModuleId;
      ownPort = connection.toPortId;
      otherPort = connection.fromPortId;
    }

    if (!otherId || connection.signal !== 'structural') continue;
    const other = graph.modules.get(otherId);
    if (!other || !ROAD_TYPES.has(other.type)) continue;
    result.push({ otherId, connection, ownPort, otherPort });
  }

  return result;
}

function component(graph: ConnectionGraph, startId: string) {
  const seen = new Set<string>([startId]);
  const queue = [startId];

  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of roadEdges(graph, id)) {
      if (seen.has(edge.otherId)) continue;
      seen.add(edge.otherId);
      queue.push(edge.otherId);
    }
  }

  return [...seen];
}

function farthest(graph: ConnectionGraph, startId: string, allowed: Set<string>) {
  const queue = [startId];
  const distance = new Map<string, number>([[startId, 0]]);
  const parent = new Map<string, string | null>([[startId, null]]);

  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const d = distance.get(id)!;

    for (const edge of roadEdges(graph, id)) {
      if (!allowed.has(edge.otherId) || distance.has(edge.otherId)) continue;
      distance.set(edge.otherId, d + 1);
      parent.set(edge.otherId, id);
      queue.push(edge.otherId);
    }
  }

  let best = startId;
  for (const [id, d] of distance) {
    if (d > (distance.get(best) ?? -1)) best = id;
  }

  return { id: best, parent, distance };
}

function pathBetween(graph: ConnectionGraph, startId: string, endId: string, allowed: Set<string>) {
  const queue = [startId];
  const parent = new Map<string, string | null>([[startId, null]]);

  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    if (id === endId) break;

    for (const edge of roadEdges(graph, id)) {
      if (!allowed.has(edge.otherId) || parent.has(edge.otherId)) continue;
      parent.set(edge.otherId, id);
      queue.push(edge.otherId);
    }
  }

  if (!parent.has(endId)) return [startId];

  const path: string[] = [];
  let current: string | null = endId;
  while (current) {
    path.push(current);
    current = parent.get(current) ?? null;
  }
  return path.reverse();
}

function connectedPort(graph: ConnectionGraph, moduleId: string, neighborId: string) {
  return roadEdges(graph, moduleId).find(edge => edge.otherId === neighborId)?.ownPort ?? null;
}

function bestFreePort(module: ModuleInstance, avoidPort: string | null) {
  const ports = MODULES[module.type].ports.filter(port => port.signal === 'structural');
  if (!ports.length) return null;
  if (!avoidPort) return ports[0].id;

  const avoid = ports.find(port => port.id === avoidPort);
  if (!avoid) return ports.find(port => port.id !== avoidPort)?.id ?? avoidPort;

  let best = ports[0];
  let bestDot = Infinity;
  for (const port of ports) {
    if (port.id === avoidPort) continue;
    const dot =
      avoid.axis[0] * port.axis[0] +
      avoid.axis[1] * port.axis[1] +
      avoid.axis[2] * port.axis[2];
    if (dot < bestDot) {
      bestDot = dot;
      best = port;
    }
  }
  return best.id;
}

function localRoadPoint(module: ModuleInstance, portId: string) {
  return MODULES[module.type].ports.find(port => port.id === portId)?.position ?? [0,0,0] as Vector3Tuple;
}

function transformLocal(module: ModuleInstance, local: Vector3Tuple): Vector3Tuple {
  return add(module.position, rotateY(local, module.rotationY));
}

function sampleModule(
  module: ModuleInstance,
  entryPort: string,
  exitPort: string,
): Vector3Tuple[] {
  const a = localRoadPoint(module, entryPort);
  const b = localRoadPoint(module, exitPort);

  if (module.type === 'road-curve') {
    const control: Vector3Tuple = [0, 0, 0];
    const points: Vector3Tuple[] = [];
    for (let index = 0; index <= 8; index++) {
      const t = index / 8;
      const u = 1 - t;
      points.push(transformLocal(module, [
        u*u*a[0] + 2*u*t*control[0] + t*t*b[0],
        0,
        u*u*a[2] + 2*u*t*control[2] + t*t*b[2],
      ]));
    }
    return points;
  }

  return [
    transformLocal(module, a),
    transformLocal(module, [0,0,0]),
    transformLocal(module, b),
  ];
}

export function buildVehicleRoute(graph: ConnectionGraph, vehicleId: string): Vector3Tuple[] {
  const vehicle = graph.modules.get(vehicleId);
  if (!vehicle || vehicle.type !== 'car-base') return [];

  const roads = [...graph.modules.values()].filter(module => ROAD_TYPES.has(module.type));
  if (!roads.length) return [];

  let nearest = roads[0];
  let nearestDistance = distanceXZ(vehicle.position, nearest.position);

  for (const road of roads.slice(1)) {
    const d = distanceXZ(vehicle.position, road.position);
    if (d < nearestDistance) {
      nearest = road;
      nearestDistance = d;
    }
  }

  if (nearestDistance > 4.2) return [];

  const ids = component(graph, nearest.id);
  const allowed = new Set(ids);
  if (ids.length === 1) {
    const ports = MODULES[nearest.type].ports.filter(port => port.signal === 'structural');
    if (ports.length < 2) return [];
    return sampleModule(nearest, ports[0].id, ports[1].id);
  }

  const endA = farthest(graph, nearest.id, allowed).id;
  const endB = farthest(graph, endA, allowed).id;
  const path = pathBetween(graph, endA, endB, allowed);

  const route: Vector3Tuple[] = [];

  for (let index = 0; index < path.length; index++) {
    const id = path[index];
    const module = graph.modules.get(id)!;
    const prev = index > 0 ? path[index - 1] : null;
    const next = index < path.length - 1 ? path[index + 1] : null;

    const knownEntry = prev ? connectedPort(graph, id, prev) : null;
    const knownExit = next ? connectedPort(graph, id, next) : null;

    const entry = knownEntry ?? bestFreePort(module, knownExit);
    const exit = knownExit ?? bestFreePort(module, entry);
    if (!entry || !exit || entry === exit) continue;

    const points = sampleModule(module, entry, exit);
    if (route.length && points.length) points.shift();
    route.push(...points);
  }

  return route;
}
