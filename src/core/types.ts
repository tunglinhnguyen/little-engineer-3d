import type { Vector3Tuple } from 'three';

export type ModuleType =
  | 'battery'
  | 'switch'
  | 'motor'
  | 'shaft'
  | 'gear-small'
  | 'gear-large'
  | 'wheel'
  | 'fan'
  | 'drill'
  | 'lamp'
  | 'sensor'
  | 'chassis';

export type SignalType = 'power' | 'rotation' | 'structural';
export type PortDirection = 'in' | 'out' | 'bi';

export interface PortDefinition {
  id: string;
  signal: SignalType;
  direction: PortDirection;
  position: Vector3Tuple;
  axis: Vector3Tuple;
}

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  icon: string;
  category: 'energy' | 'control' | 'motion' | 'output' | 'structure';
  description: string;
  science: string;
  size: Vector3Tuple;
  ports: PortDefinition[];
  behavior: {
    kind: 'source' | 'switch' | 'motor' | 'pass-rotation' | 'gear' | 'rotation-output' | 'power-output' | 'sensor' | 'structure';
    rpm?: number;
    ratio?: number;
  };
}

export interface ModuleInstance {
  id: string;
  type: ModuleType;
  position: Vector3Tuple;
  rotationY: number;
  switchOn?: boolean;
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
  rpm: Map<string, number>;
  active: Set<string>;
}

export interface Mission {
  id: string;
  title: string;
  emoji: string;
  description: string;
  lesson: string;
  requiredPath: ModuleType[];
  success: string;
}
