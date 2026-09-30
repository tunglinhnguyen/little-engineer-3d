import * as THREE from 'three';
import { MODULES } from '../core/moduleRegistry';
import type { ModuleInstance, SignalType } from '../core/types';

const COLORS: Record<SignalType, number> = {
  power: 0xff5a52,
  rotation: 0xffbf3f,
  structural: 0x8aa0ac,
};

function material(color: number, metalness = .08, roughness = .58) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  color: number,
  position: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCylinder(
  group: THREE.Group,
  radius: number,
  length: number,
  color: number,
  position: [number, number, number] = [0, 0, 0],
  rotateZ = false,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 24),
    material(color, .22, .42),
  );
  mesh.position.set(...position);
  if (rotateZ) mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addPorts(group: THREE.Group, instance: ModuleInstance) {
  for (const port of MODULES[instance.type].ports) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(.11, 14, 10),
      new THREE.MeshStandardMaterial({
        color: COLORS[port.signal],
        emissive: COLORS[port.signal],
        emissiveIntensity: .15,
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

function battery(group: THREE.Group) {
  addBox(group, [1.25,.72,.82], 0x4d79c7);
  addBox(group,[.14,.14,.18],0xd94f4b,[.38,.43,0]);
  addBox(group,[.14,.14,.18],0x263746,[-.38,.43,0]);
  addBox(group,[.42,.18,.86],0xf2d45c,[0,-.2,0]);
}

function switchPart(group: THREE.Group, on: boolean) {
  addBox(group,[1.2,.68,.8],0xe6a74c);
  addBox(group,[.78,.08,.48],0x293e4c,[0,.37,0]);
  const lever = addBox(group,[.55,.12,.12],on ? 0x55ba7f : 0xd85a51,[.02,.52,0]);
  lever.rotation.z = on ? -.32 : .32;
}

function motor(group: THREE.Group) {
  const body = addCylinder(group,.38,.92,0x5f8e9f,[0,0,0],true);
  body.userData.rotor = true;
  body.userData.rotorAxis = 'x';
  addCylinder(group,.13,.42,0xd2d7da,[.67,0,0],true);
  addBox(group,[.18,.18,.9],0x263746,[-.48,0,0]);
}

function gearbox(group: THREE.Group) {
  addBox(group,[1.25,.82,.9],0x687b87);
  for (const [x,r] of [[-.25,.25],[.26,.19]] as [number,number][]) {
    const gear = addCylinder(group,r,.12,0xe8bd4f,[x,.16,.47],false);
    gear.rotation.x = Math.PI / 2;
    gear.userData.rotor = true;
    gear.userData.rotorAxis = 'z';
  }
}

function differential(group: THREE.Group) {
  addBox(group,[1.25,.72,.9],0x65747e);
  const gear = addCylinder(group,.31,.16,0xd7aa45,[0,.05,.5],false);
  gear.rotation.x = Math.PI / 2;
  gear.userData.rotor = true;
  gear.userData.rotorAxis = 'z';
  addCylinder(group,.11,1.02,0x384a55,[0,0,0],false);
  group.children[group.children.length - 1].rotation.x = Math.PI / 2;
}

function car(group: THREE.Group) {
  addBox(group,[2.65,.34,1.35],0x2d6f9c,[0,-.08,0]);
  addBox(group,[1.25,.48,1.1],0x4ca3d4,[.25,.28,0]);
  addBox(group,[.72,.34,1.02],0xbfe8f5,[.38,.54,0]);

  for (const x of [-.82,.82]) {
    for (const z of [-.72,.72]) {
      const rotor = new THREE.Group();
      rotor.position.set(x,-.28,z);
      rotor.userData.rotor = true;
      rotor.userData.rotorAxis = 'z';
      group.add(rotor);

      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(.31,.31,.19,22),
        material(0x242a2f,.05,.82),
      );
      tire.rotation.x = Math.PI / 2;
      tire.castShadow = true;
      rotor.add(tire);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(.12,.12,.21,18),
        material(0xc6d0d5,.45,.32),
      );
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);
    }
  }
}

function road(group: THREE.Group) {
  addBox(group,[1.6,.12,3.0],0x5f676b,[0,-.58,0]);
  addBox(group,[.08,.018,.55],0xfff0a1,[0,-.508,-.9]);
  addBox(group,[.08,.018,.55],0xfff0a1,[0,-.508,0]);
  addBox(group,[.08,.018,.55],0xfff0a1,[0,-.508,.9]);
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
    const mat = mesh.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;

    const signal = child.userData.signal as SignalType;
    const color = connected.has(child.userData.portId) ? 0x54bf7a : COLORS[signal];
    mat.color.setHex(color);
    mat.emissive.setHex(color);
    mat.emissiveIntensity = connected.has(child.userData.portId) ? .45 : .15;
  });
}
