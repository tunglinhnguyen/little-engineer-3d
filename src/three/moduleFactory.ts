import * as THREE from 'three';
import { MODULES } from '../core/moduleRegistry';
import type { ModuleInstance, ModuleType, PortDefinition } from '../core/types';

const COLORS: Record<ModuleType, number> = {
  battery: 0x49a6e9, solar: 0x2f6f9f, 'hand-crank': 0x9b6bd3,
  switch: 0xf4a340, sensor: 0x5cc88a,
  motor: 0xe65f5c, shaft: 0xaab7c4, bearing: 0x71808d,
  'gear-small': 0xf7c948, 'gear-large': 0xef8b42, 'belt-drive': 0x7f98a8, cam: 0xc49a62,
  wheel: 0x2e3b46, fan: 0x65c7d0, propeller: 0x7bb8ff, drill: 0x8593a0,
  piston: 0xb28b66, conveyor: 0x6f7f8e, winch: 0x8b6f61, mixer: 0x6ab7a8,
  lamp: 0xf8df77, led: 0x72e6a2, buzzer: 0xe17e9d,
  'water-tank': 0x69bfee, pipe: 0x76a9bf, valve: 0xe7874f, pump: 0x4fb4d8, nozzle: 0x6caecb,
  chassis: 0x788896,
};

function std(color: number, metalness = 0.06) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness });
}
function mesh(geo: THREE.BufferGeometry, material: THREE.Material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function rotorX(group: THREE.Group, factor = 1) {
  const rotor = new THREE.Group();
  rotor.userData.rotor = true;
  rotor.userData.rotorFactor = factor;
  group.add(rotor);
  return rotor;
}
function addWaterEffect(group: THREE.Group, length = 1.45) {
  const fx = new THREE.Group();
  fx.userData.waterEffect = true;
  fx.visible = false;
  for (let i = 0; i < 12; i++) {
    const drop = mesh(
      new THREE.SphereGeometry(.045 + (i % 3) * .008, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x40bdf4, transparent: true, opacity: .82 }),
    );
    drop.userData.waterDrop = true;
    drop.userData.waterDropIndex = i;
    drop.position.set(((i % 3) - 1) * .07, .08 * ((i % 2) - .5), .55 + (i / 12) * length);
    fx.add(drop);
  }
  group.add(fx);
}

function labelSprite(text: string) {
  const c = document.createElement('canvas');
  c.width = 460;
  c.height = 110;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffffee';
  x.roundRect(8, 8, 444, 94, 28);
  x.fill();
  x.fillStyle = '#173049';
  x.font = '700 38px system-ui';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 230, 56);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  s.scale.set(2, .48, 1);
  s.position.y = 1.18;
  return s;
}

function addPortVisual(group: THREE.Group, p: PortDefinition) {
  const color =
    p.signal === 'power' ? (p.direction === 'out' ? 0xff5252 : 0x4da6ff) :
    p.signal === 'rotation' ? 0xffcc43 :
    p.signal === 'fluid' ? 0x22b9f2 : 0xa6b2bd;
  const ring = mesh(new THREE.TorusGeometry(.13, .04, 8, 20), new THREE.MeshBasicMaterial({ color }));
  ring.position.set(...p.position);
  const axis = new THREE.Vector3(...p.axis).normalize();
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  ring.userData.isPortVisual = true;
  ring.userData.portId = p.id;
  ring.userData.portColor = color;
  group.add(ring);
}

