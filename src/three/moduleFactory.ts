import * as THREE from 'three';
import { MODULES } from '../core/moduleRegistry';
import type { ModuleInstance, SignalType } from '../core/types';

const PORT_COLORS: Record<SignalType, number> = {
  power: 0xff5a52,
  rotation: 0xffbf3f,
  structural: 0x55b7d9,
};

function mat(color:number, metalness=.08, roughness=.58, transparent=false, opacity=1) {
  return new THREE.MeshStandardMaterial({color,metalness,roughness,transparent,opacity});
}

function box(
  group:THREE.Group,size:[number,number,number],color:number,
  position:[number,number,number]=[0,0,0],metalness=.08,roughness=.58,
) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),mat(color,metalness,roughness));
  mesh.position.set(...position); mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh); return mesh;
}

function cylinder(
  group:THREE.Group,radius:number,length:number,color:number,
  position:[number,number,number]=[0,0,0],axis:'x'|'y'|'z'='y',metalness=.22,
) {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,28),mat(color,metalness,.4));
  mesh.position.set(...position);
  if(axis==='x') mesh.rotation.z=Math.PI/2;
  if(axis==='z') mesh.rotation.x=Math.PI/2;
  mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh); return mesh;
}

function rotor(mesh:THREE.Object3D,axis:'x'|'y'|'z',direction=1) {
  mesh.userData.rotor=true; mesh.userData.rotorAxis=axis; mesh.userData.rotorDirection=direction;
  return mesh;
}

function battery(g:THREE.Group){
  box(g,[1.24,.70,.82],0x436fae); box(g,[1.16,.08,.72],0x244d78,[0,.37,0]);
  box(g,[.14,.13,.18],0xe4514b,[.38,.47,0],.25,.32); box(g,[.14,.13,.18],0x202e39,[-.38,.47,0],.25,.32);
  box(g,[.42,.16,.84],0xf0d15a,[0,-.20,0]);
  for(const x of [-.37,0,.37]) cylinder(g,.11,.58,0x779cbf,[x,.03,0],'z',.1);
}

function switchPart(g:THREE.Group,on:boolean){
  box(g,[1.18,.62,.78],0xd99c45); box(g,[.82,.10,.50],0x263d4a,[0,.35,0],.2,.38);
  cylinder(g,.11,.16,0xb6c2c8,[0,.46,0],'z',.55);
  const lever=box(g,[.58,.12,.13],on?0x4eb878:0xd85a51,[.04,.52,0],.18,.35); lever.rotation.z=on?-.34:.34;
}

function motor(g:THREE.Group){
  cylinder(g,.36,.88,0x5b8d9e,[0,0,0],'x',.32); cylinder(g,.39,.08,0xb6c5ca,[.46,0,0],'x',.45);
  rotor(cylinder(g,.14,.44,0xd9aa48,[.70,0,0],'x',.58),'x');
  box(g,[.18,.18,.82],0x263746,[-.47,0,0],.18,.45);
}

function gearbox(g:THREE.Group){
  box(g,[1.22,.68,.88],0x667780,[0,-.08,0],.2,.4); box(g,[1.12,.10,.78],0x8799a2,[0,.31,0],.24,.35);
  rotor(cylinder(g,.23,.12,0xe2b84e,[-.25,.38,.12],'z',.48),'z',1);
  rotor(cylinder(g,.30,.12,0xd49a3f,[.25,.38,-.08],'z',.48),'z',-1);
}

function differential(g:THREE.Group){
  box(g,[1.18,.52,.84],0x596972,[0,-.04,0],.28,.42);
  rotor(cylinder(g,.28,.12,0xd7a444,[0,.20,.20],'z',.5),'z');
  rotor(cylinder(g,.10,1.24,0x334650,[0,-.05,0],'z',.55),'z');
}

function axle(g:THREE.Group,drive:boolean){
  if(drive){
    // Rear drive axle: rotating half-shafts and a central final-drive housing.
    const shaft=rotor(cylinder(g,.09,1.82,0x394b55,[0,0,0],'z',.62),'z');
    shaft.userData.rotorDirection=1;
    cylinder(g,.26,.42,0xb47731,[0,0,0],'x',.36);
    cylinder(g,.17,.16,0xc9d3d8,[0,0,.96],'z',.48);
    cylinder(g,.17,.16,0xc9d3d8,[0,0,-.96],'z',.48);
    box(g,[.42,.16,.54],0x596972,[0,-.12,0],.26,.42);
    return;
  }

  // Front axle is passive: rigid beam, steering knuckles and tie rod.
  box(g,[.18,.18,1.78],0x647985,[0,0,0],.34,.48);
  box(g,[.32,.32,.18],0x87969d,[0,0,.92],.34,.42);
  box(g,[.32,.32,.18],0x87969d,[0,0,-.92],.34,.42);
  cylinder(g,.055,1.60,0xb9c5ca,[.18,-.13,0],'z',.48);
  cylinder(g,.15,.14,0xc9d3d8,[0,0,1.0],'z',.48);
  cylinder(g,.15,.14,0xc9d3d8,[0,0,-1.0],'z',.48);
}

