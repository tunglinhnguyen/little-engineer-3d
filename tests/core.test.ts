import { describe, expect, it, vi } from 'vitest';
import { Group, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../src/core/connectionGraph';
import { MODULES } from '../src/core/moduleRegistry';
import { SimulationEngine } from '../src/core/simulation';
import { getMissionFeedback, MISSIONS } from '../src/core/missions';
import { Workbench } from '../src/three/workbench';
import type { Connection, ModuleInstance, ModuleType } from '../src/core/types';

const module = (id: string, type: ModuleType, switchOn = true): ModuleInstance => ({ id, type, position: [0, 0, 0], rotationY: 0, switchOn });
const port = (type: ModuleType, id: string) => MODULES[type].ports.find(p => p.id === id)!;

describe('connector compatibility', () => {
  it('allows output to input of the same signal', () => expect(portsCompatible(port('battery','power-out'), port('switch','power-in'))).toBe(true));
  it('rejects power to rotation', () => expect(portsCompatible(port('battery','power-out'), port('shaft','rotation-in'))).toBe(false));
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
  it('rejects ports facing the same way', () => {
    const { graph, sw } = setupLamp(false);
    sw.rotationY = Math.PI;
    expect(graph.snapModule(sw.id)).toBe(false);
    expect(graph.connections.size).toBe(0);
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
    const state = { active: new Set(['spare-battery', 'spare-lamp']), powered: new Set<string>(), rpm: new Map<string, number>() };
    expect(getMissionFeedback(graph, MISSIONS[0], state, true).status).toBe('inactive');
  });
  it('gives fresh guidance when switching to a different mission', () => {
    const { graph } = setupLamp();
    expect(getMissionFeedback(graph, MISSIONS[1], new SimulationEngine(graph).evaluate(), true).status).toBe('incomplete');
  });
});

describe('all lesson assemblies', () => {
  it.each(MISSIONS)('snaps, runs and stops the $id machine', mission => {
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
});
