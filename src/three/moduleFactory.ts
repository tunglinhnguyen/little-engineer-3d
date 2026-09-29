import * as THREE from 'three';
import { MODULES } from '../core/moduleRegistry';
import type { ModuleInstance, ModuleType, PortDefinition } from '../core/types';

const LABEL_TEXTURES = new Map<string, THREE.CanvasTexture>();

const COLORS: Partial<Record<ModuleType, number>> = {
  battery: 0x49a6e9, solar: 0x2f6f9f, 'hand-crank': 0x9b6bd3,
  switch: 0xf4a340, sensor: 0x5cc88a,
  motor: 0xe65f5c, shaft: 0xaab7c4, bearing: 0x71808d,
  'gear-small': 0xf7c948, 'gear-large': 0xef8b42, 'belt-drive': 0x7f98a8, cam: 0xc49a62,
  wheel: 0x2e3b46, fan: 0x65c7d0, propeller: 0x7bb8ff, drill: 0x8593a0,
  piston: 0xb28b66, conveyor: 0x6f7f8e, winch: 0x8b6f61, mixer: 0x6ab7a8,
  lamp: 0xf8df77, led: 0x72e6a2, buzzer: 0xe17e9d,
  'water-tank': 0x69bfee, pipe: 0x76a9bf, valve: 0xe7874f, pump: 0x4fb4d8, nozzle: 0x6caecb,
  chassis: 0x788896, axle: 0x8e9aa5, differential: 0x607889, gearbox: 0x6b8092,
  'car-base': 0xe55d5d, 'motorcycle-base': 0x436caa, 'train-engine': 0x4b9c68, 'train-wagon': 0xc58a4d,
  'road-straight': 0x555b60, 'road-curve': 0x555b60, 'road-crossing': 0x555b60, 'road-t-junction': 0x555b60,
  'rail-straight': 0x69757d, 'rail-curve': 0x69757d, 'rail-crossing': 0x69757d, 'rail-switch': 0x69757d, 'train-station': 0xb98a58, bridge: 0x8c8f91, 'rail-bridge': 0x7d858b,
  foundation: 0xc9c3b7, wall: 0xe1b77b, 'door-wall': 0xd9a66d, 'window-wall': 0xd9a66d, roof: 0xb55b55, column: 0xd0c7ba, fence: 0x9a6f4c,
  'grass-tile': 0x70b55a, 'soil-tile': 0x9a6f48, 'water-tile': 0x54bde8, 'river-tile': 0x48b4df,
  hill: 0x76aa58, mountain: 0x879098, tree: 0x5f9d55, cloud: 0xf5f8fb, rock: 0x7f858a,
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
  rotor.userData.rotorAxis = 'x';
  rotor.userData.rotorFactor = factor;
  group.add(rotor);
  return rotor;
}
function rotorZ(group: THREE.Group, factor = 1) {
  const rotor = new THREE.Group();
  rotor.userData.rotor = true;
  rotor.userData.rotorAxis = 'z';
  rotor.userData.rotorFactor = factor;
  group.add(rotor);
  return rotor;
}
function rotorY(group: THREE.Group, factor = 1) {
  const rotor = new THREE.Group();
  rotor.userData.rotor = true;
  rotor.userData.rotorAxis = 'y';
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
  let texture = LABEL_TEXTURES.get(text);
  if (!texture) {
    const canvas = document.createElement('canvas');
    canvas.width = 460;
    canvas.height = 110;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffffee';
    ctx.roundRect(8, 8, 444, 94, 28);
    ctx.fill();
    ctx.fillStyle = '#173049';
    ctx.font = '700 38px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 230, 56);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    LABEL_TEXTURES.set(text, texture);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  s.scale.set(2, .48, 1);
  s.position.y = 1.18;
  s.renderOrder = 8;
  return s;
}

function addPortVisual(group: THREE.Group, p: PortDefinition) {
  const color =
    p.signal === 'power' ? (p.direction === 'out' ? 0xf0564f : 0x4f9ee8) :
    p.signal === 'rotation' ? 0xe7b83f :
    p.signal === 'fluid' ? 0x27aee5 : 0x8a969e;

  const root = new THREE.Group();
  root.position.set(...p.position);
  const axis = new THREE.Vector3(...p.axis).normalize();
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  root.userData.isPortVisual = true;
  root.userData.portId = p.id;
  root.userData.portColor = color;

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: .32,
    metalness: p.signal === 'rotation' || p.signal === 'structural' ? .46 : .18,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });

  if (p.signal === 'power') {
    const collar = mesh(new THREE.CylinderGeometry(.14, .14, .12, 18), material);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = p.direction === 'out' ? .055 : -.055;
    collar.castShadow = false; collar.receiveShadow = false;
    root.add(collar);
    const face = mesh(new THREE.TorusGeometry(.09, .025, 8, 18), material);
    face.castShadow = false; face.receiveShadow = false;
    root.add(face);
  } else if (p.signal === 'rotation') {
    const shaft = mesh(new THREE.CylinderGeometry(.095, .095, .2, 12), material);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = p.direction === 'out' ? .08 : -.08;
    shaft.castShadow = false; shaft.receiveShadow = false;
    root.add(shaft);
    const collar = mesh(new THREE.CylinderGeometry(.15, .15, .07, 16), material);
    collar.rotation.x = Math.PI / 2;
    root.add(collar);
  } else if (p.signal === 'fluid') {
    const flange = mesh(new THREE.CylinderGeometry(.16, .16, .08, 18), material);
    flange.rotation.x = Math.PI / 2;
    flange.castShadow = false; flange.receiveShadow = false;
    root.add(flange);
    const tube = mesh(new THREE.CylinderGeometry(.095, .095, .22, 18), material);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = p.direction === 'out' ? .08 : -.08;
    tube.castShadow = false; tube.receiveShadow = false;
    root.add(tube);
  } else {
    const stud = mesh(new THREE.CylinderGeometry(.11, .11, .12, 12), material);
    stud.rotation.x = Math.PI / 2;
    stud.castShadow = false; stud.receiveShadow = false;
    root.add(stud);
  }

  root.visible = false;
  group.add(root);
}

