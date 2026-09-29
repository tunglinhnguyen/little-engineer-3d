import { describe, expect, it, vi } from 'vitest';
import { Group, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../src/core/connectionGraph';
import { MODULES } from '../src/core/moduleRegistry';
import { SimulationEngine } from '../src/core/simulation';
import { getMissionFeedback, MISSIONS } from '../src/core/missions';
import { Workbench } from '../src/three/workbench';
import { buildVehicleRoute, routeKindForVehicle } from '../src/core/worldRoutes';
import { vehicleCanTravel, vehicleInfrastructureStatus } from '../src/core/vehicleRules';
import type { Connection, ModuleInstance, ModuleType } from '../src/core/types';

const module = (id: string, type: ModuleType, switchOn = true): ModuleInstance => ({ id, type, position: [0, 0, 0], rotationY: 0, switchOn });
const port = (type: ModuleType, id: string) => MODULES[type].ports.find(p => p.id === id)!;

describe('connector compatibility', () => {
  it('allows output to input of the same signal', () => expect(portsCompatible(port('battery','power-out'), port('switch','power-in'))).toBe(true));
  it('rejects power to rotation', () => expect(portsCompatible(port('battery','power-out'), port('shaft','rotation-in'))).toBe(false));
  it('allows water source to fluid pipe', () => expect(portsCompatible(port('water-tank','fluid-out'), port('pipe','fluid-in'))).toBe(true));
  it('rejects water connected to an electrical input', () => expect(portsCompatible(port('water-tank','fluid-out'), port('motor','power-in'))).toBe(false));
});

function setupLamp(connected = true) {
  const graph = new ConnectionGraph();
  const battery = module('battery', 'battery'), sw = module('switch', 'switch'), lamp = module('lamp', 'lamp');
  battery.position = [0, .65, 0]; sw.position = [1.44, .65, 0]; lamp.position = [2.88, .65, 0];
  for (const m of [battery, sw, lamp]) graph.addModule(m);
  if (connected) graph.snapModule(sw.id);
  return { graph, battery, sw, lamp };
}

describe('snapping complete circuits', () => {
  it('connects both ends of a switch inserted between a battery and lamp', () => {
    const { graph, sw, lamp } = setupLamp(false);
    sw.position[0] += .1;
    expect(graph.snapModule(sw.id)).toBe(true);
    expect(graph.connections.size).toBe(2);
    expect(new SimulationEngine(graph).evaluate().active.has(lamp.id)).toBe(true);
    expect(sw.position[0]).toBeCloseTo(1.44);
  });
  it('does not move or duplicate an already connected circuit', () => {
    const { graph, sw } = setupLamp();
    const before = JSON.stringify(graph.serialize());
    expect(graph.snapModule(sw.id)).toBe(false);
    expect(JSON.stringify(graph.serialize())).toBe(before);
  });
  it('connects both ends after the entire layout is rotated 90 degrees', () => {
    const { graph, sw } = setupLamp(false);
    for (const m of graph.modules.values()) {
      m.position = [0, .65, -m.position[0]]; m.rotationY = Math.PI / 2;
    }
    expect(graph.snapModule(sw.id)).toBe(true);
    expect(graph.connections.size).toBe(2);
  });
  it('auto-rotates a compatible part whose ports initially face the wrong way', () => {
    const { graph, sw } = setupLamp(false);
    sw.rotationY = Math.PI;
    expect(graph.snapModule(sw.id)).toBe(true);
    expect(graph.connections.size).toBe(2);
    expect(sw.rotationY).not.toBe(Math.PI);
  });
  it('rejects electrical power connected directly to a rotation input', () => {
    const graph = new ConnectionGraph(), battery = module('b', 'battery'), fan = module('f', 'fan');
    fan.position[0] = 1.44; graph.addModule(battery); graph.addModule(fan);
    expect(graph.snapModule(fan.id)).toBe(false);
  });
  it('does not attach two consumers to an occupied port', () => {
    const { graph } = setupLamp();
    const extra = module('extra', 'lamp'); extra.position = [2.88, .65, 0]; graph.addModule(extra);
    expect(graph.snapModule(extra.id)).toBe(false);
    expect(graph.connections.size).toBe(2);
  });
});

describe('mission feedback', () => {
  const feedback = (graph: ConnectionGraph, running = true) => getMissionFeedback(graph, MISSIONS[0], new SimulationEngine(graph).evaluate(), running);
  it('reports ready before running and complete only while running', () => {
    const { graph } = setupLamp();
    expect(feedback(graph, false).status).toBe('ready');
    expect(feedback(graph).status).toBe('complete');
  });
  it('replaces the ready message with the exact missing connection', () => {
    const { graph, lamp } = setupLamp();
    expect(feedback(graph, false).status).toBe('ready');
    graph.disconnectModule(lamp.id);
    expect(feedback(graph, false).status).toBe('incomplete');
    expect(feedback(graph, false).message).toContain('Công tắc → Đèn');
  });
  it('ignores an unrelated switch that is off', () => {
    const { graph } = setupLamp(); graph.addModule(module('spare', 'switch', false));
    expect(feedback(graph).status).toBe('complete');
  });
  it('identifies an off switch in the actual mission path', () => {
    const { graph, sw } = setupLamp(); sw.switchOn = false;
    expect(feedback(graph).status).toBe('switch-off');
    expect(feedback(graph, false).status).toBe('switch-off');
  });
  it('accepts a working circuit when another complete circuit has an off switch', () => {
    const { graph, sw } = setupLamp(); sw.switchOn = false;
    const working = setupLamp().graph;
    for (const m of working.modules.values()) graph.addModule({ ...m, id: `working-${m.id}` });
    for (const c of working.connections.values()) graph.connect({ ...c, id: `working-${c.id}`, fromModuleId: `working-${c.fromModuleId}`, toModuleId: `working-${c.toModuleId}` });
    expect(feedback(graph).status).toBe('complete');
  });
  it('does not award success just because unrelated modules are active', () => {
    const { graph } = setupLamp();
    const state = {
      active: new Set(['spare-battery', 'spare-lamp']),
      powered: new Set<string>(),
      rpm: new Map<string, number>(),
      fluid: new Set<string>(),
      voltage: new Map<string, number>(),
      current: new Map<string, number>(),
      torque: new Map<string, number>(),
      flow: new Map<string, number>(),
      pressure: new Map<string, number>(),
      faults: new Map<string, string[]>(),
    };
    expect(getMissionFeedback(graph, MISSIONS[0], state, true).status).toBe('inactive');
  });
  it('gives fresh guidance when switching to a different mission', () => {
    const { graph } = setupLamp();
    expect(getMissionFeedback(graph, MISSIONS[1], new SimulationEngine(graph).evaluate(), true).status).toBe('incomplete');
  });
});

describe('all lesson assemblies', () => {
  it.each(MISSIONS.filter(m => !m.requiredPaths?.length && !m.requiredModules?.length && !m.buildOnly))('snaps, runs and stops the $id machine', mission => {
    const graph = new ConnectionGraph();
    const chain = mission.requiredPath.map((type, i) => module(`part-${i}`, type));
    chain[0].position = [0, .65, 0]; graph.addModule(chain[0]);
    for (let i = 1; i < chain.length; i++) {
      const previous = chain[i - 1], current = chain[i];
      const input = MODULES[current.type].ports.find(p => p.direction === 'in')!;
      const output = MODULES[previous.type].ports.find(p => p.direction === 'out' && p.signal === input.signal)!;
      current.position = [previous.position[0] + output.position[0] - input.position[0], .65, 0];
      graph.addModule(current); expect(graph.snapModule(current.id)).toBe(true);
    }
    expect(graph.connections.size).toBe(chain.length - 1);
    const engine = new SimulationEngine(graph);
    expect(getMissionFeedback(graph, mission, engine.evaluate(), true).status).toBe('complete');
    chain.find(m => m.type === 'switch')!.switchOn = false;
    expect(engine.evaluate().active.has(chain[chain.length - 1].id)).toBe(false);
    expect(getMissionFeedback(graph, mission, engine.evaluate(), true).status).toBe('switch-off');
  });
});

// Exercise the production pointer handlers without requiring a WebGL context.
// Only ray hits and screen-to-world coordinates are supplied by the harness.
function pointerHarness(editable = true) {
  const { graph, sw, lamp } = setupLamp();
  const canvas = Object.assign(new EventTarget(), {
    setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(),
  });
  const objects = new Map<string, Group>();
  for (const m of graph.modules.values()) {
    const object = new Group(); object.position.set(...m.position); object.userData.moduleId = m.id; object.userData.moduleRoot = object;
    objects.set(m.id, object);
  }
  const ray = new Raycaster(), controls = { enabled: true };
  const hooks = { canEdit: () => editable, onSelect: vi.fn(), onGraphChanged: vi.fn() };
  const workbench = Object.assign(Object.create(Workbench.prototype), {
    graph, canvas, objects, ray, controls, hooks, selectedId: null,
    dragging: false, dragPointerId: null, dragModuleId: null, dragConnections: [],
    dragStart: new Vector2(), dragOrigin: new Vector3(), dragOffset: new Vector3(),
    dragPlane: new Plane(new Vector3(0, 1, 0), -.65),
    updatePointer: (e: PointerEvent) => ray.set(new Vector3(1.44 + (e.clientX - 100) / 50, 10, (e.clientY - 100) / 50), new Vector3(0, -1, 0)),
    cast: (e: PointerEvent) => { workbench.updatePointer(e); return [{ object: objects.get(sw.id) }]; },
  });
  workbench.bindPointer();
  const send = (type: string, x = 100, y = 100, pointerId = 1) => canvas.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, button: 0, pointerId }));
  return { graph, sw, lamp, send, controls, hooks, workbench };
}