export function createModuleObject(instance: ModuleInstance): THREE.Group {
  const def = MODULES[instance.type];
  const g = new THREE.Group();
  g.name = instance.id;
  g.userData.moduleId = instance.id;
  g.userData.type = instance.type;

  const c = COLORS[instance.type], dark = 0x243746, light = 0xe9f0f4;
  const body = mesh(new THREE.BoxGeometry(...def.size), std(c));
  g.add(body);

  if (instance.type === 'battery') {
    const plus = mesh(new THREE.CylinderGeometry(.08, .08, .16, 16), std(0xff6b66));
    plus.rotation.z = Math.PI / 2; plus.position.x = .68; g.add(plus);
    const band = mesh(new THREE.BoxGeometry(.18, .78, .86), std(0xf0f3f5));
    band.position.x = -.34; g.add(band);
  }

  if (instance.type === 'solar') {
    g.remove(body);
    const frame = mesh(new THREE.BoxGeometry(1.7, .14, 1.08), std(0x29485d, .18));
    g.add(frame);
    for (let x = -2; x <= 2; x++) for (let z = -1; z <= 1; z++) {
      const cell = mesh(new THREE.BoxGeometry(.28, .04, .28), std(0x2f7eaf, .12));
      cell.position.set(x * .31, .09, z * .32); g.add(cell);
    }
  }

  if (instance.type === 'switch') {
    const base = mesh(new THREE.BoxGeometry(.62, .12, .42), std(dark)); base.position.y = .39; g.add(base);
    const lever = mesh(new THREE.BoxGeometry(.12, .5, .12), std(instance.switchOn === false ? 0xaab1b7 : 0x5dce79));
    lever.position.set(.06, .63, 0);
    lever.rotation.z = instance.switchOn === false ? -.58 : .58;
    g.add(lever);
  }

  if (instance.type === 'motor') {
    g.remove(body);
    const barrel = mesh(new THREE.CylinderGeometry(.42, .42, 1.05, 28), std(c, .18));
    barrel.rotation.z = Math.PI / 2; g.add(barrel);
    const rotor = rotorX(g);
    const axle = mesh(new THREE.CylinderGeometry(.085, .085, .52, 16), std(light, .5));
    axle.rotation.z = Math.PI / 2; axle.position.x = .68; rotor.add(axle);
    const marker = mesh(new THREE.BoxGeometry(.06, .22, .06), std(0xffd45f));
    marker.position.set(.92, .1, 0); rotor.add(marker);
  }

  if (instance.type === 'hand-crank') {
    g.remove(body);
    const base = mesh(new THREE.BoxGeometry(.62, .62, .62), std(c)); base.position.x = -.16; g.add(base);
    const rotor = rotorX(g);
    const axle = mesh(new THREE.CylinderGeometry(.08, .08, .7, 16), std(light, .5));
    axle.rotation.z = Math.PI / 2; axle.position.x = .42; rotor.add(axle);
    const arm = mesh(new THREE.BoxGeometry(.1, .62, .1), std(0xf3c85b));
    arm.position.set(.73, .28, 0); rotor.add(arm);
    const grip = mesh(new THREE.CylinderGeometry(.09, .09, .28, 14), std(dark));
    grip.rotation.z = Math.PI / 2; grip.position.set(.86, .56, 0); rotor.add(grip);
  }

  if (instance.type === 'shaft') {
    g.remove(body);
    const rotor = rotorX(g);
    const shaft = mesh(new THREE.CylinderGeometry(.105, .105, 1.58, 16), std(0xbfc8d0, .55));
    shaft.rotation.z = Math.PI / 2; rotor.add(shaft);
    const marker = mesh(new THREE.BoxGeometry(.4, .045, .045), std(0x52606b));
    marker.position.y = .1; rotor.add(marker);
  }

  if (instance.type === 'bearing') {
    g.remove(body);
    const outer = mesh(new THREE.TorusGeometry(.32, .11, 12, 28), std(0x66727c, .45));
    outer.rotation.y = Math.PI / 2; g.add(outer);
    const rotor = rotorX(g);
    const inner = mesh(new THREE.TorusGeometry(.16, .055, 10, 24), std(0xd6dde2, .55));
    inner.rotation.y = Math.PI / 2; rotor.add(inner);
    const mark = mesh(new THREE.BoxGeometry(.12, .05, .04), std(0xffd45f));
    mark.position.set(0, .19, 0); rotor.add(mark);
  }

  if (instance.type === 'gear-small' || instance.type === 'gear-large') {
    g.remove(body);
    const r = instance.type === 'gear-small' ? .48 : .62;
    const teeth = instance.type === 'gear-small' ? 12 : 24;
    const rotor = rotorX(g);
    const disk = mesh(new THREE.CylinderGeometry(r, r, .28, 36), std(c, .18));
    disk.rotation.z = Math.PI / 2; rotor.add(disk);
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * Math.PI * 2;
      const t = mesh(new THREE.BoxGeometry(.18, .13, .13), std(c));
      t.position.set(0, Math.cos(a) * (r + .07), Math.sin(a) * (r + .07));
      t.rotation.x = a; rotor.add(t);
    }
    const hub = mesh(new THREE.CylinderGeometry(.14, .14, .36, 18), std(dark, .3));
    hub.rotation.z = Math.PI / 2; rotor.add(hub);
    const spoke = mesh(new THREE.BoxGeometry(.32, .055, .055), std(0xffffff, .1));
    spoke.position.y = .16; rotor.add(spoke);
  }

  if (instance.type === 'belt-drive') {
    g.remove(body);
    const plate = mesh(new THREE.BoxGeometry(1.45, .12, 1.02), std(0x667784, .25));
    plate.position.y = -.3; g.add(plate);
    const small = rotorX(g, 2);
    small.position.set(-.43, 0, 0);
    const s = mesh(new THREE.CylinderGeometry(.24, .24, .22, 24), std(0xe4b44c, .25));
    s.rotation.z = Math.PI / 2; small.add(s);
    const large = rotorX(g, 1);
    large.position.set(.43, 0, 0);
    const l = mesh(new THREE.CylinderGeometry(.42, .42, .22, 30), std(0x5f879e, .25));
    l.rotation.z = Math.PI / 2; large.add(l);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x202b31, roughness: .72 });
    for (const z of [-.38, .38]) {
      const belt = mesh(new THREE.BoxGeometry(.86, .08, .07), beltMat);
      belt.position.set(0, 0, z); g.add(belt);
    }
  }

  if (instance.type === 'cam') {
    g.remove(body);
    const stand = mesh(new THREE.BoxGeometry(.3, .72, .72), std(dark));
    stand.position.x = -.28; g.add(stand);
    const rotor = rotorX(g);
    const cam = mesh(new THREE.CylinderGeometry(.38, .38, .22, 28), std(c, .22));
    cam.rotation.z = Math.PI / 2; cam.position.set(.08, .16, 0); rotor.add(cam);
    const mark = mesh(new THREE.SphereGeometry(.055, 10, 8), std(0xffffff));
    mark.position.set(.2, .43, 0); rotor.add(mark);
  }

  if (instance.type === 'wheel') {
    g.remove(body);
    const rotor = rotorX(g);
    const tire = mesh(new THREE.TorusGeometry(.53, .18, 14, 32), std(0x27333e));
    tire.rotation.y = Math.PI / 2; rotor.add(tire);
    const hub = mesh(new THREE.CylinderGeometry(.19, .19, .32, 18), std(0xb9c6cf, .25));
    hub.rotation.z = Math.PI / 2; rotor.add(hub);
    rotor.add(mesh(new THREE.BoxGeometry(.1, .9, .1), std(0x96a8b4, .2)));
  }

  if (instance.type === 'fan' || instance.type === 'propeller') {
    g.remove(body);
    const bladeCount = instance.type === 'fan' ? 4 : 3;
    if (instance.type === 'fan') {
      const cage = mesh(new THREE.TorusGeometry(.69, .035, 8, 40), std(0x5c7a86, .2));
      cage.rotation.y = Math.PI / 2; g.add(cage);
    }
    g.add(mesh(new THREE.SphereGeometry(.18, 18, 12), std(dark)));
    const rotor = rotorX(g);
    for (let i = 0; i < bladeCount; i++) {
      const a = i / bladeCount * Math.PI * 2;
      const blade = mesh(new THREE.BoxGeometry(.09, instance.type === 'fan' ? .62 : .75, .22), std(c));
      blade.position.set(0, Math.cos(a) * .39, Math.sin(a) * .39);
      blade.rotation.x = a; blade.rotation.z = instance.type === 'fan' ? .18 : .25;
      rotor.add(blade);
    }
  }

  if (instance.type === 'drill') {
    g.remove(body);
    const rotor = rotorX(g);
    const shank = mesh(new THREE.CylinderGeometry(.11, .11, .72, 14), std(0xaebbc6, .5));
    shank.rotation.z = Math.PI / 2; shank.position.x = .05; rotor.add(shank);
    const tip = mesh(new THREE.ConeGeometry(.23, .78, 18), std(0x7e8a94, .55));
    tip.rotation.z = -Math.PI / 2; tip.position.x = .74; rotor.add(tip);
    for (let i = 0; i < 4; i++) {
      const rib = mesh(new THREE.TorusGeometry(.17, .035, 6, 18), std(0xd6dde2, .6));
      rib.rotation.y = Math.PI / 2; rib.position.x = .34 + i * .13; rotor.add(rib);
    }
  }

  if (instance.type === 'piston') {
    g.remove(body);
    const housing = mesh(new THREE.CylinderGeometry(.31, .31, .82, 24), std(c, .18));
    housing.rotation.z = Math.PI / 2; housing.position.x = .3; g.add(housing);
    const rod = mesh(new THREE.CylinderGeometry(.09, .09, 1.0, 16), std(light, .55));
    rod.rotation.z = Math.PI / 2; rod.position.x = .15;
    rod.userData.pistonRod = true; rod.userData.pistonBaseX = .15; g.add(rod);
    const head = mesh(new THREE.CylinderGeometry(.24, .24, .18, 20), std(0x9f724e, .18));
    head.rotation.z = Math.PI / 2; head.position.x = .64;
    head.userData.pistonRod = true; head.userData.pistonBaseX = .64; g.add(head);
  }

  if (instance.type === 'conveyor') {
    g.remove(body);
    const base = mesh(new THREE.BoxGeometry(2, .22, .86), std(0x556672, .2));
    base.position.y = -.18; g.add(base);
    for (let i = 0; i < 9; i++) {
      const slat = mesh(new THREE.BoxGeometry(.18, .08, .76), std(i % 2 ? 0x94a3ab : 0x7e8d96));
      const baseX = -0.8 + i * .2;
      slat.position.set(baseX, .02, 0);
      slat.userData.conveyorSlat = true;
      slat.userData.conveyorBaseX = baseX;
      g.add(slat);
    }
    for (const x of [-.87, .87]) {
      const roller = rotorX(g);
      roller.position.x = x;
      const r = mesh(new THREE.CylinderGeometry(.17, .17, .76, 18), std(0x2f3d46, .35));
      r.rotation.x = Math.PI / 2; roller.add(r);
    }
  }

  if (instance.type === 'winch') {
    g.remove(body);
    const frame = mesh(new THREE.BoxGeometry(1.2, .62, .92), std(0x5c6570));
    frame.position.y = -.15; g.add(frame);
    const rotor = rotorX(g);
    const spool = mesh(new THREE.CylinderGeometry(.27, .27, .58, 22), std(c, .2));
    spool.rotation.z = Math.PI / 2; rotor.add(spool);
    for (const x of [-.34, .34]) {
      const flange = mesh(new THREE.CylinderGeometry(.4, .4, .07, 24), std(dark, .22));
      flange.rotation.z = Math.PI / 2; flange.position.x = x; rotor.add(flange);
    }
  }

  if (instance.type === 'mixer') {
    g.remove(body);
    const bowl = mesh(new THREE.CylinderGeometry(.52, .38, .55, 28, 1, true), std(0x95cfc2, .12));
    bowl.position.y = -.12; g.add(bowl);
    const rotor = rotorX(g);
    const shaft = mesh(new THREE.CylinderGeometry(.055, .055, .8, 12), std(light, .5));
    shaft.rotation.z = Math.PI / 2; rotor.add(shaft);
    const paddle = mesh(new THREE.BoxGeometry(.08, .68, .16), std(c));
    paddle.position.x = .28; rotor.add(paddle);
  }

  if (instance.type === 'water-tank') {
    g.remove(body);
    const tank = mesh(
      new THREE.CylinderGeometry(.58, .58, 1.15, 30),
      new THREE.MeshStandardMaterial({ color: 0xb8e8fa, transparent: true, opacity: .42, roughness: .18, metalness: .05 }),
    );
    tank.position.y = .04; g.add(tank);
    const water = mesh(new THREE.CylinderGeometry(.52, .52, .72, 28), new THREE.MeshStandardMaterial({ color: 0x35bff3, transparent: true, opacity: .72 }));
    water.position.y = -.15; water.userData.waterSurface = true; g.add(water);
    const outlet = mesh(new THREE.CylinderGeometry(.11, .11, .42, 14), std(0x75a5b8, .28));
    outlet.rotation.x = Math.PI / 2; outlet.position.z = .69; g.add(outlet);
  }

  if (instance.type === 'pipe') {
    g.remove(body);
    const pipe = mesh(new THREE.CylinderGeometry(.16, .16, 1.55, 18), std(0x6d9baa, .35));
    pipe.rotation.x = Math.PI / 2; g.add(pipe);
    const inner = mesh(new THREE.CylinderGeometry(.08, .08, 1.58, 14), new THREE.MeshBasicMaterial({ color: 0x2db9ee, transparent: true, opacity: .35 }));
    inner.rotation.x = Math.PI / 2; inner.userData.fluidGlow = true; g.add(inner);
  }

  if (instance.type === 'valve') {
    g.remove(body);
    const pipe = mesh(new THREE.CylinderGeometry(.15, .15, 1.12, 18), std(0x719aaa, .32));
    pipe.rotation.x = Math.PI / 2; g.add(pipe);
    const hub = mesh(new THREE.SphereGeometry(.25, 18, 12), std(c)); g.add(hub);
    const wheel = mesh(new THREE.TorusGeometry(.36, .06, 10, 26), std(instance.switchOn === false ? 0xa94d43 : 0x3ab96f, .18));
    wheel.rotation.x = Math.PI / 2; wheel.position.y = .35; g.add(wheel);
    for (let i = 0; i < 4; i++) {
      const spoke = mesh(new THREE.BoxGeometry(.05, .58, .05), std(dark));
      spoke.rotation.y = i * Math.PI / 4; spoke.position.y = .35; g.add(spoke);
    }
  }

  if (instance.type === 'pump') {
    g.remove(body);
    const housing = mesh(new THREE.CylinderGeometry(.46, .46, .5, 28), std(c, .12));
    housing.rotation.z = Math.PI / 2; g.add(housing);
    const rotor = rotorX(g);
    const impeller = mesh(new THREE.TorusGeometry(.23, .055, 8, 24), std(0xeaf7fb, .15));
    impeller.rotation.y = Math.PI / 2; rotor.add(impeller);
    rotor.add(mesh(new THREE.BoxGeometry(.05, .38, .08), std(0xffffff)));
    const inlet = mesh(new THREE.CylinderGeometry(.13, .13, .38, 16), std(0x659bad, .25));
    inlet.rotation.x = Math.PI / 2; inlet.position.z = -.55; g.add(inlet);
    const outlet = mesh(new THREE.CylinderGeometry(.13, .13, .38, 16), std(0x659bad, .25));
    outlet.rotation.x = Math.PI / 2; outlet.position.z = .55; g.add(outlet);
    addWaterEffect(g, .65);
  }

  if (instance.type === 'nozzle') {
    g.remove(body);
    const barrel = mesh(new THREE.CylinderGeometry(.19, .3, .82, 20), std(c, .3));
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -.12; g.add(barrel);
    const tip = mesh(new THREE.ConeGeometry(.2, .38, 18), std(0x7eb2c8, .3));
    tip.rotation.x = -Math.PI / 2; tip.position.z = .52; g.add(tip);
    addWaterEffect(g, 1.7);
  }

  if (instance.type === 'lamp' || instance.type === 'led') {
    if (instance.type === 'led') {
      g.remove(body);
      const base = mesh(new THREE.CylinderGeometry(.28, .32, .28, 20), std(dark));
      base.position.y = .05; g.add(base);
    }
    const bulb = mesh(
      instance.type === 'led'
        ? new THREE.SphereGeometry(.24, 22, 16, 0, Math.PI * 2, 0, Math.PI * .72)
        : new THREE.SphereGeometry(.34, 24, 18),
      new THREE.MeshStandardMaterial({ color: instance.type === 'led' ? 0x9cffba : 0xffe88c, emissive: 0x000000, emissiveIntensity: 0 }),
    );
    bulb.position.y = instance.type === 'led' ? .35 : .68;
    bulb.userData.lampBulb = true; g.add(bulb);
    if (instance.type === 'lamp') {
      const stem = mesh(new THREE.CylinderGeometry(.15, .19, .34, 18), std(dark));
      stem.position.y = .34; g.add(stem);
    }
  }

  if (instance.type === 'buzzer') {
    g.remove(body);
    const base = mesh(new THREE.CylinderGeometry(.43, .47, .28, 26), std(c));
    base.position.y = .05; g.add(base);
    const cap = mesh(new THREE.CylinderGeometry(.34, .39, .18, 26), std(dark));
    cap.position.y = .28; cap.userData.buzzerCap = true; g.add(cap);
    const hole = mesh(new THREE.CylinderGeometry(.07, .07, .03, 14), std(0x111820));
    hole.position.y = .39; g.add(hole);
  }

  if (instance.type === 'sensor') {
    for (const z of [-.2, .2]) {
      const eye = mesh(new THREE.SphereGeometry(.115, 16, 12), std(0x18242e, .18));
      eye.position.set(.54, .08, z); g.add(eye);
    }
  }

  if (instance.type === 'chassis') {
    for (const x of [-.92, 0, .92]) for (const z of [-.55, .55]) {
      const hole = mesh(new THREE.CylinderGeometry(.11, .11, .34, 14), std(0x263746));
      hole.position.set(x, .06, z); g.add(hole);
    }
  }

  g.add(labelSprite(def.name));
  def.ports.forEach(p => addPortVisual(g, p));
  g.position.set(...instance.position);
  g.rotation.y = instance.rotationY;
  g.traverse(o => {
    o.userData.moduleRoot = g;
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = true;
      (o as THREE.Mesh).receiveShadow = true;
    }
  });
  return g;
}

export function setPortVisualsVisible(group: THREE.Group, visible: boolean, connectedPorts: Set<string> = new Set()) {
  group.traverse(o => {
    if (!o.userData.isPortVisual) return;
    o.visible = visible;
    const material = (o as THREE.Mesh).material;
    if (material instanceof THREE.MeshBasicMaterial) {
      material.color.setHex(connectedPorts.has(o.userData.portId) ? 0x16834b : o.userData.portColor);
    }
  });
}