export function createModuleObject(instance: ModuleInstance): THREE.Group {
  const def = MODULES[instance.type];
  const g = new THREE.Group();
  g.name = instance.id;
  g.userData.moduleId = instance.id;
  g.userData.type = instance.type;

  const c = instance.custom?.color ?? COLORS[instance.type] ?? 0x78909c, dark = 0x243746, light = 0xe9f0f4;
  const visualSize = instance.custom?.size ?? def.size;
  const body = mesh(new THREE.BoxGeometry(...visualSize), std(c));
  g.add(body);

  if (instance.type === 'custom-block' || instance.type.startsWith('custom-')) {
    g.remove(body);
    const [sx, sy, sz] = visualSize;
    const customBody = instance.custom?.shape === 'cylinder'
      ? mesh(new THREE.CylinderGeometry(Math.max(.18, Math.min(sx, sz) * .48), Math.max(.18, Math.min(sx, sz) * .48), sy, 24), std(c, .14))
      : mesh(new THREE.BoxGeometry(sx, sy, sz), std(c, .14));
    g.add(customBody);
    const rim = mesh(new THREE.BoxGeometry(Math.max(.2, sx * .82), .045, Math.max(.2, sz * .82)), std(0xffffff, .05));
    rim.position.y = sy * .5 + .028;
    rim.material.transparent = true;
    (rim.material as THREE.MeshStandardMaterial).opacity = .38;
    g.add(rim);
  }

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

  if (instance.type === 'axle' || instance.type === 'differential' || instance.type === 'gearbox') {
    g.remove(body);
    const casing = mesh(new THREE.BoxGeometry(instance.type === 'axle' ? 1.1 : 1.0, .5, .62), std(c, .28));
    g.add(casing);
    const rotor = rotorX(g);
    const bar = mesh(new THREE.CylinderGeometry(.09, .09, 1.55, 16), std(light, .5));
    bar.rotation.z = Math.PI / 2;
    rotor.add(bar);
    if (instance.type !== 'axle') {
      const hub = mesh(new THREE.CylinderGeometry(.24, .24, .34, 22), std(0x394955, .35));
      hub.rotation.z = Math.PI / 2;
      rotor.add(hub);
    }
  }

  if (instance.type === 'car-base') {
    g.remove(body);
    g.userData.vehicle = true;
    const frame = mesh(new THREE.BoxGeometry(2.25, .32, 1.18), std(c, .18));
    frame.position.y = .12; frame.userData.vehicleBody = true; g.add(frame);
    const hood = mesh(new THREE.BoxGeometry(.82, .3, 1.05), std(c, .18));
    hood.position.set(.82, .36, 0); hood.userData.vehicleBody = true; g.add(hood);
    const cabin = mesh(new THREE.BoxGeometry(.96, .56, 1.0), std(c, .14));
    cabin.position.set(-.05, .57, 0); cabin.userData.vehicleBody = true; g.add(cabin);
    const windshield = mesh(new THREE.BoxGeometry(.08, .42, .86), new THREE.MeshStandardMaterial({ color: 0x8ed4e8, transparent: true, opacity: .58, roughness: .16 }));
    windshield.position.set(.47, .62, 0); windshield.rotation.z = -.12; windshield.userData.vehicleBody = true; g.add(windshield);
    const rearGlass = mesh(new THREE.BoxGeometry(.08, .38, .82), new THREE.MeshStandardMaterial({ color: 0x8ed4e8, transparent: true, opacity: .5, roughness: .16 }));
    rearGlass.position.set(-.55, .62, 0); rearGlass.rotation.z = .12; rearGlass.userData.vehicleBody = true; g.add(rearGlass);
    for (const z of [-.38, .38]) {
      const lamp = mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff3bc, emissive: 0xffdf74, emissiveIntensity: .45 }));
      lamp.position.set(1.15, .32, z); g.add(lamp);
    }
    for (const x of [-.75, .78]) for (const z of [-.69, .69]) {
      const parent = new THREE.Group();
      parent.position.set(x, -.05, z);
      if (x > 0) parent.userData.steerGroup = true;
      g.add(parent);
      const wr = rotorZ(parent);
      const tire = mesh(new THREE.CylinderGeometry(.32, .32, .22, 22), std(0x242b30));
      tire.rotation.x = Math.PI / 2; wr.add(tire);
      const hub = mesh(new THREE.CylinderGeometry(.12, .12, .24, 18), std(0xc5d0d7, .4));
      hub.rotation.x = Math.PI / 2; wr.add(hub);
    }
    for (let i = 0; i < 4; i++) {
      const streak = mesh(new THREE.BoxGeometry(.42, .025, .035), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7 }));
      streak.position.set(-1.45 - i * .25, .1 + (i % 2) * .16, ((i % 2) ? .55 : -.55));
      streak.userData.speedEffect = true; streak.visible = false; g.add(streak);
    }
  }

  if (instance.type === 'motorcycle-base') {
    g.remove(body);
    g.userData.vehicle = true;
    const beam = mesh(new THREE.BoxGeometry(1.45, .18, .28), std(c, .18));
    beam.position.y = .18; beam.userData.vehicleBody = true; g.add(beam);
    const seat = mesh(new THREE.BoxGeometry(.65, .18, .42), std(0x27313a));
    seat.position.set(.2, .55, 0); seat.userData.vehicleBody = true; g.add(seat);
    const fork = mesh(new THREE.BoxGeometry(.12, .78, .12), std(light, .4));
    fork.position.set(.82, .3, 0); fork.rotation.z = -.3; g.add(fork);
    for (const x of [-.78, .88]) {
      const wr = rotorZ(g);
      wr.position.set(x, 0, 0);
      const tire = mesh(new THREE.TorusGeometry(.36, .11, 12, 26), std(0x222a2f));
      wr.add(tire);
      const spoke = mesh(new THREE.BoxGeometry(.05, .62, .05), std(0xb9c7cf, .35));
      wr.add(spoke);
    }
    const bar = mesh(new THREE.BoxGeometry(.45, .06, .06), std(dark));
    bar.position.set(.9, .82, 0); g.add(bar);
  }

  if (instance.type === 'train-engine' || instance.type === 'train-wagon') {
    g.remove(body);
    if (instance.type === 'train-engine') g.userData.vehicle = true;
    const base = mesh(new THREE.BoxGeometry(instance.type === 'train-engine' ? 2.35 : 2.1, .32, 1.05), std(instance.type === 'train-engine' ? c : 0xc58a4d, .2));
    base.position.y = .02; base.userData.vehicleBody = true; g.add(base);
    const cabin = mesh(new THREE.BoxGeometry(instance.type === 'train-engine' ? 1.0 : 1.75, .82, .9), std(instance.type === 'train-engine' ? 0x367b55 : 0xe1b675, .1));
    cabin.position.set(instance.type === 'train-engine' ? .35 : 0, .58, 0); cabin.userData.vehicleBody = true; g.add(cabin);
    const windowXs = instance.type === 'train-engine' ? [.22, .5] : [-.58, 0, .58];
    for (const x of windowXs) for (const z of [-.47, .47]) {
      const window = mesh(new THREE.BoxGeometry(.28, .28, .035), new THREE.MeshStandardMaterial({ color: 0x8fd4eb, transparent: true, opacity: .62, roughness: .14 }));
      window.position.set(x, .66, z); g.add(window);
    }
    if (instance.type === 'train-engine') {
      const nose = mesh(new THREE.CylinderGeometry(.27, .34, .72, 20), std(0x293f4c, .3));
      nose.rotation.z = Math.PI / 2; nose.position.set(-.92, .48, 0); g.add(nose);
      const stack = mesh(new THREE.CylinderGeometry(.12, .17, .5, 16), std(0x26343c, .3));
      stack.position.set(-.65, 1.0, 0); g.add(stack);
      const lamp = mesh(new THREE.SphereGeometry(.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff0ad, emissive: 0xffcf4f, emissiveIntensity: .55 }));
      lamp.position.set(-1.25, .55, 0); g.add(lamp);
    }
    for (const x of [-.78, 0, .78]) for (const z of [-.54, .54]) {
      const wr = rotorZ(g);
      wr.position.set(x, -.23, z);
      const wheel = mesh(new THREE.CylinderGeometry(.24, .24, .12, 20), std(0x283138, .42));
      wheel.rotation.x = Math.PI / 2; wr.add(wheel);
    }
  }

  if (instance.type === 'road-straight' || instance.type === 'road-curve') {
    g.remove(body);
    if (instance.type === 'road-straight') {
      const slab = mesh(new THREE.BoxGeometry(1.55, .1, 2.95), std(0x4f5559));
      slab.position.y = -.55; g.add(slab);
      for (let z = -1.1; z <= 1.1; z += .55) {
        const dash = mesh(new THREE.BoxGeometry(.08, .025, .28), std(0xf6d86d));
        dash.position.set(0, -.48, z); g.add(dash);
      }
    } else {
      const centerRadius = .925;
      const roadHalfWidth = .775;
      const road = mesh(
        new THREE.RingGeometry(centerRadius - roadHalfWidth, centerRadius + roadHalfWidth, 48, 1, 0, Math.PI / 2),
        std(0x4f5559),
      );
      road.rotation.x = -Math.PI / 2;
      road.position.y = -.5;
      g.add(road);
      for (let i = 1; i <= 7; i++) {
        const a = i / 8 * Math.PI / 2;
        const dash = mesh(new THREE.BoxGeometry(.07, .025, .22), std(0xf6d86d));
        dash.position.set(Math.cos(a) * centerRadius, -.47, -Math.sin(a) * centerRadius);
        dash.rotation.y = -a;
        g.add(dash);
      }
      for (const radius of [centerRadius - roadHalfWidth, centerRadius + roadHalfWidth]) {
        const edge = mesh(new THREE.TorusGeometry(Math.max(.03, radius), .025, 5, 48, Math.PI / 2), std(0xe8ecee));
        edge.rotation.x = Math.PI / 2;
        edge.position.y = -.465;
        g.add(edge);
      }
    }
  }

  if (instance.type === 'road-crossing' || instance.type === 'road-t-junction') {
    g.remove(body);
    const asphalt = std(0x4f5559);
    const vertical = mesh(new THREE.BoxGeometry(1.5, .1, 2.7), asphalt);
    vertical.position.y = -.55;
    g.add(vertical);
    const horizontal = mesh(new THREE.BoxGeometry(2.7, .1, 1.5), asphalt.clone());
    horizontal.position.y = -.55;
    g.add(horizontal);

    if (instance.type === 'road-t-junction') {
      const cap = mesh(new THREE.BoxGeometry(1.52, .105, .7), std(0x70a75c));
      cap.position.set(0, -.545, .98);
      g.add(cap);
    }

    const directions = instance.type === 'road-crossing'
      ? [
          { axis: 'z' as const, fixed: 0 },
          { axis: 'x' as const, fixed: 0 },
        ]
      : [
          { axis: 'x' as const, fixed: 0 },
          { axis: 'z' as const, fixed: -.58 },
        ];
    for (const dir of directions) {
      for (let p = -1.05; p <= 1.05; p += .52) {
        const dash = mesh(
          new THREE.BoxGeometry(dir.axis === 'z' ? .07 : .26, .025, dir.axis === 'z' ? .26 : .07),
          std(0xf4d36c),
        );
        dash.position.set(dir.axis === 'x' ? p : dir.fixed, -.48, dir.axis === 'z' ? p : dir.fixed);
        g.add(dash);
      }
    }

    if (instance.type === 'road-crossing') {
      for (const sign of [-1, 1]) {
        const zebra = new THREE.Group();
        for (let i = -2; i <= 2; i++) {
          const stripe = mesh(new THREE.BoxGeometry(.18, .022, .42), std(0xf3f3ee));
          stripe.position.x = i * .26;
          zebra.add(stripe);
        }
        zebra.position.set(0, -.47, sign * .84);
        g.add(zebra);
      }
    }
  }

  if (instance.type === 'rail-straight' || instance.type === 'rail-crossing') {
    g.remove(body);
    const addLine = (rotated = false) => {
      for (const x of [-.42, .42]) {
        const rail = mesh(new THREE.BoxGeometry(rotated ? 2.7 : .08, .12, rotated ? .08 : 2.7), std(0x79848a, .55));
        if (rotated) rail.position.z = x; else rail.position.x = x;
        rail.position.y = -.43; g.add(rail);
      }
      for (let p = -1.2; p <= 1.2; p += .3) {
        const sleeper = mesh(new THREE.BoxGeometry(rotated ? .08 : 1.1, .08, rotated ? 1.1 : .08), std(0x805b3c));
        if (rotated) sleeper.position.set(p, -.55, 0); else sleeper.position.set(0, -.55, p);
        g.add(sleeper);
      }
    };
    addLine(false);
    if (instance.type === 'rail-crossing') addLine(true);
  }

  if (instance.type === 'rail-switch') {
    g.remove(body);
    const railMat = std(0x79848a, .58);
    const sleeperMat = std(0x805b3c);
    for (const x of [-.42,.42]) {
      const rail = mesh(new THREE.BoxGeometry(.08,.12,3.05),railMat.clone());
      rail.position.set(x,-.43,0); g.add(rail);
    }
    for(let z=-1.35;z<=1.35;z+=.3){
      const sleeper=mesh(new THREE.BoxGeometry(1.12,.07,.09),sleeperMat.clone());
      sleeper.position.set(0,-.55,z);g.add(sleeper);
    }
    // Diverging branch. The route itself is selected by the turnout state.
    for(const offset of [-.42,.42]){
      const points:THREE.Vector3[]=[];
      for(let i=0;i<=12;i++){
        const t=i/12;
        const x=t*t*1.52 + offset*(1-t);
        const z=-.2 + t*1.72;
        points.push(new THREE.Vector3(x,-.43,z));
      }
      const curve=new THREE.CatmullRomCurve3(points);
      const tube=mesh(new THREE.TubeGeometry(curve,28,.045,7,false),railMat.clone());
      g.add(tube);
    }
    const blade = mesh(new THREE.BoxGeometry(.055,.075,1.5),std(instance.switchOn===true?0x49c16d:0xe4b24e,.45));
    blade.position.set(instance.switchOn===true?.15:-.15,-.39,-.55);
    blade.rotation.y=instance.switchOn===true?-.17:.02;
    blade.userData.turnoutBlade=true;
    g.add(blade);
    const lever=mesh(new THREE.BoxGeometry(.38,.09,.09),std(0xe2b645,.18));
    lever.position.set(.88,-.28,-.95);lever.rotation.z=instance.switchOn===true?.55:-.55;g.add(lever);
  }

  if (instance.type === 'train-station') {
    g.remove(body);
    const railMat=std(0x79848a,.58);
    for(const x of [-.42,.42]){const rail=mesh(new THREE.BoxGeometry(.08,.12,3.2),railMat.clone());rail.position.set(x,-.43,0);g.add(rail);}
    for(let z=-1.4;z<=1.4;z+=.3){const sleeper=mesh(new THREE.BoxGeometry(1.08,.07,.09),std(0x805b3c));sleeper.position.set(0,-.55,z);g.add(sleeper);}
    const platform=mesh(new THREE.BoxGeometry(1.15,.22,3.3),std(0xbcae9c));platform.position.set(1.18,-.39,0);g.add(platform);
    const roof=mesh(new THREE.BoxGeometry(1.2,.12,2.45),std(0x527d91,.18));roof.position.set(1.18,.78,0);g.add(roof);
    for(const z of [-.85,.85]){const post=mesh(new THREE.BoxGeometry(.08,1.1,.08),std(0x5b6870,.3));post.position.set(.85,.18,z);g.add(post);}
    const sign=mesh(new THREE.BoxGeometry(.78,.32,.08),std(0x214a60,.12));sign.position.set(1.28,.65,-1.0);g.add(sign);
    const bench=mesh(new THREE.BoxGeometry(.68,.12,.28),std(0x8f6848));bench.position.set(1.32,-.15,.45);g.add(bench);
  }

  if (instance.type === 'rail-curve') {
    g.remove(body);
    const centerRadius = 1.15;
    const halfGauge = .42;
    for (const radius of [centerRadius - halfGauge, centerRadius + halfGauge]) {
      const rail = mesh(new THREE.TorusGeometry(radius, .045, 8, 48, Math.PI / 2), std(0x79848a, .55));
      rail.rotation.x = Math.PI / 2;
      rail.position.y = -.43;
      g.add(rail);
    }
    for (let i = 0; i <= 11; i++) {
      const a = i / 11 * Math.PI / 2;
      const sleeper = mesh(new THREE.BoxGeometry(1.12, .07, .09), std(0x805b3c));
      sleeper.position.set(Math.cos(a) * centerRadius, -.55, -Math.sin(a) * centerRadius);
      sleeper.rotation.y = a;
      g.add(sleeper);
    }
  }

  if (instance.type === 'bridge') {
    g.remove(body);
    const deck = mesh(new THREE.BoxGeometry(1.75, .18, 2.9), std(0x8a8d8f, .2));
    deck.position.y = .38; g.add(deck);
    for (const x of [-.66, .66]) for (const z of [-1.05, 1.05]) {
      const p = mesh(new THREE.BoxGeometry(.16, .85, .16), std(0x70787d, .25));
      p.position.set(x, -.05, z); g.add(p);
    }
    for (const x of [-.82, .82]) {
      const rail = mesh(new THREE.BoxGeometry(.08, .25, 2.9), std(0xa9b1b5, .25));
      rail.position.set(x, .64, 0); g.add(rail);
    }
  }

  if (instance.type === 'rail-bridge') {
    g.remove(body);
    const deck = mesh(new THREE.BoxGeometry(1.75, .18, 2.95), std(0x7d858b, .28));
    deck.position.y = .36;
    g.add(deck);
    for (const x of [-.66, .66]) for (const z of [-1.08, 1.08]) {
      const pier = mesh(new THREE.BoxGeometry(.16, .86, .16), std(0x697177, .28));
      pier.position.set(x, -.08, z);
      g.add(pier);
    }
    for (const x of [-.42, .42]) {
      const rail = mesh(new THREE.BoxGeometry(.08, .12, 2.82), std(0x8d989f, .6));
      rail.position.set(x, .52, 0);
      g.add(rail);
    }
    for (let z = -1.2; z <= 1.2; z += .3) {
      const sleeper = mesh(new THREE.BoxGeometry(1.08, .07, .09), std(0x805b3c));
      sleeper.position.set(0, .43, z);
      g.add(sleeper);
    }
    for (const x of [-.82, .82]) {
      const guard = mesh(new THREE.BoxGeometry(.06, .28, 2.9), std(0xadb5ba, .35));
      guard.position.set(x, .62, 0);
      g.add(guard);
    }
  }

  if (instance.type === 'foundation' || instance.type === 'grass-tile' || instance.type === 'soil-tile' || instance.type === 'water-tile' || instance.type === 'river-tile') {
    g.remove(body);
    const color = instance.type === 'foundation' ? 0xc9c3b7 :
      instance.type === 'grass-tile' ? 0x70b55a :
      instance.type === 'soil-tile' ? 0x9a6f48 : 0x43b4df;
    const mat = instance.type === 'water-tile' || instance.type === 'river-tile'
      ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: .72, roughness: .2, metalness: .05 })
      : std(color);
    const tile = mesh(new THREE.BoxGeometry(...def.size), mat);
    tile.position.y = -.55;
    if (instance.type === 'water-tile' || instance.type === 'river-tile') {
      tile.userData.waterSurface = true;
      tile.userData.waterBaseY = -.55;
    }
    g.add(tile);
  }

  if (instance.type === 'wall' || instance.type === 'door-wall' || instance.type === 'window-wall') {
    g.remove(body);
    if (instance.type === 'wall') {
      g.add(mesh(new THREE.BoxGeometry(2, 1.65, .28), std(c)));
    } else {
      const sideW = instance.type === 'door-wall' ? .5 : .55;
      for (const x of [-.74, .74]) {
        const side = mesh(new THREE.BoxGeometry(sideW, 1.65, .28), std(c));
        side.position.x = x; g.add(side);
      }
      const lintel = mesh(new THREE.BoxGeometry(instance.type === 'door-wall' ? 1.48 : 1.0, .38, .28), std(c));
      lintel.position.y = .64; g.add(lintel);
      if (instance.type === 'window-wall') {
        const sill = mesh(new THREE.BoxGeometry(1.0, .35, .28), std(c));
        sill.position.y = -.58; g.add(sill);
        const glass = mesh(new THREE.BoxGeometry(.92, .74, .05), new THREE.MeshStandardMaterial({ color: 0x8ed9ef, transparent: true, opacity: .45 }));
        glass.position.z = .02; g.add(glass);
      } else {
        const door = mesh(new THREE.BoxGeometry(.86, 1.26, .06), std(0x87542f));
        door.position.set(0, -.2, .16); g.add(door);
      }
    }
  }

  if (instance.type === 'roof') {
    g.remove(body);
    const left = mesh(new THREE.BoxGeometry(2.3, .12, 1.45), std(c));
    left.position.set(0, .12, -.48); left.rotation.x = .58; g.add(left);
    const right = mesh(new THREE.BoxGeometry(2.3, .12, 1.45), std(c));
    right.position.set(0, .12, .48); right.rotation.x = -.58; g.add(right);
  }

  if (instance.type === 'column') {
    g.remove(body);
    const col = mesh(new THREE.CylinderGeometry(.22, .27, 1.9, 18), std(c, .12));
    g.add(col);
    const cap = mesh(new THREE.BoxGeometry(.55, .15, .55), std(0xe0d7ca));
    cap.position.y = .98; g.add(cap);
  }

  if (instance.type === 'fence') {
    g.remove(body);
    for (const x of [-.85, -.42, 0, .42, .85]) {
      const post = mesh(new THREE.BoxGeometry(.12, 1.0, .12), std(c));
      post.position.x = x; g.add(post);
    }
    for (const y of [-.2, .25]) {
      const rail = mesh(new THREE.BoxGeometry(1.9, .11, .11), std(c));
      rail.position.y = y; g.add(rail);
    }
  }

  if (instance.type === 'hill' || instance.type === 'mountain') {
    g.remove(body);
    const cone = mesh(
      new THREE.ConeGeometry(instance.type === 'hill' ? 1.0 : 1.18, instance.type === 'hill' ? 1.15 : 2.35, instance.type === 'hill' ? 18 : 8),
      std(instance.type === 'hill' ? 0x72a95a : 0x7f898f),
    );
    cone.position.y = instance.type === 'hill' ? 0 : .55; g.add(cone);
    if (instance.type === 'mountain') {
      const snow = mesh(new THREE.ConeGeometry(.48, .62, 8), std(0xf4f7f8));
      snow.position.y = 1.72; g.add(snow);
    }
  }

  if (instance.type === 'tree') {
    g.remove(body);
    const trunk = mesh(new THREE.CylinderGeometry(.14, .2, .9, 12), std(0x7c5336));
    trunk.position.y = -.25; g.add(trunk);
    for (const p of [[0,.45,0],[-.28,.38,.05],[.28,.38,.05],[0,.7,.08]] as [number,number,number][]) {
      const crown = mesh(new THREE.SphereGeometry(.43, 16, 12), std(0x5c9f4f));
      crown.position.set(...p); g.add(crown);
    }
  }

  if (instance.type === 'cloud') {
    g.remove(body);
    for (const p of [[0,1.3,0],[-.45,1.22,0],[.45,1.22,0],[-.15,1.52,0],[.28,1.48,0]] as [number,number,number][]) {
      const puff = mesh(new THREE.SphereGeometry(.42, 16, 12), std(0xf7fafc));
      puff.position.set(...p); puff.userData.cloudPuff = true; g.add(puff);
    }
  }

  if (instance.type === 'rock') {
    g.remove(body);
    const rock = mesh(new THREE.DodecahedronGeometry(.62, 0), std(0x7d858b, .16));
    rock.scale.set(1.15, .72, .95); g.add(rock);
  }

  if (instance.type === 'airplane') {
    g.remove(body);
    g.userData.vehicle = true;
    const fuselage = mesh(new THREE.CylinderGeometry(.32, .42, 2.45, 24), std(0xe9edf1, .18));
    fuselage.rotation.z = Math.PI / 2; fuselage.userData.vehicleBody = true; g.add(fuselage);
    const nose = mesh(new THREE.SphereGeometry(.38, 18, 12), std(0xd95f55, .12));
    nose.position.x = 1.18; nose.scale.x = 1.35; nose.userData.vehicleBody = true; g.add(nose);
    const wing = mesh(new THREE.BoxGeometry(.9, .12, 2.5), std(0x4d83b4, .12));
    wing.position.x = .05; wing.userData.vehicleBody = true; g.add(wing);
    const tailWing = mesh(new THREE.BoxGeometry(.5, .08, 1.15), std(0x4d83b4, .12));
    tailWing.position.x = -1.0; tailWing.userData.vehicleBody = true; g.add(tailWing);
    const fin = mesh(new THREE.BoxGeometry(.42, .8, .08), std(0x4d83b4, .12));
    fin.position.set(-1.0, .36, 0); fin.userData.vehicleBody = true; g.add(fin);
    const prop = rotorX(g, 1.8); prop.position.x = 1.52;
    for (let i = 0; i < 3; i++) {
      const blade = mesh(new THREE.BoxGeometry(.06, .86, .14), std(0x27323a));
      blade.rotation.x = i * Math.PI / 3; prop.add(blade);
    }
    for (const x of [-.45, .65]) {
      const wr = rotorZ(g); wr.position.set(x, -.42, 0);
      const tire = mesh(new THREE.TorusGeometry(.17, .05, 8, 16), std(0x252a2e)); wr.add(tire);
    }
  }

  if (instance.type === 'helicopter') {
    g.remove(body);
    g.userData.vehicle = true;
    const cabin = mesh(new THREE.SphereGeometry(.65, 22, 16), std(0x3f8fb0, .12));
    cabin.scale.set(1.25, .82, .9); cabin.userData.vehicleBody = true; g.add(cabin);
    const glass = mesh(new THREE.SphereGeometry(.46, 18, 12), new THREE.MeshStandardMaterial({ color: 0x8ed9f0, transparent: true, opacity: .55, roughness: .15 }));
    glass.position.set(.35, .12, 0); glass.scale.set(.9,.7,.85); glass.userData.vehicleBody = true; g.add(glass);
    const tail = mesh(new THREE.BoxGeometry(1.55, .16, .16), std(0x3f8fb0)); tail.position.x = -1.0; tail.userData.vehicleBody = true; g.add(tail);
    const tailFin = mesh(new THREE.BoxGeometry(.18, .62, .08), std(0x3f8fb0)); tailFin.position.set(-1.72,.25,0); g.add(tailFin);
    const main = rotorY(g, 1.4); main.position.y = .74;
    for (let i = 0; i < 2; i++) {
      const blade = mesh(new THREE.BoxGeometry(2.6, .045, .12), std(0x2e363d));
      blade.rotation.y = i * Math.PI / 2; main.add(blade);
    }
    const tailRotor = rotorX(g, 2.4); tailRotor.position.set(-1.76,.22,0);
    for (let i = 0; i < 2; i++) {
      const blade = mesh(new THREE.BoxGeometry(.05,.58,.08), std(0x242b30)); blade.rotation.x = i * Math.PI / 2; tailRotor.add(blade);
    }
    for (const z of [-.38,.38]) {
      const skid = mesh(new THREE.BoxGeometry(1.45,.06,.06), std(0x2c363d,.35));
      skid.position.set(-.05,-.62,z); g.add(skid);
    }
  }

  if (instance.type === 'boat') {
    g.remove(body);
    g.userData.vehicle = true;
    const hull = mesh(new THREE.BoxGeometry(2.5,.55,1.15), std(0x267fa4,.12));
    hull.position.y = -.12; hull.scale.set(1,.8,1); hull.userData.vehicleBody = true; g.add(hull);
    const bow = mesh(new THREE.ConeGeometry(.58,.8,4), std(0x267fa4,.12));
    bow.rotation.z = -Math.PI/2; bow.rotation.y = Math.PI/4; bow.position.set(1.42,-.1,0); bow.userData.vehicleBody = true; g.add(bow);
    const cabin = mesh(new THREE.BoxGeometry(.9,.55,.78), std(0xf0f3f4,.05));
    cabin.position.set(.25,.45,0); cabin.userData.vehicleBody = true; g.add(cabin);
    const prop = rotorX(g, 1.5); prop.position.set(-1.48,-.18,0);
    for (let i=0;i<3;i++) { const blade=mesh(new THREE.BoxGeometry(.05,.42,.12),std(0xd7b45d,.25)); blade.rotation.x=i*Math.PI/3; prop.add(blade); }
    const wake = mesh(new THREE.BoxGeometry(1.5,.025,.7), new THREE.MeshBasicMaterial({color:0xbfefff,transparent:true,opacity:.5}));
    wake.position.set(-1.75,-.48,0); wake.userData.boatWake=true; wake.visible=false; g.add(wake);
  }

  if (instance.type === 'crane') {
    g.remove(body);
    g.userData.vehicle = true;
    const base = mesh(new THREE.BoxGeometry(2.2,.42,1.15), std(0xe0a52b,.18)); base.position.y=-.15; base.userData.vehicleBody=true; g.add(base);
    const cabin = mesh(new THREE.BoxGeometry(.75,.72,.9), std(0xf0b437,.12)); cabin.position.set(-.55,.42,0); cabin.userData.vehicleBody=true; g.add(cabin);
    for (const x of [-.72,.72]) for (const z of [-.62,.62]) { const wr=rotorZ(g); wr.position.set(x,-.32,z); const t=mesh(new THREE.CylinderGeometry(.25,.25,.16,18),std(0x242a2f)); t.rotation.x=Math.PI/2; wr.add(t); }
    const pivot = new THREE.Group(); pivot.position.set(.2,.55,0); pivot.userData.craneBoom=true; g.add(pivot);
    const boom = mesh(new THREE.BoxGeometry(2.35,.15,.18), std(0xf0b437,.16)); boom.position.x=1.0; boom.rotation.z=.45; pivot.add(boom);
    const cable = mesh(new THREE.CylinderGeometry(.018,.018,1.15,8), std(0x30373b,.5)); cable.position.set(1.9,-.45,0); cable.userData.craneCable=true; pivot.add(cable);
    const hook = mesh(new THREE.TorusGeometry(.13,.035,8,18,Math.PI*1.45), std(0x3a4248,.5)); hook.position.set(1.9,-1.02,0); hook.userData.craneHook=true; pivot.add(hook);
  }

  if (instance.type === 'excavator') {
    g.remove(body);
    g.userData.vehicle = true;
    for (const z of [-.55,.55]) {
      const track = mesh(new THREE.BoxGeometry(2.15,.38,.28), std(0x2b3034,.25)); track.position.set(-.15,-.35,z); track.userData.vehicleBody=true; g.add(track);
    }
    const deck = mesh(new THREE.BoxGeometry(1.45,.28,1.0),std(0xe0a52b)); deck.position.y=.02; deck.userData.vehicleBody=true; g.add(deck);
    const cab = mesh(new THREE.BoxGeometry(.72,.85,.85),std(0xe9b73d)); cab.position.set(-.4,.55,0); cab.userData.vehicleBody=true; g.add(cab);
    const armRoot = new THREE.Group(); armRoot.position.set(.25,.62,0); armRoot.userData.excavatorArm=true; g.add(armRoot);
    const arm = mesh(new THREE.BoxGeometry(1.35,.16,.16),std(0xe9b73d)); arm.position.x=.62; arm.rotation.z=.45; armRoot.add(arm);
    const fore = mesh(new THREE.BoxGeometry(1.0,.14,.14),std(0xe9b73d)); fore.position.set(1.35,-.2,0); fore.rotation.z=-.65; fore.userData.excavatorForearm=true; armRoot.add(fore);
    const bucket = mesh(new THREE.BoxGeometry(.55,.42,.65),std(0xd99122,.18)); bucket.position.set(1.75,-.65,0); bucket.rotation.z=-.25; bucket.userData.excavatorBucket=true; armRoot.add(bucket);
  }

  if (instance.type === 'bulldozer') {
    g.remove(body);
    g.userData.vehicle = true;
    for (const z of [-.58,.58]) { const track=mesh(new THREE.BoxGeometry(2.05,.42,.3),std(0x2b3034,.25)); track.position.set(-.15,-.35,z); track.userData.vehicleBody=true; g.add(track); }
    const bodyB=mesh(new THREE.BoxGeometry(1.55,.55,1.0),std(0xe2ad31)); bodyB.position.set(-.2,.12,0); bodyB.userData.vehicleBody=true; g.add(bodyB);
    const cab=mesh(new THREE.BoxGeometry(.8,.8,.86),std(0xf0c34f)); cab.position.set(-.45,.72,0); cab.userData.vehicleBody=true; g.add(cab);
    const blade=mesh(new THREE.BoxGeometry(.18,.82,1.55),std(0xb8c0c5,.3)); blade.position.set(1.12,-.02,0); blade.rotation.z=-.12; blade.userData.bulldozerBlade=true; g.add(blade);
  }

  if (instance.type === 'firetruck') {
    g.remove(body);
    g.userData.vehicle = true;
    const base=mesh(new THREE.BoxGeometry(2.45,.38,1.15),std(0xd84d47,.16)); base.position.y=-.08; base.userData.vehicleBody=true; g.add(base);
    const cab=mesh(new THREE.BoxGeometry(.9,.82,1.02),std(0xe65b54)); cab.position.set(.72,.45,0); cab.userData.vehicleBody=true; g.add(cab);
    const tank=mesh(new THREE.BoxGeometry(1.1,.68,.98),std(0xf4f6f7,.05)); tank.position.set(-.5,.38,0); tank.userData.vehicleBody=true; g.add(tank);
    const ladder=mesh(new THREE.BoxGeometry(1.75,.08,.18),std(0xb9c4ca,.35)); ladder.position.set(-.2,.87,0); ladder.rotation.z=.08; g.add(ladder);
    for (const x of [-.75,.75]) for (const z of [-.64,.64]) {
      const parent=new THREE.Group(); parent.position.set(x,-.32,z); if(x>.2) parent.userData.steerGroup=true; g.add(parent);
      const wr=rotorZ(parent);
      const tire=mesh(new THREE.CylinderGeometry(.27,.27,.16,18),std(0x24292d)); tire.rotation.x=Math.PI/2; wr.add(tire);
    }
    for (const z of [-.24,.24]) { const light=mesh(new THREE.SphereGeometry(.1,12,8),std(z<0?0x327dff:0xff3d3d)); light.position.set(.35,.92,z); light.userData.sirenLight=true; light.userData.sirenPhase=z<0?0:Math.PI; g.add(light); }
  }

  if (instance.type === 'runway') {
    g.remove(body);
    const slab=mesh(new THREE.BoxGeometry(2.55,.1,4.15),std(0x4b5155)); slab.position.y=-.55; g.add(slab);
    for(let z=-1.6;z<=1.6;z+=.52){const dash=mesh(new THREE.BoxGeometry(.1,.025,.28),std(0xf7f7ed));dash.position.set(0,-.48,z);g.add(dash);}
    for(const x of [-1.08,1.08]){const edge=mesh(new THREE.BoxGeometry(.06,.02,3.9),std(0xf7f7ed));edge.position.set(x,-.48,0);g.add(edge);}
  }

  if (instance.type === 'helipad') {
    g.remove(body);
    const pad=mesh(new THREE.CylinderGeometry(1.35,1.35,.1,36),std(0x596064)); pad.position.y=-.55; g.add(pad);
    const ring=mesh(new THREE.TorusGeometry(.72,.055,8,36),std(0xffffff)); ring.rotation.x=Math.PI/2; ring.position.y=-.48; g.add(ring);
    const h1=mesh(new THREE.BoxGeometry(.12,.025,.85),std(0xffffff)); h1.position.y=-.47; g.add(h1);
    for(const x of [-.28,.28]){const h=mesh(new THREE.BoxGeometry(.12,.025,.85),std(0xffffff));h.position.set(x,-.47,0);g.add(h);}
  }

  if (instance.type === 'harbor' || instance.type === 'dock') {
    g.remove(body);
    const deck=mesh(new THREE.BoxGeometry(instance.type==='harbor'?2.7:1.3,.22,instance.type==='harbor'?2.1:2.9),std(0x9b734e));
    deck.position.y=-.42; g.add(deck);
    const zs=instance.type==='harbor'?[-.75,.75]:[-1.15,0,1.15];
    for(const z of zs) for(const x of [-.48,.48]) { const post=mesh(new THREE.CylinderGeometry(.07,.09,.9,10),std(0x745238)); post.position.set(x,-.7,z); g.add(post); }
    if(instance.type==='harbor'){ const bollard=mesh(new THREE.CylinderGeometry(.09,.12,.25,12),std(0x303a40)); bollard.position.set(.9,-.24,.65); g.add(bollard); }
  }

  if (instance.type === 'floor-slab') {
    g.remove(body); const slab=mesh(new THREE.BoxGeometry(2.2,.18,2.2),std(0xcac4b9)); g.add(slab);
  }

  if (instance.type === 'stairs') {
    g.remove(body);
    for(let i=0;i<7;i++){const step=mesh(new THREE.BoxGeometry(1.15,.18,.32),std(0xc8b9a3));step.position.set(0,-.5+i*.18,-.82+i*.27);g.add(step);}
  }

  if (instance.type === 'balcony') {
    g.remove(body); const slab=mesh(new THREE.BoxGeometry(1.7,.16,1.05),std(0xc9c4bb)); slab.position.y=-.28; g.add(slab);
    for(const x of [-.72,.72]){const p=mesh(new THREE.BoxGeometry(.06,.72,.06),std(0x697781,.35));p.position.set(x,.08,.46);g.add(p);}
    const rail=mesh(new THREE.BoxGeometry(1.5,.07,.07),std(0x697781,.35));rail.position.set(0,.42,.46);g.add(rail);
  }

  if (instance.type === 'door') {
    g.remove(body);
    for (const x of [-.48,.48]) {
      const jamb = mesh(new THREE.BoxGeometry(.08,1.72,.12),std(0x6f4b31));
      jamb.position.x = x; g.add(jamb);
    }
    const lintel = mesh(new THREE.BoxGeometry(1.04,.09,.12),std(0x6f4b31));
    lintel.position.y = .82; g.add(lintel);
    const pivot = new THREE.Group();
    pivot.position.set(-.43,-.02,0);
    pivot.rotation.y = instance.switchOn === true ? -Math.PI / 2 : 0;
    pivot.userData.doorLeaf = true;
    g.add(pivot);
    const leaf = mesh(new THREE.BoxGeometry(.86,1.56,.08),std(0x87542f));
    leaf.position.x = .43; pivot.add(leaf);
    const knob = mesh(new THREE.SphereGeometry(.055,10,8),std(0xd8b15a,.4));
    knob.position.set(.72,0,.07); pivot.add(knob);
  }

  if (instance.type === 'chair') {
    g.remove(body);
    const seat=mesh(new THREE.BoxGeometry(.68,.12,.68),std(0x9c6b46));seat.position.y=0;g.add(seat);
    const back=mesh(new THREE.BoxGeometry(.68,.72,.12),std(0x9c6b46));back.position.set(0,.38,-.29);g.add(back);
    for(const x of [-.26,.26])for(const z of [-.26,.26]){const leg=mesh(new THREE.BoxGeometry(.08,.55,.08),std(0x765039));leg.position.set(x,-.32,z);g.add(leg);}
  }

  if (instance.type === 'table') {
    g.remove(body); const top=mesh(new THREE.BoxGeometry(1.3,.12,.82),std(0xa87850));top.position.y=.2;g.add(top);
    for(const x of [-.5,.5])for(const z of [-.28,.28]){const leg=mesh(new THREE.BoxGeometry(.09,.65,.09),std(0x765039));leg.position.set(x,-.15,z);g.add(leg);}
  }

  if (instance.type === 'sofa') {
    g.remove(body); const seat=mesh(new THREE.BoxGeometry(1.7,.35,.75),std(0x6fa0b2));seat.position.y=-.1;g.add(seat);
    const back=mesh(new THREE.BoxGeometry(1.7,.72,.22),std(0x6fa0b2));back.position.set(0,.3,-.3);g.add(back);
    for(const x of [-.78,.78]){const arm=mesh(new THREE.BoxGeometry(.18,.5,.76),std(0x638d9d));arm.position.set(x,.08,0);g.add(arm);}
  }

  if (instance.type === 'bed') {
    g.remove(body); const frame=mesh(new THREE.BoxGeometry(1.5,.24,2.0),std(0x8b654b));frame.position.y=-.28;g.add(frame);
    const mattress=mesh(new THREE.BoxGeometry(1.42,.28,1.9),std(0xf2efe8));mattress.position.y=-.04;g.add(mattress);
    const pillow=mesh(new THREE.BoxGeometry(.65,.16,.38),std(0xffffff));pillow.position.set(0,.16,-.68);g.add(pillow);
  }

  if (instance.type === 'kitchen') {
    g.remove(body); const cabinet=mesh(new THREE.BoxGeometry(1.65,.9,.62),std(0xe2d5bd));cabinet.position.y=-.05;g.add(cabinet);
    const counter=mesh(new THREE.BoxGeometry(1.72,.08,.68),std(0x62696e,.25));counter.position.y=.44;g.add(counter);
    for(const x of [-.35,.15,.55]){const burner=mesh(new THREE.TorusGeometry(.11,.018,6,18),std(0x222a2f));burner.rotation.x=Math.PI/2;burner.position.set(x,.5,0);g.add(burner);}
  }

  if (instance.type === 'bookshelf') {
    g.remove(body); const back=mesh(new THREE.BoxGeometry(1.28,1.62,.12),std(0x8a633f));g.add(back);
    for(const y of [-.65,-.2,.25,.7]){const shelf=mesh(new THREE.BoxGeometry(1.3,.08,.38),std(0x9d7249));shelf.position.set(0,y,.12);g.add(shelf);}
    for(let i=0;i<7;i++){const book=mesh(new THREE.BoxGeometry(.1,.34,.2),std([0xb95454,0x4f83b7,0x66a768,0xd4a84b][i%4]));book.position.set(-.45+i*.15,-.45+(i%3)*.45,.27);g.add(book);}
  }

  if (instance.type === 'streetlight') {
    g.remove(body);
    const pole=mesh(new THREE.CylinderGeometry(.05,.07,1.9,12),std(0x4d5960,.35));pole.position.y=.15;g.add(pole);
    const arm=mesh(new THREE.BoxGeometry(.55,.06,.06),std(0x4d5960,.35));arm.position.set(.23,1.08,0);g.add(arm);
    const lamp=mesh(new THREE.SphereGeometry(.16,14,10),new THREE.MeshStandardMaterial({color:0xffe998,emissive:0x000000,emissiveIntensity:0}));
    lamp.position.set(.48,1.03,0); lamp.userData.lampBulb = true; g.add(lamp);
  }

  if (instance.type === 'traffic-light') {
    g.remove(body);
    const pole=mesh(new THREE.CylinderGeometry(.05,.07,1.65,12),std(0x4c565c,.35));pole.position.y=.08;g.add(pole);
    const box=mesh(new THREE.BoxGeometry(.34,.75,.28),std(0x263039));box.position.set(0,.72,0);g.add(box);
    [0xff3b30,0xffcc00,0x34c759].forEach((color,i)=>{
      const light=mesh(new THREE.SphereGeometry(.09,12,8),new THREE.MeshStandardMaterial({color,emissive:0x000000,emissiveIntensity:0}));
      light.position.set(0,.94-i*.22,.16);
      light.userData.trafficLamp = true;
      light.userData.trafficIndex = i;
      g.add(light);
    });
  }

  if (instance.type === 'hydrant') {
    g.remove(body); const base=mesh(new THREE.CylinderGeometry(.2,.25,.65,16),std(0xd84b42));base.position.y=-.05;g.add(base);
    const cap=mesh(new THREE.CylinderGeometry(.24,.2,.18,16),std(0xe2554c));cap.position.y=.38;g.add(cap);
    for(const z of [-.28,.28]){const outlet=mesh(new THREE.CylinderGeometry(.09,.11,.22,12),std(0xc5cdd1,.35));outlet.rotation.x=Math.PI/2;outlet.position.set(0,.12,z);g.add(outlet);}
  }

  if (instance.type === 'sea-tile') {
    g.remove(body); const sea=mesh(new THREE.BoxGeometry(3,.08,3),new THREE.MeshStandardMaterial({color:0x34aede,transparent:true,opacity:.72,roughness:.16,metalness:.05}));
    sea.position.y=-.55; sea.userData.waterSurface=true; sea.userData.waterBaseY=-.55; g.add(sea);
  }

  if (instance.type === 'island') {
    g.remove(body); const sand=mesh(new THREE.CylinderGeometry(1.12,1.3,.36,22),std(0xd9c07b));sand.position.y=-.38;g.add(sand);
    const grass=mesh(new THREE.CylinderGeometry(.8,1.0,.28,22),std(0x69a653));grass.position.y=-.08;g.add(grass);
  }

  if (instance.type === 'waterfall') {
    g.remove(body); const cliff=mesh(new THREE.BoxGeometry(1.65,1.8,1.0),std(0x727d82,.15));cliff.position.y=.25;g.add(cliff);
    const water=mesh(new THREE.BoxGeometry(.72,1.65,.06),new THREE.MeshBasicMaterial({color:0x51c2f1,transparent:true,opacity:.7}));water.position.set(0,.2,.54);water.userData.waterfall=true;g.add(water);
    const pool=mesh(new THREE.CylinderGeometry(.72,.8,.08,24),new THREE.MeshStandardMaterial({color:0x42b9e7,transparent:true,opacity:.65}));pool.position.set(0,-.55,.78);g.add(pool);
  }

  if (instance.type === 'cave') {
    g.remove(body);
    const shell=mesh(new THREE.TorusGeometry(.82,.34,10,24,Math.PI),std(0x6f777c,.14));shell.rotation.x=Math.PI/2;shell.position.y=-.05;g.add(shell);
    const floor=mesh(new THREE.BoxGeometry(1.85,.15,1.45),std(0x665f55));floor.position.y=-.55;g.add(floor);
  }

  if (instance.type === 'bush') {
    g.remove(body); for(const p of [[0,0,0],[-.28,-.05,.1],[.28,-.05,.08],[0,.12,-.2]] as [number,number,number][]){const leaf=mesh(new THREE.SphereGeometry(.36,14,10),std(0x4f9547));leaf.position.set(...p);g.add(leaf);}
  }

  if (instance.type === 'flower') {
    g.remove(body); for(let i=0;i<5;i++){const a=i/5*Math.PI*2;const stem=mesh(new THREE.CylinderGeometry(.025,.03,.45,8),std(0x4d9b4a));stem.position.set(Math.cos(a)*.18,-.2,Math.sin(a)*.18);g.add(stem);const bloom=mesh(new THREE.SphereGeometry(.1,10,8),std([0xffd45f,0xf483b7,0x8e7dff,0xff8c66,0xffffff][i]));bloom.position.set(Math.cos(a)*.18,.08,Math.sin(a)*.18);g.add(bloom);}
  }

  if (instance.type === 'chassis') {
    for (const x of [-.92, 0, .92]) for (const z of [-.55, .55]) {
      const hole = mesh(new THREE.CylinderGeometry(.11, .11, .34, 14), std(0x263746));
      hole.position.set(x, .06, z); g.add(hole);
    }
  }

  const label = labelSprite(instance.custom?.name?.trim() || def.name);
  label.visible = false;
  label.userData.moduleLabel = true;
  g.add(label);
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
    const connected = connectedPorts.has(o.userData.portId);
    o.visible = visible;
    o.traverse(child => {
      const material = (child as THREE.Mesh).material;
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      material.color.setHex(connected ? 0x2ca66f : o.userData.portColor);
      material.emissive.setHex(connected ? 0x0b4e32 : 0x000000);
      material.emissiveIntensity = connected ? .35 : 0;
    });
  });
}
