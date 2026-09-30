import * as THREE from 'three';
import { MODULES } from '../core/moduleRegistry';
import type { ModuleInstance, SignalType } from '../core/types';

const PORT_COLORS: Record<SignalType, number> = {
  power: 0xff5a52,
  rotation: 0xffbf3f,
  structural: 0x8aa0ac,
};

function mat(
  color: number,
  metalness = .08,
  roughness = .58,
  transparent = false,
  opacity = 1,
) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    transparent,
    opacity,
  });
}

function box(
  group: THREE.Group,
  size: [number, number, number],
  color: number,
  position: [number, number, number] = [0, 0, 0],
  metalness = .08,
  roughness = .58,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color, metalness, roughness));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cylinder(
  group: THREE.Group,
  radius: number,
  length: number,
  color: number,
  position: [number, number, number] = [0, 0, 0],
  axis: 'x' | 'y' | 'z' = 'y',
  metalness = .22,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 28),
    mat(color, metalness, .4),
  );
  mesh.position.set(...position);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function torus(
  group: THREE.Group,
  radius: number,
  tube: number,
  color: number,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 10, 30),
    mat(color, .36, .35),
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

function battery(group: THREE.Group) {
  box(group, [1.24,.70,.82], 0x436fae);
  box(group, [1.16,.08,.72], 0x244d78, [0,.37,0]);
  box(group, [.14,.13,.18], 0xe4514b, [.38,.47,0], .25,.32);
  box(group, [.14,.13,.18], 0x202e39, [-.38,.47,0], .25,.32);
  box(group, [.42,.16,.84], 0xf0d15a, [0,-.20,0]);

  for (const x of [-.37,0,.37]) {
    const cell = cylinder(group,.11,.58,0x7fa3c5,[x,.03,0],'z',.1);
    cell.material = mat(0x779cbf,.1,.55);
  }
}

function switchPart(group: THREE.Group, on: boolean) {
  box(group,[1.18,.62,.78],0xd99c45);
  box(group,[.82,.10,.50],0x263d4a,[0,.35,0],.2,.38);

  const pivot = cylinder(group,.11,.16,0xb6c2c8,[0,.46,0],'z',.55);
  pivot.userData.switchPivot = true;

  const lever = box(group,[.58,.12,.13],on ? 0x4eb878 : 0xd85a51,[.04,.52,0],.18,.35);
  lever.rotation.z = on ? -.34 : .34;

  box(group,[.13,.12,.18],0xd64c48,[-.40,-.34,0],.3,.3);
  box(group,[.13,.12,.18],0xd64c48,[.40,-.34,0],.3,.3);
}

function motor(group: THREE.Group) {
  cylinder(group,.36,.88,0x5b8d9e,[0,0,0],'x',.32);
  cylinder(group,.39,.08,0xb6c5ca,[.46,0,0],'x',.45);
  cylinder(group,.14,.44,0xd9aa48,[.70,0,0],'x',.58).userData.rotor = true;
  const shaft = group.children[group.children.length - 1] as THREE.Mesh;
  shaft.userData.rotorAxis = 'x';
  shaft.userData.rotorDirection = 1;

  box(group,[.18,.18,.82],0x263746,[-.47,0,0],.18,.45);
  box(group,[.12,.10,.12],0xe1534e,[-.52,.27,.22],.2,.35);
  box(group,[.12,.10,.12],0x202d36,[-.52,.27,-.22],.2,.35);
}

function gearbox(group: THREE.Group) {
  box(group,[1.22,.68,.88],0x667780,[0,-.08,0],.2,.4);
  box(group,[1.12,.10,.78],0x8799a2,[0,.31,0],.24,.35);

  const g1 = cylinder(group,.23,.12,0xe2b84e,[-.25,.38,.12],'z',.48);
  g1.userData.rotor = true;
  g1.userData.rotorAxis = 'z';
  g1.userData.rotorDirection = 1;

  const g2 = cylinder(group,.30,.12,0xd49a3f,[.25,.38,-.08],'z',.48);
  g2.userData.rotor = true;
  g2.userData.rotorAxis = 'z';
  g2.userData.rotorDirection = -1;

  cylinder(group,.10,.28,0xcbd4d8,[-.52,0,0],'x',.55);
  cylinder(group,.10,.28,0xcbd4d8,[.52,0,0],'x',.55);
}

function differential(group: THREE.Group) {
  box(group,[1.18,.52,.84],0x596972,[0,-.04,0],.28,.42);
  const ring = torus(group,.28,.06,0xd7a444,[0,.20,.44],[Math.PI/2,0,0]);
  ring.userData.rotor = true;
  ring.userData.rotorAxis = 'z';
  ring.userData.rotorDirection = 1;

  const crown = cylinder(group,.20,.14,0xc6d0d4,[0,.10,0],'z',.5);
  crown.userData.rotor = true;
  crown.userData.rotorAxis = 'z';
  crown.userData.rotorDirection = -1;

  const axle = cylinder(group,.09,1.45,0x334650,[0,-.05,0],'z',.55);
  axle.userData.rotor = true;
  axle.userData.rotorAxis = 'z';
  axle.userData.rotorDirection = 1;
}

