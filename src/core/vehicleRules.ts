import { MODULES } from './moduleRegistry';
import { ConnectionGraph } from './connectionGraph';
import { buildVehicleRoute, routeKindForVehicle, type RouteKind } from './worldRoutes';
import type { ModuleInstance, ModuleType } from './types';

export type VehicleInfrastructureKind = RouteKind | 'water' | 'helipad' | 'free';

export interface VehicleInfrastructureStatus {
  ready: boolean;
  kind: VehicleInfrastructureKind;
  route: [number, number, number][];
  anchorId?: string;
  message: string;
}

const ROAD_NAMES = new Set<ModuleType>(['road-straight', 'road-curve', 'bridge']);
const WATER_NAMES = new Set<ModuleType>(['water-tile', 'river-tile', 'sea-tile']);

function planarDistance(a: ModuleInstance, b: ModuleInstance) {
  return Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
}

function nearestOf(
  graph: ConnectionGraph,
  vehicle: ModuleInstance,
  types: Set<ModuleType>,
  maxDistance: number,
) {
  let best: ModuleInstance | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const module of graph.modules.values()) {
    if (!types.has(module.type)) continue;
    const d = planarDistance(vehicle, module);
    if (d < distance) {
      best = module;
      distance = d;
    }
  }
  return best && distance <= maxDistance ? best : undefined;
}

export function vehicleInfrastructureStatus(
  graph: ConnectionGraph,
  vehicleId: string,
): VehicleInfrastructureStatus {
  const vehicle = graph.modules.get(vehicleId);
  if (!vehicle || MODULES[vehicle.type].behavior.kind !== 'vehicle') {
    return { ready: false, kind: 'free', route: [], message: 'Đây không phải mô-đun phương tiện.' };
  }

  const routeKind = routeKindForVehicle(vehicle.type);
  if (routeKind) {
    const route = buildVehicleRoute(graph, vehicleId);
    const label =
      routeKind === 'road' ? 'đường ô tô' :
      routeKind === 'rail' ? 'đường ray' :
      'đường băng';
    return route.length >= 2
      ? { ready: true, kind: routeKind, route, message: 'Đã đặt đúng gần ' + label + '.' }
      : {
          ready: false,
          kind: routeKind,
          route: [],
          message: 'Cần đặt phương tiện sát ' + label + ' đã ghép đúng khớp.',
        };
  }

  if (vehicle.type === 'boat') {
    const water = nearestOf(graph, vehicle, WATER_NAMES, 4.4);
    return water
      ? { ready: true, kind: 'water', route: [], anchorId: water.id, message: 'Tàu đang ở vùng nước phù hợp.' }
      : { ready: false, kind: 'water', route: [], message: 'Tàu cần được đặt trên Biển, Hồ nước hoặc Đoạn sông.' };
  }

  if (vehicle.type === 'helicopter') {
    const pad = nearestOf(graph, vehicle, new Set<ModuleType>(['helipad']), 4.2);
    return pad
      ? { ready: true, kind: 'helipad', route: [], anchorId: pad.id, message: 'Trực thăng đang ở gần bãi đáp.' }
      : { ready: false, kind: 'helipad', route: [], message: 'Trực thăng cần một Bãi đáp ở gần để cất/hạ cánh.' };
  }

  if (vehicle.type === 'crane' || vehicle.type === 'excavator' || vehicle.type === 'bulldozer') {
    return { ready: true, kind: 'free', route: [], message: 'Máy công trình có thể vận hành tại chỗ.' };
  }

  return { ready: true, kind: 'free', route: [], message: 'Phương tiện có thể vận hành tại chỗ.' };
}

export function vehicleCanTravel(graph: ConnectionGraph, vehicleId: string, rpm: Map<string, number>) {
  const infrastructure = vehicleInfrastructureStatus(graph, vehicleId);
  const driven = rpm.has(vehicleId) && Math.abs(rpm.get(vehicleId) ?? 0) > .01;
  return {
    ready: driven && infrastructure.ready,
    driven,
    infrastructure,
    message: !driven
      ? 'Chưa nhận mô-men từ mô tơ/hộp số.'
      : infrastructure.message,
  };
}

export function hasAnyRoad(graph: ConnectionGraph) {
  return [...graph.modules.values()].some(m => ROAD_NAMES.has(m.type));
}