describe('smart assembly rules', () => {
  it('auto-attaches a new switch to a selected battery and aligns the joint', () => {
    const g = new ConnectionGraph();
    const battery = module('auto-battery','battery');
    const sw = module('auto-switch','switch');
    battery.position = [0,.65,0];
    sw.position = [6,.65,3];
    g.addModule(battery);
    g.addModule(sw);
    expect(g.attachModuleToTarget(sw.id,battery.id)).toBe(true);
    expect(g.connections.size).toBe(1);
    expect(g.findPathByTypes(['battery','switch'])).toBe(true);
  });

  it('does not join a road directly to a building wall just because both are structural', () => {
    const g = new ConnectionGraph();
    const road = module('smart-road','road-straight');
    const wall = module('smart-wall','wall');
    g.addModule(road);
    g.addModule(wall);
    expect(g.attachModuleToTarget(wall.id,road.id)).toBe(false);
    expect(g.connections.size).toBe(0);
  });

  it('uses a dedicated rail bridge and does not mix it with road pieces', () => {
    const g = new ConnectionGraph();
    const rail = module('rail-for-bridge','rail-straight');
    const railBridge = module('rail-bridge-test','rail-bridge');
    const road = module('road-for-bridge','road-straight');
    [rail,railBridge,road].forEach(m=>g.addModule(m));
    expect(g.attachModuleToTarget(railBridge.id,rail.id)).toBe(true);
    const road2 = module('road-for-bridge-2','road-straight');
    g.addModule(road2);
    expect(g.attachModuleToTarget(road2.id,railBridge.id)).toBe(false);
  });

  it('joins road to road and rail to rail but not road to rail', () => {
    const g = new ConnectionGraph();
    const roadA = module('road-a2','road-straight');
    const roadB = module('road-b2','road-curve');
    const rail = module('rail-a2','rail-straight');
    [roadA,roadB,rail].forEach(m=>g.addModule(m));
    expect(g.attachModuleToTarget(roadB.id,roadA.id)).toBe(true);
    expect(g.attachModuleToTarget(rail.id,roadA.id)).toBe(false);
  });
});