function mountPad(
  group: THREE.Group,
  size: [number,number,number],
  color: number,
  position: [number,number,number],
) {
  const mesh = box(group,size,color,position,.08,.7);
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.transparent = true;
  material.opacity = .55;
  material.emissive.setHex(color);
  material.emissiveIntensity = .08;
  mesh.userData.mountPad = true;
  return mesh;
}

function car(group: THREE.Group) {
  // Open technical chassis so the child can see where every part belongs.
  // An invisible hit surface covers the open center, making the frame easy
  // to grab with a finger instead of requiring a precise tap on a thin rail.
  const hitSurface = new THREE.Mesh(
    new THREE.BoxGeometry(3.25,.08,1.78),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitSurface.position.y = .02;
  hitSurface.userData.hitArea = true;
  group.add(hitSurface);

  box(group,[3.25,.18,1.78],0x244c67,[0,-.24,0],.24,.52);
  box(group,[3.05,.16,.16],0x2f6f94,[0,-.04,.73],.22,.48);
  box(group,[3.05,.16,.16],0x2f6f94,[0,-.04,-.73],.22,.48);
  box(group,[.16,.16,1.55],0x2f6f94,[-1.18,-.04,0],.22,.48);
  box(group,[.16,.16,1.55],0x2f6f94,[0,-.04,0],.22,.48);
  box(group,[.16,.16,1.55],0x2f6f94,[1.18,-.04,0],.22,.48);

  // Five colored mounting zones correspond to the five removable modules.
  mountPad(group,[.72,.035,.54],0x436fae,[.55,.02,.46]);       // battery
  mountPad(group,[.70,.035,.52],0xd99c45,[.55,.02,-.43]);      // switch
  mountPad(group,[.76,.035,.56],0x5b8d9e,[-.28,.02,.46]);      // motor
  mountPad(group,[.72,.035,.56],0x667780,[-.28,.02,-.43]);     // gearbox
  mountPad(group,[.82,.035,.56],0xd7a444,[-1.05,.02,0]);       // differential

  box(group,[.72,.28,1.42],0x4ca3d4,[1.18,.08,0],.14,.42);
  box(group,[.12,.32,1.32],0xbfe8f5,[.78,.28,0],.05,.28);

  for (const x of [-1.18,1.18]) {
    for (const z of [-.94,.94]) {
      const rotor = new THREE.Group();
      rotor.position.set(x,-.34,z);
      rotor.userData.rotor = true;
      rotor.userData.rotorAxis = 'z';
      rotor.userData.rotorDirection = 1;
      group.add(rotor);

      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(.34,.34,.22,24),
        mat(0x242a2f,.05,.82),
      );
      tire.rotation.x = Math.PI / 2;
      tire.castShadow = true;
      rotor.add(tire);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(.13,.13,.24,18),
        mat(0xc6d0d5,.45,.32),
      );
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);
    }
  }
}

function road(group: THREE.Group) {
  box(group,[1.6,.12,3.0],0x5f676b,[0,-.58,0],.02,.9);
  box(group,[.08,.018,.55],0xfff0a1,[0,-.508,-.9],.02,.6);
  box(group,[.08,.018,.55],0xfff0a1,[0,-.508,0],.02,.6);
  box(group,[.08,.018,.55],0xfff0a1,[0,-.508,.9],.02,.6);
}

function addPorts(group: THREE.Group, instance: ModuleInstance) {
  for (const port of MODULES[instance.type].ports) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(.105,14,10),
      new THREE.MeshStandardMaterial({
        color: PORT_COLORS[port.signal],
        emissive: PORT_COLORS[port.signal],
        emissiveIntensity: .16,
        roughness: .35,
      }),
    );
    mesh.position.set(...port.position);
    mesh.userData.isPortVisual = true;
    mesh.userData.portId = port.id;
    mesh.userData.signal = port.signal;
    mesh.visible = false;
    group.add(mesh);
  }
}

export function createModuleObject(instance: ModuleInstance) {
  const group = new THREE.Group();
  group.position.set(...instance.position);
  group.rotation.y = instance.rotationY;
  group.userData.moduleId = instance.id;
  group.userData.moduleType = instance.type;
  group.userData.moduleRoot = group;

  if (instance.type === 'battery') battery(group);
  else if (instance.type === 'switch') switchPart(group, instance.switchOn !== false);
  else if (instance.type === 'motor') motor(group);
  else if (instance.type === 'gearbox') gearbox(group);
  else if (instance.type === 'differential') differential(group);
  else if (instance.type === 'car-base') car(group);
  else road(group);

  addPorts(group, instance);

  group.traverse(child => {
    child.userData.moduleId = instance.id;
    child.userData.moduleRoot = group;
  });

  return group;
}

export function setPortVisualsVisible(
  object: THREE.Group,
  visible: boolean,
  connected: Set<string>,
) {
  object.traverse(child => {
    if (!child.userData.isPortVisual) return;
    child.visible = visible;

    const mesh = child as THREE.Mesh;
    const material = mesh.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    const signal = child.userData.signal as SignalType;
    const color = connected.has(child.userData.portId) ? 0x54bf7a : PORT_COLORS[signal];
    material.color.setHex(color);
    material.emissive.setHex(color);
    material.emissiveIntensity = connected.has(child.userData.portId) ? .48 : .16;
  });
}
