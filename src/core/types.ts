import type { Vector3Tuple } from 'three';

export type ModuleType =
  | 'battery'
  | 'solar'
  | 'hand-crank'
  | 'switch'
  | 'sensor'
  | 'motor'
  | 'shaft'
  | 'bearing'
  | 'gear-small'
  | 'gear-large'
  | 'belt-drive'
  | 'cam'
  | 'wheel'
  | 'fan'
  | 'propeller'
  | 'drill'
  | 'pump'
  | 'piston'
  | 'conveyor'
  | 'winch'
  | 'mixer'
  | 'lamp'
  | 'led'
  | 'buzzer'
  | 'water-tank'
  | 'pipe'
  | 'valve'
  | 'nozzle'
  | 'chassis'
  | 'axle'
  | 'differential'
  | 'gearbox'
  | 'car-base'
  | 'motorcycle-base'
  | 'train-engine'
  | 'train-wagon'
  | 'road-straight'
  | 'road-curve'
  | 'road-crossing'
  | 'road-t-junction'
  | 'rail-straight'
  | 'rail-curve'
  | 'rail-crossing'
  | 'bridge'
  | 'rail-bridge'
  | 'foundation'
  | 'wall'
  | 'door-wall'
  | 'window-wall'
  | 'roof'
  | 'column'
  | 'fence'
  | 'grass-tile'
  | 'soil-tile'
  | 'water-tile'
  | 'river-tile'
  | 'hill'
  | 'mountain'
  | 'tree'
  | 'cloud'
  | 'rock'
  | 'airplane'
  | 'helicopter'
  | 'boat'
  | 'crane'
  | 'excavator'
  | 'bulldozer'
  | 'firetruck'
  | 'runway'
  | 'helipad'
  | 'harbor'
  | 'dock'
  | 'floor-slab'
  | 'stairs'
  | 'balcony'
  | 'door'
  | 'chair'
  | 'table'
  | 'sofa'
  | 'bed'
  | 'kitchen'
  | 'bookshelf'
  | 'streetlight'
  | 'traffic-light'
  | 'hydrant'
  | 'sea-tile'
  | 'island'
  | 'waterfall'
  | 'cave'
  | 'bush'
  | 'flower';

export type SignalType = 'power' | 'rotation' | 'fluid' | 'structural';
export type PortDirection = 'in' | 'out' | 'bi';
export type ModuleCategory =
  | 'energy'
  | 'control'
  | 'motion'
  | 'output'
  | 'fluid'
  | 'structure'
  | 'vehicle'
  | 'transport'
  | 'building'
  | 'nature';

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
  category: ModuleCategory;
  description: string;
  science: string;
  size: Vector3Tuple;
  ports: PortDefinition[];
  behavior: {
    kind:
      | 'source'
      | 'rotation-source'
      | 'switch'
      | 'motor'
      | 'pass-rotation'
      | 'gear'
      | 'transmission'
      | 'rotation-output'
      | 'power-output'
      | 'sensor'
      | 'fluid-source'
      | 'fluid-pass'
      | 'fluid-valve'
      | 'pump'
      | 'fluid-output'
      | 'structure'
      | 'vehicle';
    rpm?: number;
    ratio?: number;
    teeth?: number;
    vehicleSpeed?: number;
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
  fluid: Set<string>;
  voltage: Map<string, number>;
  current: Map<string, number>;
  torque: Map<string, number>;
  flow: Map<string, number>;
  pressure: Map<string, number>;
  faults: Map<string, string[]>;
}

export interface ProjectSnapshot {
  id: string;
  name: string;
  updatedAt: number;
  playerName: string;
  graph: {
    modules: ModuleInstance[];
    connections: Connection[];
  };
  thumbnail?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: number;
}

export interface LearningProfile {
  missionsCompleted: string[];
  concepts: Record<string, number>;
  achievements: Record<string, number>;
  buildsSaved: number;
  playSessions: number;
}

export interface Mission {
  id: string;
  title: string;
  emoji: string;
  description: string;
  lesson: string;
  requiredPath: ModuleType[];
  requiredPaths?: ModuleType[][];
  requiredModules?: ModuleType[];
  buildOnly?: boolean;
  success: string;
}