describe('world route planner', () => {
  it('classifies vehicle infrastructure correctly', () => {
    expect(routeKindForVehicle('car-base')).toBe('road');
    expect(routeKindForVehicle('train-engine')).toBe('rail');
    expect(routeKindForVehicle('airplane')).toBe('runway');
    expect(routeKindForVehicle('boat')).toBe(null);
  });

  it('routes through a snapped road junction component', () => {
    const g = new ConnectionGraph();
    const car = module('junction-car','car-base');
    const road = module('junction-road','road-straight');
    const junction = module('junction-node','road-crossing');
    car.position = [0,.65,-2];
    road.position = [0,.65,0];
    junction.position = [0,.65,2.7];
    [car,road,junction].forEach(m=>g.addModule(m));
    expect(g.snapModule(junction.id)).toBe(true);
    expect(buildVehicleRoute(g,car.id).length).toBeGreaterThanOrEqual(3);
  });

  it('builds a continuous road route from snapped road pieces', () => {
    const g = new ConnectionGraph();
    const car = module('route-car', 'car-base');
    car.position = [0, .65, -2.4];
    const a = module('road-a', 'road-straight');
    a.position = [0, .65, 0];
    const b = module('road-b', 'road-straight');
    b.position = [0, .65, 2.88];
    [car, a, b].forEach(m => g.addModule(m));
    expect(g.snapModule(b.id)).toBe(true);
    const route = buildVehicleRoute(g, car.id);
    expect(route.length).toBeGreaterThanOrEqual(3);
    expect(route[0][2]).toBeLessThan(route[route.length - 1][2]);
  });

  it('follows the same quarter-circle geometry as a rendered road curve', () => {
    const g = new ConnectionGraph();
    const car = module('curve-car','car-base');
    const curve = module('curve-road','road-curve');
    car.position = [.5,.65,-.5];
    curve.position = [0,.65,0];
    g.addModule(car); g.addModule(curve);
    const route = buildVehicleRoute(g,car.id);
    expect(route.length).toBeGreaterThan(6);
    expect(route[0][0]).toBeCloseTo(0,1);
    expect(route[0][2]).toBeCloseTo(-.925,2);
    expect(route[route.length - 1][0]).toBeCloseTo(.925,2);
    expect(route[route.length - 1][2]).toBeCloseTo(0,1);
  });

  it('preserves curve samples inside a connected road network', () => {
    const g = new ConnectionGraph();
    const car = module('network-car','car-base');
    const straight = module('network-straight','road-straight');
    const curve = module('network-curve','road-curve');
    car.position = [0,.65,-1.5];
    straight.position = [0,.65,0];
    curve.position = [0,.65,2.35];
    [car,straight,curve].forEach(m=>g.addModule(m));
    expect(g.snapModule(curve.id)).toBe(true);
    const route = buildVehicleRoute(g,car.id);
    expect(route.length).toBeGreaterThan(8);
    const curvedSamples = route.filter(p => Math.abs(p[0] - route[0][0]) > .08);
    expect(curvedSamples.length).toBeGreaterThan(3);
  });

  it('uses a nearby runway as a usable airplane route', () => {
    const g = new ConnectionGraph();
    const plane = module('route-plane', 'airplane');
    plane.position = [0, .65, 0];
    const runway = module('runway-one', 'runway');
    runway.position = [0, .65, 0];
    g.addModule(plane);
    g.addModule(runway);
    const route = buildVehicleRoute(g, plane.id);
    expect(route).toHaveLength(3);
    expect(Math.abs(route[2][2] - route[0][2])).toBeGreaterThan(3);
  });

  it('does not teleport a road vehicle to a remote road', () => {
    const g = new ConnectionGraph();
    const car = module('far-car','car-base');
    car.position = [0,.65,0];
    const road = module('far-road','road-straight');
    road.position = [18,.65,18];
    g.addModule(car);
    g.addModule(road);
    expect(buildVehicleRoute(g,car.id)).toHaveLength(0);
  });
});

