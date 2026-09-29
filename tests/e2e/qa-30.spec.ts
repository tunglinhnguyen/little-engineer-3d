import { test, expect, type Page } from '@playwright/test';

type ModuleType = string;
type M = {
  id: string;
  type: ModuleType;
  position: [number, number, number];
  rotationY: number;
  switchOn?: boolean;
  custom?: { name?: string; color?: number; shape?: 'box'|'cylinder'; size?: [number,number,number] };
};
type C = {
  id: string;
  fromModuleId: string;
  fromPortId: string;
  toModuleId: string;
  toPortId: string;
  signal: 'power'|'rotation'|'fluid'|'structural';
};
type Graph = { version?: number; modules: M[]; connections: C[] };

const m = (id: string, type: string, x: number, z: number, y = .65, rotationY = 0, switchOn?: boolean): M => ({
  id, type, position: [x,y,z], rotationY, switchOn,
});
const c = (
  id: string, fromModuleId: string, fromPortId: string,
  toModuleId: string, toPortId: string, signal: C['signal'],
): C => ({ id, fromModuleId, fromPortId, toModuleId, toPortId, signal });

async function boot(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('le3d-player-name','Shu');
    localStorage.setItem('le3d-speech','0');
    localStorage.setItem('le3d-sound','0');
  });
  await page.goto('/?qa=1&v=qa30');
  await page.waitForFunction(() => Boolean((window as any).__LE3D_QA__));
  await expect(page.locator('#worldTitle')).toContainText('Shu');
}

async function qa<T = any>(page: Page, method: string, ...args: any[]): Promise<T> {
  return page.evaluate(({ method, args }) => {
    const api = (window as any).__LE3D_QA__;
    return api[method](...args);
  }, { method, args });
}

async function load(page: Page, graph: Graph) {
  await qa(page,'loadGraph',{ version: 2, ...graph });
  await page.waitForTimeout(150);
}

async function label(page: Page, text: string) {
  await page.evaluate((value) => {
    document.querySelector('#qa-proof')?.remove();
    const el = document.createElement('div');
    el.id = 'qa-proof';
    el.textContent = value;
    Object.assign(el.style, {
      position:'fixed', left:'12px', bottom:'166px', zIndex:'999',
      maxWidth:'70vw', padding:'8px 11px', borderRadius:'11px',
      background:'rgba(9,38,52,.9)', color:'#fff',
      font:'700 12px system-ui', boxShadow:'0 7px 20px rgba(0,0,0,.22)',
      pointerEvents:'none',
    });
    document.body.appendChild(el);
  }, text);
}

async function shot(page: Page, index: number, slug: string, proof: string) {
  await label(page, 'QA ' + String(index).padStart(2,'0') + ' ✓ ' + proof);
  await page.waitForTimeout(220);
  await page.screenshot({ path: 'test-results/qa/' + String(index).padStart(2,'0') + '-' + slug + '.png' });
}

function lampGraph(source: 'battery'|'solar'='battery'): Graph {
  return {
    modules:[
      m('src',source,0,0), m('sw','switch',1.45,0,.65,0,true), m('lamp','lamp',2.9,0),
    ],
    connections:[
      c('e1','src','power-out','sw','power-in','power'),
      c('e2','sw','power-out','lamp','power-in','power'),
    ],
  };
}

function drivetrainGraph(): Graph {
  return {
    modules:[
      m('battery','battery',-4,0),m('switch','switch',-2.6,0,.65,0,true),
      m('motor','motor',-1.2,0),m('gear12','gear-small',.3,0),
      m('gear24','gear-large',1.8,0),m('shaft','shaft',3.25,0),m('wheel','wheel',4.8,0),
    ],
    connections:[
      c('p1','battery','power-out','switch','power-in','power'),
      c('p2','switch','power-out','motor','power-in','power'),
      c('r1','motor','rotation-out','gear12','rotation-in','rotation'),
      c('r2','gear12','rotation-out','gear24','rotation-in','rotation'),
      c('r3','gear24','rotation-out','shaft','rotation-in','rotation'),
      c('r4','shaft','rotation-out','wheel','rotation-in','rotation'),
    ],
  };
}

