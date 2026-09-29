import * as THREE from 'three';
import { MODULES } from '../core/moduleRegistry';
import type { ModuleInstance, ModuleType, PortDefinition } from '../core/types';

const COLORS: Record<ModuleType, number> = {
  battery: 0x49a6e9, switch: 0xf4a340, motor: 0xe65f5c, shaft: 0xaab7c4,
  'gear-small': 0xf7c948, 'gear-large': 0xef8b42, wheel: 0x2e3b46, fan: 0x65c7d0,
  drill: 0x8593a0, lamp: 0xf8df77, sensor: 0x5cc88a, chassis: 0x788896,
};

function std(color: number, metalness = 0.06) { return new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness }); }
function mesh(geo: THREE.BufferGeometry, material: THREE.Material) { const m = new THREE.Mesh(geo, material); m.castShadow = true; m.receiveShadow = true; return m; }

function labelSprite(text: string) {
  const c = document.createElement('canvas'); c.width = 420; c.height = 110;
  const x = c.getContext('2d')!; x.fillStyle = '#ffffffee'; x.roundRect(8, 8, 404, 94, 28); x.fill();
  x.fillStyle = '#173049'; x.font = '700 40px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 210, 56);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true })); s.scale.set(1.85, .49, 1); s.position.y = 1.15; return s;
}

function addPortVisual(group: THREE.Group, p: PortDefinition) {
  const color = p.signal === 'power' ? (p.direction === 'out' ? 0xff5252 : 0x4da6ff) : p.signal === 'rotation' ? 0xffcc43 : 0xa6b2bd;
  const ring = mesh(new THREE.TorusGeometry(.13, .04, 8, 20), new THREE.MeshBasicMaterial({ color }));
  ring.position.set(...p.position); ring.rotation.y = Math.PI / 2; ring.userData.isPortVisual = true; group.add(ring);
}