describe('vehicle infrastructure rules', () => {
  it('keeps a driven car stationary when no road is nearby', () => {
    const g = new ConnectionGraph();
    const car = module('logic-car','car-base');
    car.position = [0,.65,0];
    g.addModule(car);
    const rpm = new Map([[car.id, 60]]);
    expect(vehicleCanTravel(g,car.id,rpm).ready).toBe(false);
    expect(vehicleInfrastructureStatus(g,car.id).kind).toBe('road');
  });

  it('accepts a nearby road but rejects a remote one', () => {
    const g = new ConnectionGraph();
    const car = module('logic-car2','car-base');
    const road = module('logic-road','road-straight');
    car.position = [0,.65,0];
    road.position = [2,.65,0];
    g.addModule(car); g.addModule(road);
    expect(vehicleInfrastructureStatus(g,car.id).ready).toBe(true);
    road.position = [15,.65,15];
    expect(vehicleInfrastructureStatus(g,car.id).ready).toBe(false);
  });

  it('requires water for a boat and helipad for a helicopter', () => {
    const g = new ConnectionGraph();
    const boat = module('logic-boat','boat');
    const heli = module('logic-heli','helicopter');
    boat.position = [0,.65,0];
    heli.position = [8,.65,0];
    g.addModule(boat); g.addModule(heli);
    expect(vehicleInfrastructureStatus(g,boat.id).ready).toBe(false);
    expect(vehicleInfrastructureStatus(g,heli.id).ready).toBe(false);
    const sea = module('logic-sea','sea-tile'); sea.position = [1,.65,0];
    const pad = module('logic-pad','helipad'); pad.position = [8,.65,1];
    g.addModule(sea); g.addModule(pad);
    expect(vehicleInfrastructureStatus(g,boat.id).ready).toBe(true);
    expect(vehicleInfrastructureStatus(g,heli.id).ready).toBe(true);
  });
});

