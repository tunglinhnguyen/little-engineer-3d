import type { ConnectionGraph } from './connectionGraph';
import type { GearMode, ModuleInstance, ModuleType, Vector3Tuple, VehicleKind, VehicleProfile } from './types';
import { LOCAL_SLOTS } from './layout';

export const VEHICLE_KINDS:VehicleKind[]=['car','truck','tractor'];
export const VEHICLE_NAMES:Record<VehicleKind,string>={car:'Xe con',truck:'Xe tải',tractor:'Đầu kéo container'};
export const VEHICLE_COLORS=['#3078a0','#d47945','#739e58','#8d70b0','#cf6578','#279a9c'];
export const GEAR_RATIOS:Record<GearMode,number>={power:-.25,balanced:-.5,speed:-1};
export const GEAR_NAMES:Record<GearMode,string>={power:'Số khỏe',balanced:'Cân bằng',speed:'Số nhanh'};
export interface MountSlot {key:string;type:ModuleType;position:Vector3Tuple;label:string;required:boolean}
export function vehicleKind(g:ConnectionGraph,id:string):VehicleKind{return g.vehicles.get(id)?.kind??g.modules.get(id)?.vehicleKind??'car';}
export function vehicleSpec(kind:VehicleKind){
 return kind==='truck'?{front:1.45,rear:-1.15,minX:-2.55,maxX:1.95,mass:8,total:16,wheels:6}:
 kind==='tractor'?{front:1.25,rear:-1.15,minX:-1.8,maxX:1.8,mass:6,total:20,wheels:8}:
 {front:1.15,rear:-1.15,minX:-1.6,maxX:1.6,mass:4,total:12,wheels:4};
}
export function chassisSlots(kind:VehicleKind):MountSlot[]{
 const slots=Object.entries(LOCAL_SLOTS).map(([key,p])=>({key,type:key as ModuleType,position:[...p] as Vector3Tuple,label:key,required:true}));
 slots.find(s=>s.key==='front-axle')!.position[0]=vehicleSpec(kind).front;
 if(kind==='truck')slots.push({key:'tag-axle',type:'idler-axle',position:[-2.05,-.29,0],label:'Trục phụ xe tải',required:true},{key:'cargo-bed',type:'cargo-bed',position:[-.65,.57,0],label:'Thùng hàng',required:false});
 if(kind==='tractor')slots.push({key:'hitch',type:'hitch',position:[-1.15,.10,0],label:'Mâm kéo',required:false});
 return slots;
}
export const TRAILER_SLOTS:MountSlot[]=[
 {key:'trailer-front-axle',type:'idler-axle',position:[-2.65,-.39,0],label:'Trục trước rơ-moóc',required:true},
 {key:'trailer-rear-axle',type:'idler-axle',position:[-3.45,-.39,0],label:'Trục sau rơ-moóc',required:true},
];
export function axleWheelKeys(m:ModuleInstance):string[]{
 if(m.type==='front-axle')return ['wheel-fl','wheel-fr'];
 if(m.type==='drive-axle')return ['wheel-rl','wheel-rr'];
 if(m.type==='idler-axle')return m.slotKey==='trailer-front-axle'?['wheel-tfl','wheel-tfr']:m.slotKey==='trailer-rear-axle'?['wheel-trl','wheel-trr']:['wheel-ml','wheel-mr'];
 return [];
}
export function newVehicle(g:ConnectionGraph,kind:VehicleKind,id='car-'+crypto.randomUUID().slice(0,8)):VehicleProfile{
 const profile:VehicleProfile={id,kind,name:VEHICLE_NAMES[kind]+' '+(g.vehicles.size+1),color:VEHICLE_COLORS[g.vehicles.size%VEHICLE_COLORS.length],parked:false,cargo:0,experiments:[]};
 g.vehicles.set(id,profile);g.activeVehicleId=id;return profile;
}
export function vehicleForModule(g:ConnectionGraph,m:ModuleInstance|undefined):string|undefined{
 if(!m)return undefined;if(m.type==='car-base')return m.id;if(m.vehicleId)return m.vehicleId;
 const seen=new Set<string>();let node=m;
 while(node.parentId&&!seen.has(node.id)){seen.add(node.id);const p=g.modules.get(node.parentId);if(!p)break;if(p.type==='car-base')return p.id;node=p;}
 return undefined;
}
export function belongsToVehicle(g:ConnectionGraph,m:ModuleInstance,id:string){return vehicleForModule(g,m)===id;}
export function vehicleParts(g:ConnectionGraph,id:string,type?:ModuleType){return [...g.modules.values()].filter(m=>belongsToVehicle(g,m,id)&&(!type||m.type===type));}
export function vehiclePalette(kind:VehicleKind):ModuleType[]{
 const base:ModuleType[]=['car-base','battery','switch','motor','gearbox','differential','front-axle','drive-axle','wheel'];
 return kind==='truck'?[...base,'idler-axle','cargo-bed']:kind==='tractor'?[...base,'hitch','trailer','idler-axle']:base;
}
export function maxParts(kind:VehicleKind,type:ModuleType){return type==='wheel'?vehicleSpec(kind).wheels:type==='idler-axle'?(kind==='tractor'?2:kind==='truck'?1:0):vehiclePalette(kind).includes(type)?1:0;}
