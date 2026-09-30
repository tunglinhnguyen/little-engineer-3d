import { describe, expect, it } from 'vitest';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../src/core/connectionGraph';
import { MODULES } from '../src/core/moduleRegistry';
import { SimulationEngine } from '../src/core/simulation';
import { buildVehicleRoute } from '../src/core/worldRoutes';
import { vehicleCanTravel } from '../src/core/vehicleRules';
import type { Connection, ModuleInstance, ModuleType } from '../src/core/types';

const part = (id: string, type: ModuleType, switchOn = true): ModuleInstance => ({
  id,
  type,
  position: [0, .65, 0],
  rotationY: 0,
  switchOn: type === 'switch' ? switchOn : undefined,
});

const port = (type: ModuleType, id: string) => MODULES[type].ports.find(p => p.id === id)!;

function connect(
  graph: ConnectionGraph,
  a: ModuleInstance,
  aPort: string,
  b: ModuleInstance,
  bPort: string,
) {
  const normalized = normalizeConnection(a, port(a.type, aPort), b, port(b.type, bPort))!;
  graph.connect({ id: a.id + '-' + b.id, ...normalized } as Connection);
}

function carGraph(switchOn = true) {
  const graph = new ConnectionGraph();
  const battery = part('battery','battery');
  const sw = part('switch','switch',switchOn);
  const motor = part('motor','motor');
  const gearbox = part('gearbox','gearbox');
  const differential = part('differential','differential');
  const car = part('car','car-base');

  [battery,sw,motor,gearbox,differential,car].forEach(x => graph.addModule(x));
  connect(graph,battery,'power-out',sw,'power-in');
  connect(graph,sw,'power-out',motor,'power-in');
  connect(graph,motor,'rotation-out',gearbox,'rotation-in');
  connect(graph,gearbox,'rotation-out',differential,'rotation-in');
  connect(graph,differential,'rotation-out',car,'rotation-in');

  return { graph, battery, sw, motor, gearbox, differential, car };
}

describe('focused car module rules', () => {
  it('keeps electrical and rotational connectors type-safe', () => {
    expect(portsCompatible(port('battery','power-out'),port('switch','power-in'))).toBe(true);
    expect(portsCompatible(port('motor','rotation-out'),port('gearbox','rotation-in'))).toBe(true);
    expect(portsCompatible(port('battery','power-out'),port('gearbox','rotation-in'))).toBe(false);
  });

  it('smart-attaches the six car modules in sequence', () => {
    const graph = new ConnectionGraph();
    const chain = [
      part('battery','battery'),
      part('switch','switch'),
      part('motor','motor'),
      part('gearbox','gearbox'),
      part('differential','differential'),
      part('car','car-base'),
    ];
    chain.forEach(x => graph.addModule(x));
    for (let i = 1; i < chain.length; i++) {
      chain[i].position = [8 + i, .65, 5];
      expect(graph.attachModuleToTarget(chain[i].id,chain[i - 1].id)).toBe(true);
    }
    expect(graph.findPathByTypes(['battery','switch','motor','gearbox','differential','car-base'])).toBe(true);
    expect(graph.connections.size).toBe(5);
  });

  it('delivers RPM through motor gearbox and differential to the car', () => {
    const { graph, motor, gearbox, differential, car } = carGraph(true);
    const state = new SimulationEngine(graph).evaluate();
    expect(state.powered.has(motor.id)).toBe(true);
    expect(state.rpm.get(motor.id)).toBe(120);
    expect(state.rpm.get(gearbox.id)).toBeCloseTo(78);
    expect(state.rpm.get(differential.id)).toBeCloseTo(70.2);
    expect(state.rpm.get(car.id)).toBeCloseTo(70.2);
  });

  it('stops the drivetrain when the switch is off', () => {
    const { graph, motor, car } = carGraph(false);
    const state = new SimulationEngine(graph).evaluate();
    expect(state.powered.has(motor.id)).toBe(false);
    expect(state.rpm.has(car.id)).toBe(false);
  });

  it('requires a nearby road before the powered car can travel', () => {
    const { graph, car } = carGraph(true);
    const state = new SimulationEngine(graph).evaluate();
    expect(vehicleCanTravel(graph,car.id,state.rpm).ready).toBe(false);

    const roadA = part('road-a','road-straight');
    const roadB = part('road-b','road-straight');
    roadA.position = [0,.65,1.4];
    roadB.position = [0,.65,4.288];
    graph.addModule(roadA);
    graph.addModule(roadB);
    graph.connect({
      id:'road-near-link',
      fromModuleId:roadA.id,
      fromPortId:'structure-front',
      toModuleId:roadB.id,
      toPortId:'structure-back',
      signal:'structural',
    });
    expect(vehicleCanTravel(graph,car.id,state.rpm).ready).toBe(true);
  });

  it('builds a continuous route from the fixed test track', () => {
    const { graph, car } = carGraph(true);
    car.position = [.8,.65,-3];

    const roads = [-2.888,0,2.888].map((z,index) => ({
      id:'road-'+index,
      type:'road-straight' as ModuleType,
      position:[.8,.65,z] as [number,number,number],
      rotationY:0,
    }));
    roads.forEach(x => graph.addModule(x));
    graph.connect({id:'road-link-1',fromModuleId:'road-0',fromPortId:'structure-front',toModuleId:'road-1',toPortId:'structure-back',signal:'structural'});
    graph.connect({id:'road-link-2',fromModuleId:'road-1',fromPortId:'structure-front',toModuleId:'road-2',toPortId:'structure-back',signal:'structural'});

    const route = buildVehicleRoute(graph,car.id);
    expect(route.length).toBeGreaterThanOrEqual(4);
    expect(route[0][2]).toBeLessThan(route[route.length - 1][2]);
  });
});