describe('vehicle and world-building missions', () => {
  it('does not complete a car mission when the only road is far away', () => {
    const mission = MISSIONS.find(m => m.id === 'car')!;
    const g = new ConnectionGraph();
    const chain = mission.requiredPath.map((type, i) => module('far-mission-' + i, type));
    for (const m of chain) g.addModule(m);
    const connect = (a: ModuleInstance, ap: string, z: ModuleInstance, zp: string) => {
      const n = normalizeConnection(a, port(a.type, ap), z, port(z.type, zp))!;
      g.connect({ id: a.id + '-' + z.id, ...n } as Connection);
    };
    connect(chain[0],'power-out',chain[1],'power-in');
    connect(chain[1],'power-out',chain[2],'power-in');
    connect(chain[2],'rotation-out',chain[3],'rotation-in');
    connect(chain[3],'rotation-out',chain[4],'rotation-in');
    connect(chain[4],'rotation-out',chain[5],'rotation-in');
    const road = module('remote-road','road-straight');
    road.position = [20,.65,20];
    g.addModule(road);
    const state = new SimulationEngine(g).evaluate();
    expect(getMissionFeedback(g,mission,state,true).status).toBe('inactive');
  });

  it('completes the car mission only when the powered drivetrain and road both exist', () => {
    const mission = MISSIONS.find(m => m.id === 'car')!;
    const g = new ConnectionGraph();
    const chain = mission.requiredPath.map((type, i) => module('car-' + i, type));
    for (const m of chain) g.addModule(m);
    const connect = (a: ModuleInstance, ap: string, z: ModuleInstance, zp: string) => {
      const n = normalizeConnection(a, port(a.type, ap), z, port(z.type, zp))!;
      g.connect({ id: a.id + '-' + z.id, ...n } as Connection);
    };
    connect(chain[0],'power-out',chain[1],'power-in');
    connect(chain[1],'power-out',chain[2],'power-in');
    connect(chain[2],'rotation-out',chain[3],'rotation-in');
    connect(chain[3],'rotation-out',chain[4],'rotation-in');
    connect(chain[4],'rotation-out',chain[5],'rotation-in');
    expect(getMissionFeedback(g, mission, new SimulationEngine(g).evaluate(), true).status).toBe('incomplete');
    g.addModule(module('road','road-straight'));
    const state = new SimulationEngine(g).evaluate();
    expect(state.rpm.has(chain[5].id)).toBe(true);
    expect(getMissionFeedback(g, mission, state, true).status).toBe('complete');
  });

  it('recognizes a house as a construction mission without requiring simulation power', () => {
    const mission = MISSIONS.find(m => m.id === 'house')!;
    const g = new ConnectionGraph();
    for (const type of ['foundation','wall','door-wall','window-wall','roof'] as ModuleType[]) {
      g.addModule(module('house-' + type, type));
    }
    expect(getMissionFeedback(g, mission, new SimulationEngine(g).evaluate(), false).status).toBe('complete');
  });
});