export function createModuleObject(instance: ModuleInstance): THREE.Group {
  const def = MODULES[instance.type], g = new THREE.Group(); g.name = instance.id;
  g.userData.moduleId = instance.id; g.userData.type = instance.type;
  const c = COLORS[instance.type], dark = 0x243746, light = 0xe9f0f4;
  const body = mesh(new THREE.BoxGeometry(...def.size), std(c)); g.add(body);

  if (instance.type === 'battery') {
    const plus = mesh(new THREE.CylinderGeometry(.08, .08, .16, 16), std(0xff6b66)); plus.rotation.z = Math.PI / 2; plus.position.x = .68; g.add(plus);
    const band = mesh(new THREE.BoxGeometry(.18, .78, .86), std(0xf0f3f5)); band.position.x = -.34; g.add(band);
  }
  if (instance.type === 'switch') {
    const base = mesh(new THREE.BoxGeometry(.62, .12, .42), std(dark)); base.position.y = .39; g.add(base);
    const lever = mesh(new THREE.BoxGeometry(.12, .5, .12), std(instance.switchOn === false ? 0xaab1b7 : 0x5dce79)); lever.position.set(.06, .63, 0); lever.rotation.z = instance.switchOn === false ? -.58 : .58; lever.userData.switchLever = true; g.add(lever);
  }
  if (instance.type === 'motor') {
    g.remove(body); const barrel = mesh(new THREE.CylinderGeometry(.42, .42, 1.05, 28), std(c, .18)); barrel.rotation.z = Math.PI / 2; g.add(barrel);
    const axle = mesh(new THREE.CylinderGeometry(.085, .085, .52, 16), std(light, .5)); axle.rotation.z = Math.PI / 2; axle.position.x = .68; axle.userData.rotor = true; g.add(axle);
  }
  if (instance.type === 'shaft') {
    g.remove(body); const shaft = mesh(new THREE.CylinderGeometry(.105, .105, 1.58, 16), std(0xbfc8d0, .55)); shaft.rotation.z = Math.PI / 2; shaft.userData.rotor = true; g.add(shaft);
  }
  if (instance.type === 'gear-small' || instance.type === 'gear-large') {
    g.remove(body); const r = instance.type === 'gear-small' ? .48 : .62, teeth = instance.type === 'gear-small' ? 12 : 18;
    const disk = mesh(new THREE.CylinderGeometry(r, r, .28, 32), std(c, .18)); disk.rotation.z = Math.PI / 2; disk.userData.rotor = true; g.add(disk);
    for (let i = 0; i < teeth; i++) { const a = i / teeth * Math.PI * 2, t = mesh(new THREE.BoxGeometry(.18, .34, .13), std(c)); t.position.set(0, Math.cos(a) * (r + .08), Math.sin(a) * (r + .08)); t.rotation.x = a; disk.add(t); }
    const hub = mesh(new THREE.CylinderGeometry(.14, .14, .36, 18), std(dark, .3)); hub.rotation.z = Math.PI / 2; disk.add(hub);
  }
  if (instance.type === 'wheel') {
    g.remove(body); const tire = mesh(new THREE.TorusGeometry(.53, .18, 14, 28), std(0x27333e)); tire.rotation.y = Math.PI / 2; tire.userData.rotor = true; g.add(tire);
    const hub = mesh(new THREE.CylinderGeometry(.19, .19, .32, 18), std(0xb9c6cf, .25)); hub.rotation.z = Math.PI / 2; g.add(hub);
  }
  if (instance.type === 'fan') {
    g.remove(body); const hub = mesh(new THREE.SphereGeometry(.18, 18, 12), std(dark)); g.add(hub); const rotor = new THREE.Group(); rotor.userData.rotor = true; g.add(rotor);
    for (let i = 0; i < 4; i++) { const blade = mesh(new THREE.BoxGeometry(.12, .72, .28), std(c)); blade.position.y = .38; blade.rotation.z = i * Math.PI / 2; blade.geometry.translate(0, .18, 0); rotor.add(blade); }
  }
  if (instance.type === 'drill') {
    g.remove(body); const rotor = new THREE.Group(); rotor.userData.rotor = true; g.add(rotor);
    const shank = mesh(new THREE.CylinderGeometry(.11, .11, .72, 14), std(0xaebbc6, .5)); shank.rotation.z = Math.PI / 2; shank.position.x = .05; rotor.add(shank);
    const tip = mesh(new THREE.ConeGeometry(.23, .78, 18), std(0x7e8a94, .55)); tip.rotation.z = -Math.PI / 2; tip.position.x = .74; rotor.add(tip);
    for (let i = 0; i < 4; i++) { const rib = mesh(new THREE.TorusGeometry(.17, .035, 6, 18), std(0xd6dde2, .6)); rib.rotation.y = Math.PI / 2; rib.position.x = .34 + i * .13; rotor.add(rib); }
  }
  if (instance.type === 'lamp') {
    const bulb = mesh(new THREE.SphereGeometry(.34, 24, 18), new THREE.MeshStandardMaterial({ color: 0xffe88c, emissive: 0x000000, emissiveIntensity: 0 })); bulb.position.y = .68; bulb.userData.lampBulb = true; g.add(bulb);
    const stem = mesh(new THREE.CylinderGeometry(.15, .19, .34, 18), std(dark)); stem.position.y = .34; g.add(stem);
  }
  if (instance.type === 'sensor') {
    for (const z of [-.2, .2]) { const eye = mesh(new THREE.SphereGeometry(.115, 16, 12), std(0x18242e, .18)); eye.position.set(.54, .08, z); g.add(eye); }
  }
  if (instance.type === 'chassis') {
    for (const x of [-.92, 0, .92]) for (const z of [-.55, .55]) { const hole = mesh(new THREE.CylinderGeometry(.11, .11, .34, 14), std(0x263746)); hole.position.set(x, .06, z); g.add(hole); }
  }

  g.add(labelSprite(def.name));
  def.ports.forEach(p => addPortVisual(g, p));
  g.position.set(...instance.position); g.rotation.y = instance.rotationY;
  g.traverse(o => { o.userData.moduleRoot = g; if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; } });
  return g;
}

export function setPortVisualsVisible(group: THREE.Group, visible: boolean) {
  group.traverse(o => { if (o.userData.isPortVisual) o.visible = visible; });
}