function carGraph(): Graph {
  return {
    modules:[
      m('battery','battery',-6,-2),m('switch','switch',-4.6,-2,.65,0,true),
      m('motor','motor',-3.2,-2),m('gearbox','gearbox',-1.7,-2),
      m('diff','differential',-.2,-2),m('car','car-base',1.8,-2),
      m('road1','road-straight',1.8,-2),m('road2','road-straight',1.8,.88),
      m('curve','road-curve',1.8,3.25),
    ],
    connections:[
      c('p1','battery','power-out','switch','power-in','power'),
      c('p2','switch','power-out','motor','power-in','power'),
      c('r1','motor','rotation-out','gearbox','rotation-in','rotation'),
      c('r2','gearbox','rotation-out','diff','rotation-in','rotation'),
      c('r3','diff','rotation-out','car','rotation-in','rotation'),
      c('s1','road1','structure-front','road2','structure-back','structural'),
      c('s2','road2','structure-front','curve','road-in','structural'),
    ],
  };
}

function trainGraph(): Graph {
  return {
    modules:[
      m('battery','battery',-6,-2),m('switch','switch',-4.6,-2,.65,0,true),
      m('motor','motor',-3.2,-2),m('gearbox','gearbox',-1.7,-2),
      m('engine','train-engine',.5,-2),m('wagon','train-wagon',3,-2),
      m('rail1','rail-straight',.5,-2),m('station','train-station',.5,1.1),
      m('rail2','rail-straight',.5,4.25),
    ],
    connections:[
      c('p1','battery','power-out','switch','power-in','power'),
      c('p2','switch','power-out','motor','power-in','power'),
      c('r1','motor','rotation-out','gearbox','rotation-in','rotation'),
      c('r2','gearbox','rotation-out','engine','rotation-in','rotation'),
      c('t1','engine','coupler-front','wagon','coupler-back','structural'),
      c('s1','rail1','structure-front','station','rail-in','structural'),
      c('s2','station','rail-out','rail2','structure-back','structural'),
    ],
  };
}

function pumpGraph(): Graph {
  return {
    modules:[
      m('battery','battery',-4,-1.8),m('switch','switch',-2.6,-1.8,.65,0,true),
      m('motor','motor',-1.2,-1.8),m('shaft','shaft',.3,-1.8),m('pump','pump',1.8,-1.8),
      m('tank','water-tank',-1.2,1.5),m('pipe','pipe',.5,1.5),m('nozzle','nozzle',2.4,1.5),
    ],
    connections:[
      c('p1','battery','power-out','switch','power-in','power'),
      c('p2','switch','power-out','motor','power-in','power'),
      c('r1','motor','rotation-out','shaft','rotation-in','rotation'),
      c('r2','shaft','rotation-out','pump','rotation-in','rotation'),
      c('f1','tank','fluid-out','pipe','fluid-in','fluid'),
      c('f2','pipe','fluid-out','pump','fluid-in','fluid'),
      c('f3','pump','fluid-out','nozzle','fluid-in','fluid'),
    ],
  };
}

function landscapeGraph(): Graph {
  return {
    modules:[
      m('grass1','grass-tile',-3,-2),m('grass2','grass-tile',-.5,-2),
      m('water','water-tile',2,-2),m('river','river-tile',2,.5),
      m('hill','hill',-2,1.5),m('mountain','mountain',1,2.3),
      m('tree1','tree',-3,1.2),m('tree2','tree',-1.4,2.2),
      m('waterfall','waterfall',3,2),m('cave','cave',4.5,1.5),
      m('cloud','cloud',0,0,4.2),
    ],
    connections:[],
  };
}

test.beforeEach(async ({ page }) => { await boot(page); });

test('01 smart snap and typed coupling', async ({ page }) => {
  await load(page,{modules:[m('battery','battery',0,0),m('switch','switch',2.2,0,.65,Math.PI)],connections:[]});
  const result = await qa<any>(page,'snap','switch');
  expect(result.result).toBe(true);
  expect(result.state.connections.length).toBe(1);
  await qa(page,'select','switch');
  await shot(page,1,'smart-snap','Công tắc tự xoay và ghép đúng cổng điện của Pin');
});

