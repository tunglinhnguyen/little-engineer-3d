import * as THREE from 'three';
import type { ModuleInstance, Vector3Tuple } from '../core/types';
import { MODULES } from '../core/moduleRegistry';
import { CURVE_RADIUS, HALF_TRACK, ROAD_HALF_LENGTH, ROAD_HEIGHT, ROAD_WIDTH, WHEEL_RADIUS, LOCAL_SLOTS } from '../core/layout';
import { curvePoint } from '../core/worldRoutes';

const material=(color:number,metalness=.12,roughness=.55)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
function mesh(g:THREE.Object3D,geometry:THREE.BufferGeometry,color:number,p:Vector3Tuple=[0,0,0]){
 const m=new THREE.Mesh(geometry,material(color));m.position.set(...p);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
function box(g:THREE.Object3D,size:Vector3Tuple,color:number,p:Vector3Tuple=[0,0,0]){return mesh(g,new THREE.BoxGeometry(...size),color,p);}
function cylinder(g:THREE.Object3D,r:number,len:number,color:number,p:Vector3Tuple=[0,0,0],axis:'x'|'y'|'z'='y',segments=24){
 const m=mesh(g,new THREE.CylinderGeometry(r,r,len,segments),color,p);
 if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;return m;
}
function spinGroup(g:THREE.Object3D,p:Vector3Tuple,axis:'x'|'y'|'z',source='output'){
 const root=new THREE.Group();root.position.set(...p);root.userData.rotor=true;root.userData.rotorAxis=axis;root.userData.rpmSource=source;g.add(root);return root;
}
function gear(g:THREE.Object3D,teeth:number,r:number,p:Vector3Tuple,axis:'x'|'z',source:string,color=0xe6b757){
 const root=spinGroup(g,p,axis,source);root.userData.teeth=teeth;
 cylinder(root,r*.84,.055,color,[0,0,0],axis);
 for(let i=0;i<teeth;i++){
  const a=i*2*Math.PI/teeth;
  const pos:Vector3Tuple=axis==='x'?[0,Math.cos(a)*r,Math.sin(a)*r]:[Math.cos(a)*r,Math.sin(a)*r,0];
  const tooth=box(root,axis==='x'?[.055,r*.20,r*.26]:[r*.20,r*.26,.055],color,pos);
  if(axis==='x')tooth.rotation.x=a;else tooth.rotation.z=a;
 }
 cylinder(root,r*.28,.075,0x405561,[0,0,0],axis);return root;
}
function label(g:THREE.Object3D,text:string,p:Vector3Tuple,width:number,height:number,bg='#ffffff',fg='#173247'){
 const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({color:bg,side:THREE.DoubleSide}));m.position.set(...p);m.userData.labelText=text;
 if(typeof document!=='undefined'){
  const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d')!;
  ctx.fillStyle=bg;ctx.fillRect(0,0,256,128);ctx.fillStyle=fg;ctx.font='bold 76px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,65);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;(m.material as THREE.MeshBasicMaterial).map=t;(m.material as THREE.MeshBasicMaterial).color.set('white');
 }
 g.add(m);return m;
}
function chassis(g:THREE.Group){
 // A bare frame: no pre-installed wheels, motor or axles.
 for(const z of [-.82,.82])box(g,[3.2,.18,.12],0x3078a0,[0,0,z]);
 for(const x of [-1.50,0,1.50])box(g,[.13,.12,1.70],0x3889ad,[x,0,0]);
 box(g,[.90,.05,1.46],0x789ba2,[.82,.075,0]);
 for(const z of [-.22,.22])box(g,[1.55,.05,.055],0x789ba2,[-.36,.075,z]);
 for(const x of [-1.15,1.15])for(const z of [-.65,.65])box(g,[.16,.25,.15],0x4e6676,[x,-.11,z]);
 box(g,[.12,.18,1.76],0xe9c85b,[1.55,0,0]);
}
function battery(g:THREE.Group){
 box(g,[.56,.34,.40],0x487faf,[0,.03,0]);box(g,[.58,.045,.42],0x25485e,[0,.22,0]);
 cylinder(g,.05,.065,0xe86050,[.14,.27,0]);cylinder(g,.05,.065,0x334650,[-.14,.27,0]);
 const plus=label(g,'+',[.14,.311,0],.09,.09,'#e86050','#ffffff');plus.rotation.x=-Math.PI/2;
 const minus=label(g,'−',[-.14,.311,0],.09,.09,'#334650','#ffffff');minus.rotation.x=-Math.PI/2;
 label(g,'6 V',[0,.06,.205],.30,.17,'#487faf','#ffffff');
}
function switchPart(g:THREE.Group,on:boolean){
 box(g,[.36,.22,.34],0xe6c362,[0,.015,0]);
 const lever=box(g,[.23,.08,.14],on?0x41b788:0xdc6b59,[0,.18,0]);lever.rotation.z=on?-.25:.25;
 for(const x of [-.19,.19])cylinder(g,.027,.05,0xd8af65,[x,.03,0],'x');
 label(g,on?'I':'O',[0,.08,.172],.12,.12,'#e6c362');
}
function motor(g:THREE.Group){
 cylinder(g,.18,.48,0x8eabb5,[.03,0,0],'x');cylinder(g,.19,.06,0x405e6e,[.29,0,0],'x');
 for(const z of [-.14,.14])box(g,[.15,.075,.05],0x405e6e,[.15,-.18,z]);
 for(const z of [-.18,.18])cylinder(g,.025,.045,0xd9ae5e,[.28,.12,z],'z');
 const rotor=spinGroup(g,[-.27,0,0],'x');
 cylinder(rotor,.048,.24,0xb4c5cd,[-.02,0,0],'x');box(rotor,[.055,.15,.035],0xe5ba5c,[-.12,0,0]);
 for(let i=0;i<5;i++)box(g,[.08,.12,.014],0x405e6e,[.18,0,.178]).rotation.x=i*Math.PI/5;
}
function gearbox(g:THREE.Group){
 box(g,[.46,.06,.50],0x4c6b7a,[0,-.43,0]);
 for(const x of [-.19,.19])for(const z of [-.21,.21])box(g,[.05,.50,.05],0x4c6b7a,[x,-.15,z]);
 gear(g,12,.08,[0,.02,0],'x','input');gear(g,24,.16,[0,-.22,0],'x','output');
 for(const [y,source] of [[.02,'input'],[-.22,'output']] as const){const shaft=spinGroup(g,[0,y,0],'x',source);cylinder(shaft,.03,.48,0x95afb9,[0,0,0],'x');}
 const cover=box(g,[.018,.52,.48],0x93c9d4,[.22,-.15,0]);(cover.material as THREE.MeshStandardMaterial).transparent=true;(cover.material as THREE.MeshStandardMaterial).opacity=.19;
}
function differential(g:THREE.Group){
 box(g,[.50,.06,.48],0x4d6975,[0,-.48,0]);
 for(const z of [-.25,.25])box(g,[.22,.49,.06],0x4d6975,[0,-.205,z]);
 gear(g,18,.17,[0,-.24,0],'z','output',0xe4ba59);
 gear(g,6,.07,[.19,-.07,0],'x','input',0xaebfc5);
 const input=spinGroup(g,[.19,-.07,0],'x','input');cylinder(input,.03,.22,0xaabfc5,[0,0,0],'x');
 const carrier=spinGroup(g,[0,-.24,0],'z');cylinder(carrier,.055,.64,0xaabfc5,[0,0,0],'z');
 const cover=box(g,[.015,.49,.43],0x86cad4,[.24,-.205,0]);(cover.material as THREE.MeshStandardMaterial).transparent=true;(cover.material as THREE.MeshStandardMaterial).opacity=.18;
}
function axle(g:THREE.Group,driven:boolean){
 if(driven){
  for(const side of [-1,1]){const shaft=spinGroup(g,[0,0,side*.56],'z');shaft.userData.side=side; cylinder(shaft,.055,1.12,0x859ca6,[0,0,0],'z');box(shaft,[.09,.11,.06],0xe4ba59,[0,0,side*.45]);}
  box(g,[.34,.11,.25],0x415a69,[0,-.04,0]);
 }else{
  box(g,[.16,.13,1.85],0x637e8b);box(g,[.045,.045,1.75],0xa3b6bf,[-.17,.04,0]);
  for(const side of [-1,1]){
   const knuckle=new THREE.Group();knuckle.position.set(0,0,side*HALF_TRACK);knuckle.userData.steeringSide=side;g.add(knuckle);
   cylinder(knuckle,.08,.13,0x6c8793,[0,0,0],'y');cylinder(knuckle,.05,.22,0xb0c2c9,[0,0,0],'z');
  }
 }
}
function wheel(g:THREE.Group){
 const rotor=spinGroup(g,[0,0,0],'z');
 cylinder(rotor,WHEEL_RADIUS,.22,0x283943,[0,0,0],'z',40);
 for(const side of [-1,1]){
  cylinder(rotor,.23,.014,0xb9cbd0,[0,0,side*.116],'z');
  for(let i=0;i<6;i++){const a=i*Math.PI/3;box(rotor,[.20,.035,.016],0x527286,[.11*Math.cos(a),.11*Math.sin(a),side*.126]).rotation.z=a;}
  cylinder(rotor,.07,.022,0xd3ae58,[0,0,side*.13],'z');
 }
 for(let i=0;i<28;i++){const a=i*Math.PI/14;box(rotor,[.035,.038,.225],0x41505a,[.316*Math.cos(a),.316*Math.sin(a),0]).rotation.z=a;}
}
function strip(g:THREE.Group,points:Vector3Tuple[],half:number,color:number,y=ROAD_HEIGHT,thickness=0){
 const v:number[]=[],indices:number[]=[];
 for(let i=0;i<points.length;i++){
  const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz)||1;
  const nx=dz/len*half,nz=-dx/len*half;v.push(p[0]-nx,y,p[2]-nz,p[0]+nx,y,p[2]+nz);
  if(i)indices.push((i-1)*2,(i-1)*2+1,i*2,(i-1)*2+1,i*2+1,i*2);
 }
 if(thickness>0){
  const count=v.length/3,top=[...v];
  for(let i=0;i<top.length;i+=3)v.push(top[i],y-thickness,top[i+2]);
  for(let i=1;i<points.length;i++)for(const side of [0,1]){
   const a=(i-1)*2+side,b=i*2+side;indices.push(a,b,a+count,b,b+count,a+count);
  }
  const end=(points.length-1)*2;indices.push(0,count,1,1,count,count+1,end,end+1,end+count,end+1,end+count+1,end+count);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setIndex(indices);geo.computeVertexNormals();
 const m=mesh(g,geo,color);(m.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;return m;
}
function paint(g:THREE.Group,points:Vector3Tuple[]){
 for(let i=1;i<points.length-1;i+=4)strip(g,points.slice(i,Math.min(i+2,points.length)),.035,0xf5d576,ROAD_HEIGHT+.008);
 for(const side of [-1,1]){
  const edge=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],len=Math.hypot(b[0]-a[0],b[2]-a[2])||1;return [p[0]+side*(b[2]-a[2])/len*(ROAD_WIDTH/2-.12),ROAD_HEIGHT+.007,p[2]-side*(b[0]-a[0])/len*(ROAD_WIDTH/2-.12)] as Vector3Tuple;});
  strip(g,edge,.025,0xe7ece8,ROAD_HEIGHT+.008);
 }
}
function roadStraight(g:THREE.Group){
 box(g,[ROAD_WIDTH,ROAD_HEIGHT,ROAD_HALF_LENGTH*2],0x596770,[0,ROAD_HEIGHT/2,0]);
 const points=Array.from({length:33},(_,i)=>[0,ROAD_HEIGHT,-ROAD_HALF_LENGTH+i*ROAD_HALF_LENGTH/16] as Vector3Tuple);paint(g,points);
}
function roadCurve(g:THREE.Group){const pts=Array.from({length:65},(_,i)=>curvePoint(i/64));strip(g,pts,ROAD_WIDTH/2,0x596770,ROAD_HEIGHT,ROAD_HEIGHT);paint(g,pts);}
function intersection(g:THREE.Group){
 box(g,[ROAD_WIDTH,ROAD_HEIGHT,ROAD_HALF_LENGTH*2],0x596770,[0,ROAD_HEIGHT/2,0]);box(g,[ROAD_HALF_LENGTH*2,ROAD_HEIGHT,ROAD_WIDTH],0x596770,[0,ROAD_HEIGHT/2,0]);
 for(const d of [-1,1])for(const j of [1.95,2.23]){box(g,[.07,.012,.16],0xf5d576,[0,ROAD_HEIGHT+.01,d*j]);box(g,[.16,.012,.07],0xf5d576,[d*j,ROAD_HEIGHT+.01,0]);}
}
function trafficLight(g:THREE.Group,green:boolean){
 box(g,[.40,.08,.40],0x5c737e,[0,.04,0]);cylinder(g,.045,1.26,0x637b86,[0,.69,0]);box(g,[.38,.57,.22],0x263e4d,[0,1.51,0]);
 for(let i=0;i<3;i++){
  const on=(i===0&&!green)||(i===2&&green),color=i===0?0xee6159:i===1?0xdfae4c:0x41c997;
  const bulb=cylinder(g,.072,.025,on?color:0x344f5a,[0,1.70-i*.18,.125],'z');if(on){(bulb.material as THREE.MeshStandardMaterial).emissive.setHex(color);(bulb.material as THREE.MeshStandardMaterial).emissiveIntensity=.8;}
 }
}
function sign(g:THREE.Group,stop:boolean){
 box(g,[.36,.06,.22],0x637b86,[0,.03,0]);cylinder(g,.035,1.30,0x849ca5,[0,.68,-.06]);
 const face=cylinder(g,.29,.05,stop?0xde5b51:0xe4eae7,[0,1.30,0],'z',stop?8:40);
 if(stop)face.geometry.rotateY(Math.PI/8);
 if(!stop){const rim=new THREE.Mesh(new THREE.TorusGeometry(.255,.024,8,40),material(0xde5b51));rim.position.set(0,1.30,.028);g.add(rim);}
 label(g,stop?'STOP':'30',[0,1.30,.034],stop?.40:.36,.20,stop?'#de5b51':'#e4eae7',stop?'#ffffff':'#233d4b');
}
export function createModuleObject(instance:ModuleInstance){
 const g=new THREE.Group();g.position.set(...instance.position);g.rotation.y=instance.rotationY;g.userData.moduleId=instance.id;g.userData.moduleType=instance.type;g.userData.moduleRoot=g;
 switch(instance.type){
  case 'car-base':chassis(g);break;case 'battery':battery(g);break;case 'switch':switchPart(g,instance.switchOn!==false);break;
  case 'motor':motor(g);break;case 'gearbox':gearbox(g);break;case 'differential':differential(g);break;
  case 'front-axle':axle(g,false);break;case 'drive-axle':axle(g,true);break;case 'wheel':wheel(g);break;
  case 'road-straight':roadStraight(g);break;case 'road-curve':roadCurve(g);break;case 'road-intersection':intersection(g);break;
  case 'traffic-light':trafficLight(g,instance.switchOn!==false);break;case 'stop-sign':sign(g,true);break;case 'speed-sign':sign(g,false);break;
 }
 g.traverse(c=>{c.userData.moduleId=instance.id;c.userData.moduleRoot=g;});return g;
}
export function disposeObject(g:THREE.Object3D){
 g.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh||(m as unknown as THREE.Line).isLine){m.geometry.dispose();const mats=Array.isArray(m.material)?m.material:[m.material];for(const mat of mats){(mat as THREE.MeshStandardMaterial).map?.dispose();mat.dispose();}}});
}
const heights=new Map<string,number>();
export function restHeight(type:ModuleInstance['type']){
 if(heights.has(type))return heights.get(type)!;
 const obj=createModuleObject({id:'bounds',type,position:[0,0,0],rotationY:0});const y=-new THREE.Box3().setFromObject(obj).min.y;disposeObject(obj);heights.set(type,y);return y;
}
export function setPortVisualsVisible(_g:THREE.Object3D,_v:boolean,_connected:Set<string>){}
export function mountGuides(parent:ModuleInstance,poses:Vector3Tuple[]){
 const group=new THREE.Group();group.userData.isGuide=true;
 for(const p of poses){const ring=new THREE.Mesh(new THREE.TorusGeometry(.19,.018,8,36),new THREE.MeshBasicMaterial({color:0x36c5a0,transparent:true,opacity:.6,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(...p);group.add(ring);}
 return group;
}
