import { ConnectionGraph } from './connectionGraph';
import { buildVehicleRoute } from './worldRoutes';

export function vehicleCanTravel(
  graph: ConnectionGraph,
  vehicleId: string,
  rpm: Map<string, number>,
) {
  const vehicle = graph.modules.get(vehicleId);

  if (!vehicle || vehicle.type !== 'car-base') {
    return { ready: false, route: [], message: 'Không phải khung ô tô.' };
  }

  if (!rpm.has(vehicleId)) {
    return { ready: false, route: [], message: 'Khung xe chưa nhận mô-men.' };
  }

  const route = buildVehicleRoute(graph, vehicleId);
  if (route.length < 2) {
    return { ready: false, route: [], message: 'Đặt xe gần đường thử.' };
  }

  return { ready: true, route, message: 'Xe sẵn sàng chạy.' };
}