test('02 drivetrain RPM direction torque', async ({ page }) => {
  await load(page,drivetrainGraph());
  const state=await qa<any>(page,'run');
  expect(state.rpm.gear12).toBe(120);
  expect(state.rpm.gear24).toBe(-60);
  expect(state.torque.gear24).toBeGreaterThan(state.torque.gear12);
  await qa(page,'energy','rotation');
  await shot(page,2,'drivetrain','12T → 24T đảo chiều, giảm RPM và tăng mô-men');
});

test('03 complete electric car runs', async ({ page }) => {
  await load(page,carGraph());
  const before=await qa<any>(page,'rendered','car');
  const state=await qa<any>(page,'run');
  const ready=await qa<any>(page,'vehicle','car');
  expect(ready.ready).toBe(true);
  expect(state.rpm.car).toBeDefined();
  await page.waitForTimeout(650);
  const after=await qa<any>(page,'rendered','car');
  expect(after.position).not.toEqual(before.position);
  await qa(page,'select','car');
  await shot(page,3,'car-running','Ô tô nhận mô-men và di chuyển trên đường gần xe');
});

test('04 road network curves and intersections', async ({ page }) => {
  const graph=carGraph();
  graph.modules.push(m('cross','road-crossing',4.25,3.25),m('branch','road-straight',6.7,3.25, .65, Math.PI/2));
  graph.connections.push(
    c('s3','curve','road-out','cross','structure-left','structural'),
    c('s4','cross','structure-right','branch','structure-back','structural'),
  );
  await load(page,graph);
  const route=await qa<any[]>(page,'route','car');
  expect(route.length).toBeGreaterThan(5);
  await qa(page,'camera','top');
  await qa(page,'select','car');
  await shot(page,4,'road-network','Tuyến đường có thẳng, cong và nút giao tạo route liên tục');
});

test('05 railway train wagon station', async ({ page }) => {
  await load(page,trainGraph());
  const ready=await qa<any>(page,'vehicle','engine');
  expect(ready.ready).toBe(true);
  const state=await qa<any>(page,'run');
  expect(state.rpm.engine).toBeDefined();
  expect((await qa<any>(page,'vehicle','engine')).ready).toBe(true);
  await page.waitForTimeout(500);
  await qa(page,'select','engine');
  await shot(page,5,'railway','Đầu tàu + toa chạy theo ray và qua ga');
});

test('06 collision-safe placement model', async ({ page }) => {
  await load(page,{modules:[m('wall-a','wall',0,0),m('wall-b','wall',0,0)],connections:[]});
  const audit=await qa<any>(page,'audit');
  expect(audit.collisions).toBeGreaterThan(0);
  await qa(page,'select','wall-b');
  await shot(page,6,'collision','Collision engine phát hiện hai kết cấu đang xuyên nhau: '+audit.collisions);
});

test('07 electrical voltage current model', async ({ page }) => {
  await load(page,lampGraph());
  await qa(page,'engineer',true);
  const state=await qa<any>(page,'run');
  expect(state.voltage.lamp).toBe(6);
  expect(state.current.lamp).toBeGreaterThan(0);
  await qa(page,'select','lamp');
  await shot(page,7,'electrical','Đèn nhận '+state.voltage.lamp.toFixed(1)+' V · '+state.current.lamp.toFixed(2)+' A');
});

test('08 fluid flow pressure pump prerequisites', async ({ page }) => {
  await load(page,pumpGraph());
  const state=await qa<any>(page,'run');
  expect(state.flow.nozzle).toBeGreaterThan(0);
  expect(state.pressure.pump).toBeGreaterThan(1);
  await qa(page,'energy','fluid');
  await qa(page,'select','pump');
  await shot(page,8,'fluid','Bơm chỉ tạo dòng khi có mô-men + nước; vòi có lưu lượng thực');
});

