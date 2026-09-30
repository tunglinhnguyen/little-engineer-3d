import { ConnectionGraph } from './connectionGraph';
import { assemblyCount, isInstalled, REQUIRED_PARTS } from './assembly';
import { buildRoute } from './worldRoutes';
import { CHASSIS_HEIGHT, ROAD_HEIGHT } from './layout';

export function vehicleCanTravel(graph:ConnectionGraph,vehicleId:string,rpm:Map<string,number>){
 const car=graph.modules.get(vehicleId);const route=buildRoute(graph,vehicleId);
 let message='Xe sẵn sàng chạy.';
 if(!car||car.type!=='car-base')message='Chưa có khung xe.';
 else if(assemblyCount(graph)!==REQUIRED_PARTS)message='Ráp đủ 2 trục, 4 bánh và các bộ phận trên khung.';
 else if(![...graph.modules.values()].filter(m=>m.type==='wheel'&&m.slotKey?.startsWith('wheel-r')&&isInstalled(graph,m)).every(m=>(rpm.get(m.id)??0)!==0))message='Chưa có truyền động tới hai bánh sau. Bật công tắc và kiểm tra mạch kín.';
 else if(route.length<3.2||Math.abs(car.position[1]-(CHASSIS_HEIGHT+ROAD_HEIGHT))>.02)message='Giữ và kéo cả xe lên đường thử.';
 return {ready:message==='Xe sẵn sàng chạy.',route:route.points,message};
}