describe('workbench pointer regressions', () => {
  it('keeps both connections and the lit lamp after a simple selection', () => {
    const { graph, lamp, send, hooks } = pointerHarness();
    const before = JSON.stringify(graph.serialize());
    send('pointerdown'); send('pointerup');
    expect(JSON.stringify(graph.serialize())).toBe(before);
    expect(new SimulationEngine(graph).evaluate().active.has(lamp.id)).toBe(true);
    expect(hooks.onGraphChanged).not.toHaveBeenCalled();
  });
  it('does not disconnect for small hand movement during a tap', () => {
    const { graph, send } = pointerHarness();
    const before = JSON.stringify(graph.serialize());
    send('pointerdown'); send('pointermove', 102, 101); send('pointerup', 102, 101);
    expect(JSON.stringify(graph.serialize())).toBe(before);
  });
  it('disconnects a part intentionally dragged away', () => {
    const { graph, lamp, send, controls } = pointerHarness();
    send('pointerdown'); send('pointermove', 200); send('pointerup', 200);
    expect(graph.connections.size).toBe(0);
    expect(new SimulationEngine(graph).evaluate().active.has(lamp.id)).toBe(false);
    expect(controls.enabled).toBe(true);
  });
  it('reconnects both ends when a dragged part returns to its slot', () => {
    const { graph, lamp, send } = pointerHarness();
    send('pointerdown'); send('pointermove', 200); send('pointermove'); send('pointerup');
    expect(graph.connections.size).toBe(2);
    expect(new SimulationEngine(graph).evaluate().active.has(lamp.id)).toBe(true);
  });
  it.each(['pointercancel', 'lostpointercapture'])('restores the circuit on %s', type => {
    const { graph, send, controls } = pointerHarness(); const before = JSON.stringify(graph.serialize());
    send('pointerdown'); send('pointermove', 200); send(type, 200);
    expect(JSON.stringify(graph.serialize())).toBe(before);
    expect(controls.enabled).toBe(true);
  });
  it('selects the switch while running without moving or disconnecting it', () => {
    const { graph, send, workbench, hooks } = pointerHarness(false); const before = JSON.stringify(graph.serialize());
    send('pointerdown'); send('pointermove', 200); send('pointerup', 200);
    expect(workbench.selectedId).toBe('switch');
    expect(hooks.onSelect).toHaveBeenCalledWith('switch');
    expect(JSON.stringify(graph.serialize())).toBe(before);
  });
  it('ignores a second pointer while dragging and restores on mode change', () => {
    const { graph, send, workbench } = pointerHarness(); const before = JSON.stringify(graph.serialize());
    send('pointerdown'); send('pointermove', 200); send('pointerup', 200, 100, 2);
    expect(graph.connections.size).toBe(0);
    workbench.cancelInteraction();
    expect(JSON.stringify(graph.serialize())).toBe(before);
  });
});


