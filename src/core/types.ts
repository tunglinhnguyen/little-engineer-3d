export type Vector3Tuple = [number, number, number];

export type ModuleType =
  | 'battery'
  | 'switch'
  | 'motor'
  | 'gearbox'
  | 'differential'
  | 'front-axle'
  | 'drive-axle'
  | 'wheel'
  | 'car-base'
  | 'idler-axle'
  | 'cargo-bed'
  | 'hitch'
  | 'trailer'
  | 'road-straight'
  | 'road-curve'
  | 'road-wide-curve'
  | 'road-intersection'
  | 'traffic-light'
  | 'stop-sign'
  | 'speed-sign';

export type SignalType = 'power' | 'rotation' | 'structural';
export type PortDirection = 'in' | 'out' | 'bi';

export interface ModulePort {
  id: string;
  signal: SignalType;
  direction: PortDirection;
  position: Vector3Tuple;
  axis: Vector3Tuple;
  mate?: string;
}

export type ModuleBehavior =
  | { kind: 'source'; voltage: number }
  | { kind: 'switch' }
  | { kind: 'motor'; rpm: number; torque: number }
  | { kind: 'transmission'; ratio: number; efficiency: number }
  | { kind: 'pass-rotation'; efficiency: number }
  | { kind: 'passive' }
  | { kind: 'wheel' }
  | { kind: 'vehicle'; vehicleSpeed: number }
  | { kind: 'track' }
  | { kind: 'traffic-light' }
  | { kind: 'road-sign'; rule: 'stop' | 'speed-30' };

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  icon: string;
  description: string;
  size: Vector3Tuple;
  ports: ModulePort[];
  behavior: ModuleBehavior;
}

export interface ModuleInstance {
  id: string;
  type: ModuleType;
  position: Vector3Tuple;
  rotationY: number;
  switchOn?: boolean;
  slotKey?: string;
  parentId?: string;
  vehicleId?: string;
  vehicleKind?: VehicleKind;
  color?: string;
  gearMode?: GearMode;
}

export type VehicleKind = 'car' | 'truck' | 'tractor';
export type GearMode = 'power' | 'balanced' | 'speed';
export type MissionKind = 'garage' | 'delivery' | 'trailer';
export interface VehicleMission {
  kind: MissionKind;
  targetRoadId?: string;
  status: 'choose' | 'ready' | 'running' | 'completed';
  delivered?: number;
}
export interface ExperimentResult {gear:GearMode;cargo:number;speed:number;distance:number;force:number;stalled:boolean}
export interface VehicleProfile {
  id:string;
  kind:VehicleKind;
  name:string;
  color:string;
  parked:boolean;
  cargo:number;
  mission?:VehicleMission;
  experiments:ExperimentResult[];
}

export interface Placement {
  position: Vector3Tuple;
  rotationY: number;
  slotKey?: string;
  parentId?: string;
  label?: string;
}

export interface Connection {
  id: string;
  fromModuleId: string;
  fromPortId: string;
  toModuleId: string;
  toPortId: string;
  signal: SignalType;
}

export interface SimulationState {
  powered: Set<string>;
  active: Set<string>;
  rpm: Map<string, number>;
  voltage: Map<string, number>;
  current: Map<string, number>;
  torque: Map<string, number>;
}
