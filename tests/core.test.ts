import { describe, expect, it } from 'vitest';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../src/core/connectionGraph';
import { MODULES } from '../src/core/moduleRegistry';
import { SimulationEngine } from '../src/core/simulation';
import type { Connection, ModuleInstance, ModuleType } from '../src/core/types';

const module = (id: string, type: ModuleType, switchOn = true): ModuleInstance => ({ id, type, position: [0, 0, 0], rotationY: 0, switchOn });
const port = (type: ModuleType, id: string) => MODULES[type].ports.find(p => p.id === id)!;

describe('connector compatibility', () => {
  it('allows output to input of the same signal', () => expect(portsCompatible(port('battery','power-out'), port('switch','power-in'))).toBe(true));
  it('rejects power to rotation', () => expect(portsCompatible(port('battery','power-out'), port('shaft','rotation-in'))).toBe(false));
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