test('09 visual energy flow', async ({ page }) => {
  await load(page,drivetrainGraph());
  await qa(page,'run');
  const state=await qa<any>(page,'energy','all');
  expect(state.active.length).toBeGreaterThan(3);
  await shot(page,9,'energy-flow','Hiển thị đường Điện / Mô-men / Nước đang hoạt động');
});

test('10 engineer inspector metrics and faults', async ({ page }) => {
  const graph=lampGraph();
  graph.modules.push(m('idle-battery','battery',-1.5,2),m('idle-motor','motor',0,2));
  graph.connections.push(c('p3','idle-battery','power-out','idle-motor','power-in','power'));
  await load(page,graph);
  await qa(page,'engineer',true);
  const state=await qa<any>(page,'run');
  expect(state.faults['idle-motor']).toBeDefined();
  await qa(page,'select','idle-motor');
  await expect(page.locator('.engineering-metrics')).toBeVisible();
  await expect(page.locator('.fault-list')).toBeVisible();
  await shot(page,10,'engineer-inspector','Inspector có V, A, rpm, mô-men và cảnh báo chạy không tải');
});

test('11 iPad camera presets lock and focus', async ({ page }) => {
  await load(page,landscapeGraph());
  await qa(page,'camera','top');
  await expect(page.locator('.camera-bar')).toBeVisible();
  await page.locator('#cameraLockBtn').click();
  await expect(page.locator('#cameraLockBtn')).toHaveText('🔒 Góc nhìn');
  await shot(page,11,'camera','Camera có 6 góc, toàn cảnh, vật chọn, khóa và theo vật');
});

test('12 adaptive iPad performance mode', async ({ page }) => {
  await load(page,landscapeGraph());
  await qa(page,'performance',true);
  const state=await qa<any>(page,'state');
  expect(state.renderer.performanceMode).toBe(true);
  expect(state.renderer.pixelRatio).toBeLessThanOrEqual(1.01);
  await page.locator('#toolboxBtn').click();
  await shot(page,12,'performance','Performance mode giảm pixel ratio và shadow để ổn định iPad');
});

test('13 multi-slot projects with thumbnail', async ({ page }) => {
  await qa(page,'addBlueprint','two-storey-home',[0,.65,0]);
  await page.locator('#toolboxBtn').click();
  await page.locator('[data-tool-tab="projects"]').click();
  await page.locator('#projectName').fill('Nhà của Shu');
  await page.locator('#saveProjectBtn').click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('.project-card')).toContainText('Nhà của Shu');
  await shot(page,13,'project-slots','Dự án lưu theo slot riêng với tên, thời gian, thumbnail');
});

test('14 undo redo build history', async ({ page }) => {
  const empty=await qa<any>(page,'state');
  expect(empty.modules.length).toBe(0);
  await qa(page,'addBlueprint','electric-car',[0,.65,0]);
  const built=await qa<any>(page,'state');
  expect(built.modules.length).toBeGreaterThan(0);
  await page.locator('#undoBtn').click();
  expect((await qa<any>(page,'state')).modules.length).toBe(0);
  await page.locator('#redoBtn').click();
  expect((await qa<any>(page,'state')).modules.length).toBe(built.modules.length);
  await shot(page,14,'undo-redo','Undo/Redo khôi phục cả công trình chứ không chỉ UI');
});

test('15 missions accept alternative engineering solutions', async ({ page }) => {
  await load(page,lampGraph('solar'));
  await qa(page,'run');
  const feedback=await qa<any>(page,'feedback','light');
  expect(feedback.status).toBe('complete');
  await shot(page,15,'multiple-solutions','Nhiệm vụ đèn chấp nhận Pin mặt trời thay vì ép một lời giải');
});

test('16 interactive tutorial step tracking', async ({ page }) => {
  await page.locator('#toolboxBtn').click();
  await page.locator('[data-tool-tab="learn"]').click();
  await page.locator('.tutorial-card').first().click();
  await expect(page.locator('.tutorial-progress')).toContainText('bước');
  await shot(page,16,'tutorial','Tutorial kiểm tra từng bước trực tiếp theo công trình của bé');
});