describe('saved project migration', () => {
  it('repairs a v1 assembly that visually touches but lost one switch connection', () => {
    const battery = module('battery', 'battery'), sw = module('switch', 'switch'), lamp = module('lamp', 'lamp');
    battery.position = [0, .65, 0]; sw.position = [1.44, .65, 0]; lamp.position = [2.88, .65, 0];
    const partial = normalizeConnection(battery, port('battery','power-out'), sw, port('switch','power-in'))!;
    const graph = new ConnectionGraph();
    graph.restore({
      version: 1,
      modules: [battery, sw, lamp],
      connections: [{ id: 'old-one-sided', ...partial } as Connection],
    });
    expect(graph.connections.size).toBe(2);
    expect(new SimulationEngine(graph).evaluate().active.has(lamp.id)).toBe(true);
    expect(graph.serialize().version).toBe(2);
  });

  it('ignores malformed v2 connections instead of showing a false connected state', () => {
    const battery = module('battery', 'battery'), fan = module('fan', 'fan');
    const graph = new ConnectionGraph();
    graph.restore({
      version: 2,
      modules: [battery, fan],
      connections: [{
        id: 'bad',
        fromModuleId: battery.id, fromPortId: 'power-out',
        toModuleId: fan.id, toPortId: 'rotation-in',
        signal: 'power',
      }],
    });
    expect(graph.connections.size).toBe(0);
    expect(new SimulationEngine(graph).evaluate().active.has(fan.id)).toBe(false);
  });
});