function wheel(g:THREE.Group){
  const tire=rotor(cylinder(g,.36,.24,0x23282c,[0,0,0],'z',.05),'z');
  tire.userData.rotorDirection=1;

  const hub=rotor(cylinder(g,.14,.27,0xc7d1d6,[0,0,0],'z',.48),'z');
  hub.userData.rotorDirection=1;

  const rim1=rotor(cylinder(g,.23,.03,0x77878f,[0,0,.13],'z',.35),'z');
  const rim2=rotor(cylinder(g,.23,.03,0x77878f,[0,0,-.13],'z',.35),'z');

  // Five simple spokes make rotation visually obvious to a child.
  for(let i=0;i<5;i++){
    const angle=i*Math.PI*2/5;
    const spoke=box(g,[.035,.17,.025],0xd5dde1,[Math.cos(angle)*.09,Math.sin(angle)*.09,.145],.4,.3);
    spoke.rotation.z=angle;
    spoke.userData.rotor=true;
    spoke.userData.rotorAxis='z';
  }

  // Small tread blocks give the tire a mechanical rather than toy-cylinder look.
  for(let i=0;i<10;i++){
    const angle=i*Math.PI*2/10;
    const tread=box(g,[.07,.055,.27],0x171b1e,[Math.cos(angle)*.345,Math.sin(angle)*.345,0],.02,.95);
    tread.rotation.z=angle;
    tread.userData.rotor=true;
    tread.userData.rotorAxis='z';
  }
}

function mountPad(g:THREE.Group,size:[number,number,number],color:number,position:[number,number,number]){
  const m=box(g,size,color,position,.08,.7); const mm=m.material as THREE.MeshStandardMaterial;
  mm.transparent=true; mm.opacity=.42; mm.emissive.setHex(color); mm.emissiveIntensity=.06; return m;
}

function chassis(g:THREE.Group){
  box(g,[3.35,.16,1.68],0x244c67,[0,-.20,0],.28,.50);
  box(g,[3.08,.15,.14],0x2f6f94,[0,0,.72],.22,.48); box(g,[3.08,.15,.14],0x2f6f94,[0,0,-.72],.22,.48);
  box(g,[.15,.15,1.45],0x2f6f94,[-1.18,0,0],.22,.48); box(g,[.15,.15,1.45],0x2f6f94,[.15,0,0],.22,.48);
  mountPad(g,[.70,.03,.48],0x436fae,[.62,.10,.42]);
  mountPad(g,[.66,.03,.46],0xd99c45,[.62,.10,-.40]);
  mountPad(g,[.72,.03,.50],0x5b8d9e,[-.12,.10,.42]);
  mountPad(g,[.70,.03,.50],0x667780,[-.12,.10,-.40]);
  mountPad(g,[.72,.03,.50],0xd7a444,[-.88,.10,0]);
  mountPad(g,[.20,.03,1.55],0x6d818c,[1.08,-.02,0]);
  mountPad(g,[.20,.03,1.55],0xb47731,[-1.15,-.02,0]);
  box(g,[.55,.22,1.36],0x4ca3d4,[1.35,.06,0],.12,.4);
}

function roadBase(g:THREE.Group){
  box(g,[3.0,.10,3.0],0x789096,[0,-.58,0],.02,.95);
}

function roadStraight(g:THREE.Group){
  box(g,[1.8,.10,3.0],0x5d666b,[0,-.58,0],.02,.92);
  for(const z of [-1.0,0,1.0]) box(g,[.07,.015,.50],0xffef9a,[0,-.515,z],.01,.6);
  box(g,[.10,.02,3.0],0xffffff,[-.78,-.51,0],.01,.8); box(g,[.10,.02,3.0],0xffffff,[.78,-.51,0],.01,.8);
}

function roadCurve(g:THREE.Group){
  roadBase(g);
  const shape=new THREE.Shape();
  shape.moveTo(-.82,-1.5); shape.lineTo(.82,-1.5);
  shape.absarc(.82,-.82,1.64,-Math.PI/2,0,false);
  shape.lineTo(1.5,.82); shape.absarc(.82,-.82,.0,0,0,false);
  const geom=new THREE.ShapeGeometry(shape,24);
  const mesh=new THREE.Mesh(geom,mat(0x5d666b,.02,.92)); mesh.rotation.x=-Math.PI/2; mesh.position.y=-.50; mesh.receiveShadow=true; g.add(mesh);
  const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,-.48,-1.42),new THREE.Vector3(0,-.48,0),new THREE.Vector3(1.42,-.48,0));
  for(let i=1;i<6;i++){ const p=curve.getPoint(i/6); box(g,[.07,.015,.35],0xffef9a,[p.x,p.y,p.z],.01,.6); }
}

function intersection(g:THREE.Group){
  roadBase(g);
  box(g,[1.8,.03,3.0],0x5d666b,[0,-.50,0],.02,.92); box(g,[3.0,.03,1.8],0x5d666b,[0,-.49,0],.02,.92);
  for(const v of [-1.05,1.05]){
    box(g,[.07,.015,.50],0xffef9a,[0,-.46,v],.01,.6);
    box(g,[.50,.015,.07],0xffef9a,[v,-.46,0],.01,.6);
  }
}