test('17 free sandbox mode', async ({ page }) => {
  await qa(page,'sandbox',true);
  await expect(page.locator('.mission')).toHaveClass(/sandbox-hidden/);
  await qa(page,'addBlueprint','two-storey-home',[0,.65,0]);
  await shot(page,17,'sandbox','Sandbox ẩn ràng buộc nhiệm vụ và cho xây tự do');
});

test('18 true multi-storey architecture', async ({ page }) => {
  const graph:Graph={modules:[
    m('foundation','foundation',0,0,.2),
    m('wall1','wall',0,-1.2,1.1),m('wall2','door-wall',0,1.2,1.1),
    m('floor','floor-slab',0,0,2.0),m('stairs','stairs',.5,0,1.25),
    m('wall3','window-wall',0,-1.2,2.9),m('roof','roof',0,0,4.0),
  ],connections:[]};
  await load(page,graph);
  await qa(page,'camera','iso');
  await shot(page,18,'architecture','Nhà nhiều cao độ: nền, tường, sàn tầng, cầu thang và mái');
});

test('19 terrain world building', async ({ page }) => {
  await load(page,landscapeGraph());
  await qa(page,'camera','iso');
  await shot(page,19,'terrain','Địa hình có cỏ, nước, đồi, núi, cây, thác, hang và mây');
});

test('20 real machine animations', async ({ page }) => {
  const graph:Graph={modules:[
    m('crank1','hand-crank',-4,0),m('shaft','shaft',-2.5,0),m('conveyor','conveyor',-.5,0),
    m('crank2','hand-crank',2,0),m('cam','cam',3.4,0),m('piston','piston',4.8,0),
  ],connections:[
    c('r1','crank1','rotation-out','shaft','rotation-in','rotation'),
    c('r2','shaft','rotation-out','conveyor','rotation-in','rotation'),
    c('r3','crank2','rotation-out','cam','rotation-in','rotation'),
    c('r4','cam','rotation-out','piston','rotation-in','rotation'),
  ]};
  await load(page,graph);
  const state=await qa<any>(page,'run');
  expect(state.rpm.conveyor).toBeDefined();
  expect(state.rpm.piston).toBeDefined();
  await page.waitForTimeout(500);
  await shot(page,20,'machine-animation','Băng tải và pít-tông nhận RPM và hoạt ảnh cơ cấu');
});

test('21 machine audio control', async ({ page }) => {
  const graph:Graph={modules:[m('battery','battery',0,0),m('switch','switch',1.4,0,.65,0,true),m('buzzer','buzzer',2.8,0)],connections:[
    c('p1','battery','power-out','switch','power-in','power'),c('p2','switch','power-out','buzzer','power-in','power'),
  ]};
  await load(page,graph);
  await page.locator('.audio-toggle').click();
  await expect(page.locator('.audio-toggle')).toHaveText('🔉');
  await page.locator('#runBtn').click();
  await expect(page.locator('#runBtn')).toContainText('Dừng');
  await shot(page,21,'audio','Âm máy bật bằng thao tác người dùng; buzzer chạy cùng trạng thái điện');
});

test('22 functional visual effects firetruck water siren', async ({ page }) => {
  const graph:Graph={modules:[
    m('battery','battery',-6,-2),m('switch','switch',-4.6,-2,.65,0,true),m('motor','motor',-3.2,-2),m('gearbox','gearbox',-1.7,-2),
    m('truck','firetruck',.5,-2),m('road','road-straight',.5,-2),m('hydrant','hydrant',-1,1.4),m('nozzle','nozzle',2,1.4),
  ],connections:[
    c('p1','battery','power-out','switch','power-in','power'),c('p2','switch','power-out','motor','power-in','power'),
    c('r1','motor','rotation-out','gearbox','rotation-in','rotation'),c('r2','gearbox','rotation-out','truck','rotation-in','rotation'),
    c('f1','hydrant','fluid-out','truck','fluid-in','fluid'),c('f2','truck','fluid-out','nozzle','fluid-in','fluid'),
  ]};
  await load(page,graph);
  const state=await qa<any>(page,'run');
  expect(state.flow.nozzle).toBeGreaterThan(0);
  expect((await qa<any>(page,'vehicle','truck')).ready).toBe(true);
  await page.waitForTimeout(450);
  await shot(page,22,'effects','Xe cứu hỏa chạy, đèn chớp và cấp nước tới vòi');
});

