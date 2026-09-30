import type { Vector3Tuple } from './types';

// A single coordinate system for the parts, connectors, road meshes and motion.
// The car faces +X. Axles and wheel bearings run along Z. Dimensions are model units.
export const WHEEL_RADIUS = .33;
export const WHEELBASE = 2.30;
export const HALF_TRACK = 1.12;
export const CHASSIS_HEIGHT = .62;
export const ROAD_HEIGHT = .12;
export const ROAD_HALF_LENGTH = 2.4;
export const ROAD_WIDTH = 3.3;
export const CURVE_RADIUS = 4.8;
export const SNAP_DISTANCE = .38;
export const LOCAL_SLOTS: Record<string, Vector3Tuple> = {
  battery: [.85,.12,.52],
  switch: [.85,.12,-.52],
  motor: [.30,.12,0],
  gearbox: [-.34,.10,0],
  differential: [-1.15,-.05,0],
  'front-axle': [1.15,-.29,0],
  'drive-axle': [-1.15,-.29,0],
};
export const WHEEL_SLOTS = ['wheel-fl','wheel-fr','wheel-rl','wheel-rr'] as const;
export const WHEEL_LOCAL: Record<string, Vector3Tuple> = {
  'wheel-fl': [0,0,HALF_TRACK], 'wheel-fr': [0,0,-HALF_TRACK],
  'wheel-rl': [0,0,HALF_TRACK], 'wheel-rr': [0,0,-HALF_TRACK],
};
export function rotateY(v: Vector3Tuple, yaw: number): Vector3Tuple {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return [v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];
}
export function add(a: Vector3Tuple,b: Vector3Tuple): Vector3Tuple {
  return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
}
export const distanceXZ=(a:Vector3Tuple,b:Vector3Tuple)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export function angleDelta(a:number,b:number){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