function trafficLight(g:THREE.Group,green:boolean){
  cylinder(g,.08,1.65,0x4b5960,[0,.18,0],'y',.28);
  box(g,[.46,.78,.28],0x243039,[0,1.08,0],.20,.42);
  const red=new THREE.Mesh(new THREE.SphereGeometry(.12,18,12),mat(green?0x4c1717:0xff322e,.05,.35)); red.position.set(0,1.28,.16); g.add(red);
  const amber=new THREE.Mesh(new THREE.SphereGeometry(.12,18,12),mat(0x6f5a16,.05,.35)); amber.position.set(0,1.08,.16); g.add(amber);
  const gr=new THREE.Mesh(new THREE.SphereGeometry(.12,18,12),mat(green?0x28d465:0x174d2a,.05,.35)); gr.position.set(0,.88,.16); g.add(gr);
  if(red.material instanceof THREE.MeshStandardMaterial){ red.material.emissive.setHex(green?0x000000:0xff1d18); red.material.emissiveIntensity=green?0:.9; }
  if(gr.material instanceof THREE.MeshStandardMaterial){ gr.material.emissive.setHex(green?0x22d65d:0x000000); gr.material.emissiveIntensity=green?.9:0; }
}

function stopSign(g:THREE.Group){
  cylinder(g,.06,1.35,0x5d676c,[0,.05,0],'y',.3);
  const geom=new THREE.CylinderGeometry(.34,.34,.05,8); const sign=new THREE.Mesh(geom,mat(0xd73531,.05,.48));
  sign.rotation.x=Math.PI/2; sign.position.set(0,.86,0); g.add(sign);
  box(g,[.34,.08,.025],0xffffff,[0,.86,.04],.01,.5);
}

function speedSign(g:THREE.Group){
  cylinder(g,.06,1.35,0x5d676c,[0,.05,0],'y',.3);
  const face=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.05,28),mat(0xf5f4ee,.02,.55));
  face.rotation.x=Math.PI/2; face.position.set(0,.86,0); g.add(face);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.265,.035,10,30),mat(0xd73531,.02,.45));
  ring.position.set(0,.86,.035); g.add(ring);
  box(g,[.08,.28,.025],0x24292d,[-.08,.86,.07],.01,.6);
  box(g,[.08,.28,.025],0x24292d,[.10,.86,.07],.01,.6);
}

function addPorts(g:THREE.Group,instance:ModuleInstance){
  for(const port of MODULES[instance.type].ports){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.105,14,10),new THREE.MeshStandardMaterial({
      color:PORT_COLORS[port.signal],emissive:PORT_COLORS[port.signal],emissiveIntensity:.16,roughness:.35,
    }));
    mesh.position.set(...port.position); mesh.userData.isPortVisual=true; mesh.userData.portId=port.id; mesh.userData.signal=port.signal; mesh.visible=false; g.add(mesh);
  }
}

export function createModuleObject(instance:ModuleInstance){
  const g=new THREE.Group(); g.position.set(...instance.position); g.rotation.y=instance.rotationY;
  g.userData.moduleId=instance.id; g.userData.moduleType=instance.type; g.userData.moduleRoot=g;

  if(instance.type==='battery') battery(g);
  else if(instance.type==='switch') switchPart(g,instance.switchOn!==false);
  else if(instance.type==='motor') motor(g);
  else if(instance.type==='gearbox') gearbox(g);
  else if(instance.type==='differential') differential(g);
  else if(instance.type==='front-axle') axle(g,false);
  else if(instance.type==='drive-axle') axle(g,true);
  else if(instance.type==='wheel') wheel(g);
  else if(instance.type==='car-base') chassis(g);
  else if(instance.type==='road-straight') roadStraight(g);
  else if(instance.type==='road-curve') roadCurve(g);
  else if(instance.type==='road-intersection') intersection(g);
  else if(instance.type==='traffic-light') trafficLight(g,instance.switchOn!==false);
  else if(instance.type==='stop-sign') stopSign(g);
  else if(instance.type==='speed-sign') speedSign(g);

  addPorts(g,instance);
  g.traverse(child=>{child.userData.moduleId=instance.id; child.userData.moduleRoot=g;});
  return g;
}

export function setPortVisualsVisible(object:THREE.Group,visible:boolean,connected:Set<string>){
  object.traverse(child=>{
    if(!child.userData.isPortVisual) return;
    child.visible=visible;
    const mesh=child as THREE.Mesh; const material=mesh.material;
    if(!(material instanceof THREE.MeshStandardMaterial)) return;
    const signal=child.userData.signal as SignalType;
    const color=connected.has(child.userData.portId)?0x54bf7a:PORT_COLORS[signal];
    material.color.setHex(color); material.emissive.setHex(color);
    material.emissiveIntensity=connected.has(child.userData.portId)?.48:.16;
  });
}