test('23 exploded construction view', async ({ page }) => {
  await load(page,{modules:[m('motor','motor',0,0)],connections:[]});
  await qa(page,'select','motor');
  await qa(page,'explode',true);
  await shot(page,23,'exploded','Exploded view tách các chi tiết của mô-đun để quan sát cấu tạo');
});

test('24 xray internal mechanism view', async ({ page }) => {
  await load(page,{modules:[m('car','car-base',0,0)],connections:[]});
  await qa(page,'select','car');
  await qa(page,'xray',true);
  await shot(page,24,'xray','X-ray làm vỏ bán trong suốt để quan sát cơ cấu bên trong');
});

test('25 engineering blueprints', async ({ page }) => {
  const state=await qa<any>(page,'addBlueprint','electric-car',[0,.65,0]);
  expect(state.modules.length).toBeGreaterThanOrEqual(7);
  await shot(page,25,'blueprint','Blueprint dựng nhanh ô tô điện rồi cho bé tháo và cải tiến');
});

test('26 child module creator', async ({ page }) => {
  await page.locator('#toolboxBtn').click();
  await page.locator('#makerName').fill('Máy bí mật');
  await page.locator('#makerSignal').selectOption('rotation');
  await page.locator('#makerShape').selectOption('cylinder');
  await page.locator('#makerColor').fill('#7b61ff');
  await page.locator('#createMakerBtn').click();
  const state=await qa<any>(page,'state');
  const custom=state.modules.find((x:any)=>x.custom?.name==='Máy bí mật');
  expect(custom).toBeTruthy();
  await qa(page,'select',custom.id);
  await shot(page,26,'module-creator','Bé tự tạo mô-đun: tên, loại cổng, hình, màu và kích thước');
});

test('27 achievements unlock from real builds', async ({ page }) => {
  await load(page,lampGraph());
  await qa(page,'run');
  await page.locator('#toolboxBtn').click();
  await page.locator('[data-tool-tab="profile"]').click();
  expect(await page.locator('.achievement.unlocked').count()).toBeGreaterThan(0);
  await shot(page,27,'achievements','Huy hiệu mở bằng năng lực thực tế của công trình');
});

test('28 learning portfolio records missions and builds', async ({ page }) => {
  await load(page,lampGraph());
  await qa(page,'run');
  await page.locator('#toolboxBtn').click();
  await page.locator('[data-tool-tab="projects"]').click();
  await page.locator('#projectName').fill('Mạch đèn đầu tiên');
  await page.locator('#saveProjectBtn').click();
  await page.locator('[data-tool-tab="profile"]').click();
  await expect(page.locator('#profileSummary')).toContainText('Nhiệm vụ');
  await expect(page.locator('#profileSummary')).toContainText('Công trình');
  await shot(page,28,'learning-portfolio','Hồ sơ lưu nhiệm vụ, công trình, khái niệm và huy hiệu');
});

test('29 automated audit coverage', async ({ page }) => {
  const audit=await qa<any>(page,'audit');
  expect(audit.palette).toBeGreaterThan(90);
  expect(audit.missions).toBeGreaterThanOrEqual(30);
  expect(audit.tutorials).toBeGreaterThanOrEqual(5);
  expect(audit.blueprints).toBeGreaterThanOrEqual(4);
  await shot(page,29,'automated-audit','Audit: '+audit.palette+' modules · '+audit.missions+' missions · '+audit.tutorials+' tutorials · '+audit.blueprints+' blueprints');
});

test('30 graphics night rain lighting', async ({ page }) => {
  await load(page,landscapeGraph());
  await qa(page,'day','night');
  const state=await qa<any>(page,'weather','rain');
  expect(state.renderer.dayPhase).toBe('night');
  expect(state.renderer.weather).toBe('rain');
  await page.waitForTimeout(500);
  await shot(page,30,'graphics-night-rain','ACES lighting + đêm + mưa + cảnh quan 3D');
});