describe('simulation graph', () => {
  function setupFan(switchOn = true) {
    const g = new ConnectionGraph(); const b = module('b','battery'), s = module('s','switch',switchOn), m = module('m','motor'), sh = module('sh','shaft'), f = module('f','fan');
    [b,s,m,sh,f].forEach(x => g.addModule(x));
    const pairs: [ModuleInstance,string,ModuleInstance,string][] = [[b,'power-out',s,'power-in'],[s,'power-out',m,'power-in'],[m,'rotation-out',sh,'rotation-in'],[sh,'rotation-out',f,'rotation-in']];
    for (const [a,ap,z,zp] of pairs) { const n = normalizeConnection(a,port(a.type,ap),z,port(z.type,zp))!; g.connect({ id: `${a.id}-${z.id}`, ...n } as Connection); }
    return g;
  }
  it('runs a fan chain when switch is on', () => { const g = setupFan(true), state = new SimulationEngine(g).evaluate(); expect(state.powered.has('m')).toBe(true); expect(state.rpm.get('f')).toBe(120); expect(g.findPathByTypes(['battery','switch','motor','shaft','fan'])).toBe(true); });
  it('stops at an open switch', () => { const g = setupFan(false), state = new SimulationEngine(g).evaluate(); expect(state.powered.has('m')).toBe(false); expect(state.rpm.has('f')).toBe(false); });

  it('meshed 12-tooth and 24-tooth gears rotate opposite directions at half speed', () => {
    const g = new ConnectionGraph();
    const b = module('b2','battery'), s = module('s2','switch'), m = module('m2','motor');
    const gs = module('gs','gear-small'), gl = module('gl','gear-large'), w = module('w','wheel');
    [b,s,m,gs,gl,w].forEach(x => g.addModule(x));
    const pairs: [ModuleInstance,string,ModuleInstance,string][] = [
      [b,'power-out',s,'power-in'], [s,'power-out',m,'power-in'],
      [m,'rotation-out',gs,'rotation-in'], [gs,'rotation-out',gl,'rotation-in'],
      [gl,'rotation-out',w,'rotation-in'],
    ];
    for (const [a,ap,z,zp] of pairs) {
      const n = normalizeConnection(a,port(a.type,ap),z,port(z.type,zp))!;
      g.connect({ id: `${a.id}-${z.id}`, ...n } as Connection);
    }
    const state = new SimulationEngine(g).evaluate();
    expect(state.rpm.get('gs')).toBe(120);
    expect(state.rpm.get('gl')).toBe(-60);
    expect(state.rpm.get('w')).toBe(-60);
  });

  it('hand crank is a mechanical rotation source without a battery', () => {
    const g = new ConnectionGraph();
    const crank = module('crank','hand-crank'), shaft = module('shaft2','shaft'), fan = module('fan2','fan');
    [crank,shaft,fan].forEach(x => g.addModule(x));
    for (const [a,ap,z,zp] of [
      [crank,'rotation-out',shaft,'rotation-in'],
      [shaft,'rotation-out',fan,'rotation-in'],
    ] as [ModuleInstance,string,ModuleInstance,string][]) {
      const n = normalizeConnection(a,port(a.type,ap),z,port(z.type,zp))!;
      g.connect({ id: `${a.id}-${z.id}`, ...n } as Connection);
    }
    const state = new SimulationEngine(g).evaluate();
    expect(state.rpm.get('fan2')).toBe(45);
    expect(state.active.has('fan2')).toBe(true);
  });

  it('pump needs both shaft rotation and a water source before the nozzle flows', () => {
    const g = new ConnectionGraph();
    const battery = module('pb','battery'), sw = module('ps','switch'), motor = module('pm','motor');
    const shaft = module('psh','shaft'), pump = module('pump','pump');
    const tank = module('tank','water-tank'), pipe = module('pipe','pipe'), nozzle = module('nozzle','nozzle');
    [battery,sw,motor,shaft,pump,tank,pipe,nozzle].forEach(x => g.addModule(x));

    const connect = (a: ModuleInstance, ap: string, z: ModuleInstance, zp: string) => {
      const n = normalizeConnection(a, port(a.type, ap), z, port(z.type, zp))!;
      g.connect({ id: a.id + '-' + z.id + '-' + ap, ...n } as Connection);
    };

    connect(battery,'power-out',sw,'power-in');
    connect(sw,'power-out',motor,'power-in');
    connect(motor,'rotation-out',shaft,'rotation-in');
    connect(shaft,'rotation-out',pump,'rotation-in');
    connect(tank,'fluid-out',pipe,'fluid-in');
    connect(pipe,'fluid-out',pump,'fluid-in');
    connect(pump,'fluid-out',nozzle,'fluid-in');

    let state = new SimulationEngine(g).evaluate();
    expect(state.rpm.get('pump')).toBe(120);
    expect(state.fluid.has('pump')).toBe(true);
    expect(state.fluid.has('nozzle')).toBe(true);

    g.disconnectModule(tank.id);
    state = new SimulationEngine(g).evaluate();
    expect(state.rpm.get('pump')).toBe(120);
    expect(state.fluid.has('pump')).toBe(false);
    expect(state.fluid.has('nozzle')).toBe(false);
  });

  it('closed water valve blocks fluid without stopping the motor', () => {
    const g = new ConnectionGraph();
    const tank = module('tank2','water-tank'), valve = module('valve2','valve',false), pipe = module('pipe2','pipe');
    [tank,valve,pipe].forEach(x => g.addModule(x));
    const a = normalizeConnection(tank,port('water-tank','fluid-out'),valve,port('valve','fluid-in'))!;
    const b = normalizeConnection(valve,port('valve','fluid-out'),pipe,port('pipe','fluid-in'))!;
    g.connect({ id:'water-a', ...a } as Connection);
    g.connect({ id:'water-b', ...b } as Connection);
    expect(new SimulationEngine(g).evaluate().fluid.has(pipe.id)).toBe(false);
    valve.switchOn = true;
    expect(new SimulationEngine(g).evaluate().fluid.has(pipe.id)).toBe(true);
  });
});
