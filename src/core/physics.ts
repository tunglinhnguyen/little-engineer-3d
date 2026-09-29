import { MODULES } from './moduleRegistry';
import type { ModuleInstance, ModuleType } from './types';

const SURFACE = new Set<ModuleType>([
  'road-straight','road-curve','road-crossing','road-t-junction','bridge',
  'rail-straight','rail-curve','rail-crossing','rail-bridge','runway','helipad',
  'grass-tile','soil-tile','water-tile','river-tile','sea-tile','foundation','floor-slab',
]);

const VEHICLES = new Set<ModuleType>([
  'car-base','motorcycle-base','train-engine','train-wagon','airplane','helicopter','boat',
  'crane','excavator','bulldozer','firetruck',
]);

export interface Collision {
  a: string;
  b: string;
  penetration: number;
}

function halfExtents(module: ModuleInstance) {
  const [x,y,z] = module.custom?.size ?? MODULES[module.type].size;
  const quarterTurn = Math.round(module.rotationY / (Math.PI / 2)) % 2 !== 0;
  return {
    x: (quarterTurn ? z : x) * .46,
    y: y * .46,
    z: (quarterTurn ? x : z) * .46,
  };
}

export function canOverlap(a: ModuleInstance, b: ModuleInstance) {
  if (SURFACE.has(a.type) && SURFACE.has(b.type)) return true;
  if (VEHICLES.has(a.type) && SURFACE.has(b.type)) return true;
  if (VEHICLES.has(b.type) && SURFACE.has(a.type)) return true;
  if ((a.type === 'tree' || a.type === 'bush' || a.type === 'flower') && SURFACE.has(b.type)) return true;
  if ((b.type === 'tree' || b.type === 'bush' || b.type === 'flower') && SURFACE.has(a.type)) return true;
  if (a.type === 'cloud' || b.type === 'cloud') return true;
  return false;
}

export function collisionBetween(a: ModuleInstance, b: ModuleInstance): Collision | null {
  if (canOverlap(a,b)) return null;
  const ah = halfExtents(a), bh = halfExtents(b);
  const dx = ah.x + bh.x - Math.abs(a.position[0] - b.position[0]);
  const dy = ah.y + bh.y - Math.abs(a.position[1] - b.position[1]);
  const dz = ah.z + bh.z - Math.abs(a.position[2] - b.position[2]);
  if (dx <= .04 || dy <= .04 || dz <= .04) return null;
  return { a:a.id, b:b.id, penetration: Math.min(dx,dy,dz) };
}

export function collisionsFor(module: ModuleInstance, modules: Iterable<ModuleInstance>) {
  const out: Collision[] = [];
  for (const other of modules) {
    if (other.id === module.id) continue;
    const collision = collisionBetween(module,other);
    if (collision) out.push(collision);
  }
  return out;
}

export function worldCollisionReport(modules: Iterable<ModuleInstance>) {
  const all = [...modules];
  const out: Collision[] = [];
  for(let i=0;i<all.length;i++){
    for(let j=i+1;j<all.length;j++){
      const collision=collisionBetween(all[i],all[j]);
      if(collision) out.push(collision);
    }
  }
  return out;
}
