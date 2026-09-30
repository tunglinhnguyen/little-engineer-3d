import { ConnectionGraph } from './connectionGraph';
import type { ModuleInstance, Vector3Tuple } from './types';

function distanceXZ(a: ModuleInstance, b: ModuleInstance) {
  return Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
}

function roadComponent(graph: ConnectionGraph, startId: string) {
  const seen = new Set<string>([startId]);
  const queue = [startId];

  while (queue.length) {
    const id = queue.shift()!;
    const edges = [...graph.incoming(id, 'structural'), ...graph.outgoing(id, 'structural')];

    for (const edge of edges) {
      const otherId = edge.fromModuleId === id ? edge.toModuleId : edge.fromModuleId;
      if (seen.has(otherId)) continue;
      const other = graph.modules.get(otherId);
      if (!other || other.type !== 'road-straight') continue;
      seen.add(otherId);
      queue.push(otherId);
    }
  }

  return [...seen]
    .map(id => graph.modules.get(id)!)
    .sort((a, b) => a.position[2] - b.position[2]);
}

export function buildVehicleRoute(graph: ConnectionGraph, vehicleId: string): Vector3Tuple[] {
  const vehicle = graph.modules.get(vehicleId);
  if (!vehicle || vehicle.type !== 'car-base') return [];

  const roads = [...graph.modules.values()].filter(module => module.type === 'road-straight');
  if (!roads.length) return [];

  let nearest = roads[0];
  let nearestDistance = distanceXZ(vehicle, nearest);

  for (const road of roads.slice(1)) {
    const distance = distanceXZ(vehicle, road);
    if (distance < nearestDistance) {
      nearest = road;
      nearestDistance = distance;
    }
  }

  if (nearestDistance > 4.2) return [];

  const component = roadComponent(graph, nearest.id);
  if (component.length < 2) return [];

  const first = component[0];
  const last = component[component.length - 1];

  const route: Vector3Tuple[] = [
    [first.position[0], vehicle.position[1], first.position[2] - 1.35],
  ];

  for (const road of component) {
    route.push([road.position[0], vehicle.position[1], road.position[2]]);
  }

  route.push([last.position[0], vehicle.position[1], last.position[2] + 1.35]);
  return route;
}
