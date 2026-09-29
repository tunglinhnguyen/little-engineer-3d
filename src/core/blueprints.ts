import type { Connection, ModuleInstance, ModuleType } from './types';

export interface Blueprint {
  id: string;
  title: string;
  icon: string;
  description: string;
  modules: { key: string; type: ModuleType; offset: [number, number, number]; rotationY?: number; switchOn?: boolean }[];
  links: { from: string; fromPort: string; to: string; toPort: string }[];
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: 'electric-car', title: 'Ô tô điện cơ bản', icon: '🚗',
    description: 'Pin → Công tắc → Mô tơ → Hộp số → Vi sai → Ô tô.',
    modules: [
      { key:'battery',type:'battery',offset:[-5,0,0] },
      { key:'switch',type:'switch',offset:[-3.5,0,0],switchOn:true },
      { key:'motor',type:'motor',offset:[-2,0,0] },
      { key:'gearbox',type:'gearbox',offset:[-.5,0,0] },
      { key:'diff',type:'differential',offset:[1,0,0] },
      { key:'car',type:'car-base',offset:[3,0,0] },
      { key:'road',type:'road-straight',offset:[3,-.55,0] },
    ],
    links:[
      {from:'battery',fromPort:'power-out',to:'switch',toPort:'power-in'},
      {from:'switch',fromPort:'power-out',to:'motor',toPort:'power-in'},
      {from:'motor',fromPort:'rotation-out',to:'gearbox',toPort:'rotation-in'},
      {from:'gearbox',fromPort:'rotation-out',to:'diff',toPort:'rotation-in'},
      {from:'diff',fromPort:'rotation-out',to:'car',toPort:'rotation-in'},
    ],
  },
  {
    id:'pump-system', title:'Hệ bơm nước', icon:'💧',
    description:'Nguồn điện và nguồn nước cùng cấp cho bơm.',
    modules:[
      {key:'battery',type:'battery',offset:[-4,0,-1.5]},
      {key:'switch',type:'switch',offset:[-2.5,0,-1.5],switchOn:true},
      {key:'motor',type:'motor',offset:[-1,0,-1.5]},
      {key:'shaft',type:'shaft',offset:[.6,0,-1.5]},
      {key:'pump',type:'pump',offset:[2.1,0,-1.5]},
      {key:'tank',type:'water-tank',offset:[.2,0,1.6]},
      {key:'pipe',type:'pipe',offset:[2.1,0,.2]},
      {key:'nozzle',type:'nozzle',offset:[2.1,0,1.7]},
    ],
    links:[
      {from:'battery',fromPort:'power-out',to:'switch',toPort:'power-in'},
      {from:'switch',fromPort:'power-out',to:'motor',toPort:'power-in'},
      {from:'motor',fromPort:'rotation-out',to:'shaft',toPort:'rotation-in'},
      {from:'shaft',fromPort:'rotation-out',to:'pump',toPort:'rotation-in'},
      {from:'tank',fromPort:'fluid-out',to:'pipe',toPort:'fluid-in'},
      {from:'pipe',fromPort:'fluid-out',to:'pump',toPort:'fluid-in'},
      {from:'pump',fromPort:'fluid-out',to:'nozzle',toPort:'fluid-in'},
    ],
  },
  {
    id:'train-line', title:'Tuyến tàu mini', icon:'🚂',
    description:'Đầu tàu điện với tuyến ray thẳng và toa.',
    modules:[
      {key:'battery',type:'battery',offset:[-5,0,-2]},
      {key:'switch',type:'switch',offset:[-3.5,0,-2],switchOn:true},
      {key:'motor',type:'motor',offset:[-2,0,-2]},
      {key:'gearbox',type:'gearbox',offset:[-.5,0,-2]},
      {key:'engine',type:'train-engine',offset:[1.5,0,-2]},
      {key:'wagon',type:'train-wagon',offset:[4,0,-2]},
      {key:'rail1',type:'rail-straight',offset:[1.5,-.55,-2]},
      {key:'rail2',type:'rail-straight',offset:[1.5,-.55,1]},
    ],
    links:[
      {from:'battery',fromPort:'power-out',to:'switch',toPort:'power-in'},
      {from:'switch',fromPort:'power-out',to:'motor',toPort:'power-in'},
      {from:'motor',fromPort:'rotation-out',to:'gearbox',toPort:'rotation-in'},
      {from:'gearbox',fromPort:'rotation-out',to:'engine',toPort:'rotation-in'},
      {from:'engine',fromPort:'coupler-front',to:'wagon',toPort:'coupler-back'},
    ],
  },
  {
    id:'two-storey-home', title:'Nhà hai tầng', icon:'🏡',
    description:'Khung nhà mẫu để bé tiếp tục trang trí.',
    modules:[
      {key:'foundation',type:'foundation',offset:[0,0,0]},
      {key:'wall1',type:'wall',offset:[0,.95,-1.5]},
      {key:'wall2',type:'door-wall',offset:[0,.95,1.5]},
      {key:'wall3',type:'window-wall',offset:[-1.5,.95,0],rotationY:Math.PI/2},
      {key:'wall4',type:'wall',offset:[1.5,.95,0],rotationY:Math.PI/2},
      {key:'floor2',type:'floor-slab',offset:[0,1.9,0]},
      {key:'stairs',type:'stairs',offset:[.45,.7,0]},
      {key:'roof',type:'roof',offset:[0,3.2,0]},
      {key:'sofa',type:'sofa',offset:[-.4,.65,.4]},
      {key:'table',type:'table',offset:[.6,.65,.4]},
    ],
    links:[],
  },
];

export function instantiateBlueprint(blueprint: Blueprint, origin: [number,number,number]) {
  const ids = new Map<string,string>();
  const modules: ModuleInstance[] = blueprint.modules.map(spec => {
    const id = spec.type + '-' + crypto.randomUUID().slice(0,8);
    ids.set(spec.key,id);
    return {
      id,
      type: spec.type,
      position: [
        origin[0] + spec.offset[0],
        origin[1] + spec.offset[1],
        origin[2] + spec.offset[2],
      ],
      rotationY: spec.rotationY ?? 0,
      switchOn: spec.switchOn,
    };
  });
  const connections: Connection[] = blueprint.links.map(link => ({
    id: crypto.randomUUID(),
    fromModuleId: ids.get(link.from)!,
    fromPortId: link.fromPort,
    toModuleId: ids.get(link.to)!,
    toPortId: link.toPort,
    signal:
      link.fromPort.includes('power') ? 'power' :
      link.fromPort.includes('fluid') ? 'fluid' :
      link.fromPort.includes('rotation') ? 'rotation' : 'structural',
  }));
  return { modules, connections };
}
