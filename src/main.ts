import './styles/app.css';
import { ConnectionGraph, normalizeConnection } from './core/connectionGraph';
import { MODULES } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import type { ModuleInstance, ModuleType } from './core/types';
import { vehicleCanTravel } from './core/vehicleRules';
import { Workbench } from './three/workbench';

type CarStep = {
  type: ModuleType;
  short: string;
  help: string;
};

const CAR_STEPS: CarStep[] = [
  { type: 'car-base', short: 'Khung xe', help: 'Nền để lắp các bộ phận.' },
  { type: 'battery', short: 'Pin', help: 'Cấp điện 6 V.' },
  { type: 'switch', short: 'Công tắc', help: 'Bật hoặc ngắt điện.' },
  { type: 'motor', short: 'Mô tơ', help: 'Đổi điện thành quay.' },
  { type: 'gearbox', short: 'Hộp số', help: 'Giảm tốc, tăng lực.' },
  { type: 'differential', short: 'Vi sai', help: 'Đưa mô-men tới bánh.' },
];

const FUNCTION_CHAIN: ModuleType[] = [
  'battery',
  'switch',
  'motor',
  'gearbox',
  'differential',
  'car-base',
];

const FUNCTION_LINKS: Array<[ModuleType, string, ModuleType, string]> = [
  ['battery', 'power-out', 'switch', 'power-in'],
  ['switch', 'power-out', 'motor', 'power-in'],
  ['motor', 'rotation-out', 'gearbox', 'rotation-in'],
  ['gearbox', 'rotation-out', 'differential', 'rotation-in'],
  ['differential', 'rotation-out', 'car-base', 'rotation-in'],
];

const TRACK_TYPE: ModuleType = 'road-straight';
const STORAGE_KEY = 'little-engineer-car-lab-v2';
const CAR_YAW = -Math.PI / 2;

const SLOT: Record<Exclude<ModuleType, 'road-straight'>, { position: [number, number, number]; rotationY: number }> = {
  'car-base': { position: [.8, .65, -4.9], rotationY: CAR_YAW },
  battery: { position: [.34, 1.02, -4.35], rotationY: CAR_YAW },
  switch: { position: [1.23, 1.02, -4.35], rotationY: CAR_YAW },
  motor: { position: [.34, .98, -5.18], rotationY: CAR_YAW },
  gearbox: { position: [1.23, .98, -5.18], rotationY: CAR_YAW },
  differential: { position: [.8, .91, -5.95], rotationY: CAR_YAW },
};

const STAGING: Record<Exclude<ModuleType, 'road-straight' | 'car-base'>, [number, number, number]> = {
  battery: [-5.3, .65, -4.6],
  switch: [-3.8, .65, -4.6],
  motor: [-5.3, .65, -6.0],
  gearbox: [-3.8, .65, -6.0],
  differential: [-2.25, .65, -5.3],
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="world"></canvas>

  <header class="topbar">
    <div class="brand">
      <span class="brand-icon">🚗</span>
      <div>
        <b>Ô tô Kỹ sư 3D</b>
        <small>Lắp bộ phận vào đúng vị trí trên khung xe</small>
      </div>
    </div>
    <div class="mode-actions">
      <button id="buildBtn" class="primary active">🔧 Lắp</button>
      <button id="runBtn" class="run" disabled>▶ Chạy</button>
      <button id="undoBtn" class="icon" title="Hoàn tác">↶</button>
      <button id="redoBtn" class="icon" title="Làm lại">↷</button>
      <button id="resetBtn" class="icon danger-soft" title="Làm lại xe">↺</button>
    </div>
  </header>

  <aside class="build-progress panel">
    <div class="progress-head">
      <div><small>TIẾN ĐỘ LẮP XE</small><b id="progressText">0 / 6</b></div>
      <span id="readyBadge">Chưa sẵn sàng</span>
    </div>
    <div id="stepList" class="step-list"></div>
    <div id="coach" class="coach">Bước 1: đặt Khung xe lên đường thử.</div>
  </aside>

  <aside id="selectionPanel" class="selection-panel panel hidden">
    <div class="selection-title">
      <span id="selectedIcon">⚙️</span>
      <div><b id="selectedName">Mô-đun</b><small id="selectedState"></small></div>
    </div>
    <div id="moduleActions" class="module-actions"></div>
  </aside>

  <nav class="camera-bar panel">
    <button id="cameraIso" class="active">◩ Chéo</button>
    <button id="cameraTop">▦ Trên</button>
    <button id="focusAll">⌗ Toàn xe</button>
  </nav>

  <section class="palette panel">
    <div class="palette-title">
      <div><b>6 bộ phận của ô tô</b><small>Lắp từ 1 → 6; các bộ phận sẽ vào đúng vị trí trên khung</small></div>
      <div class="palette-legend"><span class="dot power"></span>Điện <span class="dot rotation"></span>Truyền động</div>
    </div>
    <div id="parts" class="parts"></div>
  </section>

  <div id="toast" class="toast hidden"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const buildBtn = document.querySelector<HTMLButtonElement>('#buildBtn')!;
const runBtn = document.querySelector<HTMLButtonElement>('#runBtn')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undoBtn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redoBtn')!;
const resetBtn = document.querySelector<HTMLButtonElement>('#resetBtn')!;
const parts = document.querySelector<HTMLDivElement>('#parts')!;
const stepList = document.querySelector<HTMLDivElement>('#stepList')!;
const progressText = document.querySelector<HTMLElement>('#progressText')!;
const readyBadge = document.querySelector<HTMLElement>('#readyBadge')!;
const coach = document.querySelector<HTMLElement>('#coach')!;
const selectionPanel = document.querySelector<HTMLElement>('#selectionPanel')!;
const selectedIcon = document.querySelector<HTMLElement>('#selectedIcon')!;
const selectedName = document.querySelector<HTMLElement>('#selectedName')!;
const selectedState = document.querySelector<HTMLElement>('#selectedState')!;
const moduleActions = document.querySelector<HTMLDivElement>('#moduleActions')!;
const toast = document.querySelector<HTMLElement>('#toast')!;

const graph = new ConnectionGraph();
const simulator = new SimulationEngine(graph);
let mode: 'build' | 'run' = 'build';
let toastTimer = 0;
let history: string[] = [];
let historyIndex = -1;
let restoring = false;

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 1800);
}

function carModule(type: ModuleType) {
  return [...graph.modules.values()].find(module => module.type === type);
}

function isTrack(id: string) {
  return graph.modules.get(id)?.type === TRACK_TYPE;
}

function isAtSlot(module: ModuleInstance | undefined) {
  if (!module || module.type === 'road-straight') return false;
  const slot = SLOT[module.type];
  return Math.hypot(
    module.position[0] - slot.position[0],
    module.position[1] - slot.position[1],
    module.position[2] - slot.position[2],
  ) < .08;
}

function freshTrack() {
  for (const module of [...graph.modules.values()]) {
    if (module.type === TRACK_TYPE) graph.removeModule(module.id);
  }

  const count = 6;
  const spacing = 2.888;
  const firstZ = -(count - 1) * spacing / 2;
  const ids: string[] = [];

  for (let index = 0; index < count; index++) {
    const id = 'track-' + index;
    ids.push(id);
    graph.addModule({
      id,
      type: TRACK_TYPE,
      position: [.8, .65, firstZ + index * spacing],
      rotationY: 0,
    });
  }

  for (let index = 1; index < ids.length; index++) {
    graph.connect({
      id: 'track-link-' + index,
      fromModuleId: ids[index - 1],
      fromPortId: 'structure-front',
      toModuleId: ids[index],
      toPortId: 'structure-back',
      signal: 'structural',
    });
  }
}

function freshTrackIfMissing() {
  const tracks = [...graph.modules.values()].filter(module => module.type === TRACK_TYPE);
  if (tracks.length !== 6) freshTrack();
}

function ensureFunctionalLinks() {
  for (const [fromType, fromPortId, toType, toPortId] of FUNCTION_LINKS) {
    const from = carModule(fromType);
    const to = carModule(toType);
    if (!from || !to || !isAtSlot(from) || !isAtSlot(to)) continue;

    const already = [...graph.connections.values()].some(connection =>
      connection.fromModuleId === from.id &&
      connection.toModuleId === to.id &&
      connection.fromPortId === fromPortId &&
      connection.toPortId === toPortId
    );
    if (already) continue;

    const fromPort = MODULES[from.type].ports.find(port => port.id === fromPortId);
    const toPort = MODULES[to.type].ports.find(port => port.id === toPortId);
    if (!fromPort || !toPort) continue;

    const normalized = normalizeConnection(from, fromPort, to, toPort);
    if (!normalized) continue;

    graph.connect({
      id: 'car-link-' + fromType + '-' + toType,
      ...normalized,
    });
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { modules?: ModuleInstance[]; connections?: any[] };
      const allowed = new Set<ModuleType>([...CAR_STEPS.map(step => step.type), TRACK_TYPE]);
      const modules = (parsed.modules ?? []).filter(module => allowed.has(module.type));
      const ids = new Set(modules.map(module => module.id));
      const connections = (parsed.connections ?? []).filter(
        connection => ids.has(connection.fromModuleId) && ids.has(connection.toModuleId),
      );
      graph.restore({ version: 1, modules, connections });
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  freshTrackIfMissing();
  ensureFunctionalLinks();
}

function saveQuietly() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graph.serialize()));
}

function recordHistory() {
  const snapshot = JSON.stringify(graph.serialize());
  if (snapshot === history[historyIndex]) return;

  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  if (history.length > 30) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoBtn.disabled = historyIndex <= 0 || mode === 'run';
  redoBtn.disabled = historyIndex >= history.length - 1 || mode === 'run';
}

function restoreHistory(index: number) {
  if (index < 0 || index >= history.length) return;

  restoring = true;
  graph.restore(JSON.parse(history[index]));
  freshTrackIfMissing();
  ensureFunctionalLinks();
  workbench.rebuildFromGraph();
  restoring = false;

  historyIndex = index;
  saveQuietly();
  updateHistoryButtons();
  refresh();
  workbench.focusAll();
}

function commitGraphChange(selectId: string | null = null) {
  ensureFunctionalLinks();
  workbench.rebuildFromGraph();
  if (selectId) workbench.selectById(selectId);
  if (!restoring) recordHistory();
  saveQuietly();
  refresh();
}

const workbench = new Workbench(canvas, graph, {
  canEdit: () => mode === 'build',
  canMove: () => false,
  onSelect: renderSelection,
  onGraphChanged: () => {
    if (!restoring) recordHistory();
    saveQuietly();
    refresh();
    if (mode === 'run') applySimulation();
  },
});

function stepDone(index: number) {
  const module = carModule(CAR_STEPS[index].type);
  return Boolean(module && isAtSlot(module));
}

function nextRequiredIndex() {
  for (let index = 0; index < CAR_STEPS.length; index++) {
    if (!stepDone(index)) return index;
  }
  return -1;
}

function status() {
  const state = simulator.evaluate();
  const car = carModule('car-base');
  const switchModule = carModule('switch');
  const allInstalled = CAR_STEPS.every((_, index) => stepDone(index));
  const connected = Boolean(graph.findPathByTypes(FUNCTION_CHAIN));
  const poweredCar = Boolean(car && state.rpm.has(car.id));
  const roadReady = Boolean(car && vehicleCanTravel(graph, car.id, state.rpm).ready);
  const switchOn = switchModule?.switchOn !== false;

  return {
    state,
    car,
    allInstalled,
    connected,
    poweredCar,
    roadReady,
    switchOn,
    ready: allInstalled && connected && poweredCar && roadReady && switchOn,
  };
}

function addCarPart(type: ModuleType) {
  if (mode === 'run') {
    showToast('⏹ Dừng xe trước khi sửa.');
    return;
  }

  const existing = carModule(type);
  if (existing) {
    workbench.selectById(existing.id);
    return;
  }

  const index = CAR_STEPS.findIndex(step => step.type === type);
  if (index < 0) return;

  if (index > 0 && !stepDone(index - 1)) {
    showToast('Lắp ' + CAR_STEPS[index - 1].short + ' trước.');
    return;
  }

  const slot = SLOT[type as Exclude<ModuleType, 'road-straight'>];
  const instance: ModuleInstance = {
    id: type + '-' + crypto.randomUUID().slice(0, 8),
    type,
    position: [...slot.position],
    rotationY: slot.rotationY,
    switchOn: type === 'switch' ? true : undefined,
  };

  graph.addModule(instance);
  commitGraphChange(instance.id);
  showToast('✓ ' + CAR_STEPS[index].short + ' đã vào đúng vị trí.');

  if (type === 'car-base' || type === 'differential') {
    workbench.focusAll();
  }
}

function detachModule(id: string) {
  const module = graph.modules.get(id);
  if (!module || module.type === 'road-straight' || module.type === 'car-base') return;

  graph.disconnectModule(id);
  const stage = STAGING[module.type as keyof typeof STAGING];
  module.position = [...stage];
  module.rotationY = 0;
  commitGraphChange(id);
  showToast('Đã tháo ' + MODULES[module.type].name + ' ra khỏi xe.');
}

function installModule(id: string) {
  const module = graph.modules.get(id);
  if (!module || module.type === 'road-straight') return;

  const slot = SLOT[module.type as Exclude<ModuleType, 'road-straight'>];
  module.position = [...slot.position];
  module.rotationY = slot.rotationY;
  ensureFunctionalLinks();
  commitGraphChange(id);
  showToast('🧲 Đã gắn đúng vị trí trên khung xe.');
}

function deleteModule(id: string) {
  const module = graph.modules.get(id);
  if (!module || module.type === 'road-straight' || module.type === 'car-base') return;

  graph.removeModule(id);
  commitGraphChange();
  showToast('Đã xóa ' + MODULES[module.type].name + '.');
}

function renderPalette() {
  parts.innerHTML = '';
  const next = nextRequiredIndex();

  CAR_STEPS.forEach((step, index) => {
    const module = carModule(step.type);
    const installed = Boolean(module && isAtSlot(module));
    const button = document.createElement('button');
    button.className =
      'part' +
      (installed ? ' done' : module ? ' present' : '') +
      (index === next ? ' next' : '');

    button.disabled =
      mode === 'run' ||
      (!module && index > 0 && !stepDone(index - 1));

    button.innerHTML = `
      <span class="step-no">${installed ? '✓' : index + 1}</span>
      <span class="part-icon">${MODULES[step.type].icon}</span>
      <b>${step.short}</b>
      <small>${step.help}</small>
    `;

    button.onclick = () => addCarPart(step.type);
    parts.appendChild(button);
  });
}

function renderSteps() {
  stepList.innerHTML = CAR_STEPS.map((step, index) => {
    const module = carModule(step.type);
    const installed = Boolean(module && isAtSlot(module));
    const cls = installed ? 'done' : module ? 'present' : '';

    return `
      <div class="progress-step ${cls}">
        <span>${installed ? '✓' : index + 1}</span>
        <b>${step.short}</b>
      </div>
    `;
  }).join('');
}

function renderCoach() {
  const current = status();
  const next = nextRequiredIndex();
  const doneCount = CAR_STEPS.filter((_, index) => stepDone(index)).length;
  progressText.textContent = doneCount + ' / ' + CAR_STEPS.length;

  if (current.ready) {
    readyBadge.textContent = mode === 'run' ? 'Đang chạy' : 'Sẵn sàng';
    readyBadge.className = 'ready';
    coach.textContent = mode === 'run'
      ? '🚗 Cả cụm xe đang chạy cùng nhau: Pin → Công tắc → Mô tơ → Hộp số → Vi sai → bánh xe.'
      : '✅ Các bộ phận đã nằm đúng trên khung. Bấm “Chạy”.';
    return;
  }

  readyBadge.textContent = 'Chưa sẵn sàng';
  readyBadge.className = '';

  if (next >= 0) {
    const step = CAR_STEPS[next];
    const existing = carModule(step.type);
    coach.textContent = existing
      ? '🧲 ' + step.short + ' đang ở ngoài xe. Chọn nó rồi bấm “Gắn vào xe”.'
      : 'Bước ' + (next + 1) + ': lắp “' + step.short + '”.';
    return;
  }

  if (!current.switchOn) {
    coach.textContent = '⏻ Công tắc đang tắt. Chọn Công tắc rồi bấm “Bật”.';
  } else if (!current.connected) {
    coach.textContent = 'Kiểm tra một bộ phận vừa bị tháo khỏi chuỗi truyền động.';
  } else {
    coach.textContent = 'Kiểm tra lại vị trí xe trên đường thử.';
  }
}

function refresh() {
  renderPalette();
  renderSteps();
  renderCoach();
  renderSelection(workbench.selectedId);

  const current = status();
  runBtn.disabled = mode === 'build' && !current.ready;
  runBtn.textContent = mode === 'run' ? '■ Dừng' : '▶ Chạy';
  buildBtn.classList.toggle('active', mode === 'build');
  runBtn.classList.toggle('active', mode === 'run');
  updateHistoryButtons();
}

function renderSelection(id: string | null) {
  if (!id) {
    selectionPanel.classList.add('hidden');
    return;
  }

  const module = graph.modules.get(id);
  if (!module) {
    selectionPanel.classList.add('hidden');
    return;
  }

  selectionPanel.classList.remove('hidden');
  const definition = MODULES[module.type];
  selectedIcon.textContent = definition.icon;
  selectedName.textContent = definition.name;

  if (module.type === TRACK_TYPE) {
    selectedState.textContent = 'Đường thử cố định';
    moduleActions.innerHTML = '<button id="focusTrack">◎ Nhìn toàn xe</button>';
    document.querySelector<HTMLButtonElement>('#focusTrack')!.onclick = () => workbench.focusAll();
    return;
  }

  const installed = isAtSlot(module);
  const state = simulator.evaluate();
  const details: string[] = [installed ? 'Đã lắp trên xe' : 'Đang tháo rời'];
  if (state.voltage.has(id)) details.push(state.voltage.get(id)!.toFixed(1) + ' V');
  if (state.rpm.has(id)) details.push(Math.round(Math.abs(state.rpm.get(id)!)) + ' rpm');
  selectedState.textContent = details.join(' · ');

  if (module.type === 'car-base') {
    moduleActions.innerHTML = '<button id="focusCar" class="primary">◎ Nhìn toàn xe</button>';
    document.querySelector<HTMLButtonElement>('#focusCar')!.onclick = () => workbench.focusAll();
    return;
  }

  const toggleAction = module.type === 'switch'
    ? `<button id="togglePart" class="primary">${module.switchOn === false ? '⏻ Bật' : '⏻ Tắt'}</button>`
    : '';

  moduleActions.innerHTML = installed
    ? `${toggleAction}<button id="detachPart">⤴ Tháo</button><button id="deletePart" class="danger">🗑 Xóa</button>`
    : `${toggleAction}<button id="installPart" class="primary">🧲 Gắn vào xe</button><button id="deletePart" class="danger">🗑 Xóa</button>`;

  const toggle = document.querySelector<HTMLButtonElement>('#togglePart');
  if (toggle) {
    toggle.onclick = () => {
      workbench.toggleSwitch();
      refresh();
    };
  }

  const detach = document.querySelector<HTMLButtonElement>('#detachPart');
  if (detach) detach.onclick = () => detachModule(id);

  const install = document.querySelector<HTMLButtonElement>('#installPart');
  if (install) install.onclick = () => installModule(id);

  const remove = document.querySelector<HTMLButtonElement>('#deletePart');
  if (remove) remove.onclick = () => deleteModule(id);
}

function applySimulation() {
  const state = simulator.evaluate();
  workbench.setSimulation(true, state.rpm, state.active);
  renderCoach();
  renderSelection(workbench.selectedId);
}

function setMode(next: 'build' | 'run') {
  if (next === 'run') {
    const current = status();
    if (!current.ready) {
      showToast('Lắp đủ 6 bộ phận đúng vị trí trước.');
      return;
    }

    mode = 'run';
    applySimulation();
    workbench.focusAll();
  } else {
    mode = 'build';
    workbench.setSimulation(false, new Map(), new Set());
  }

  refresh();
}

buildBtn.onclick = () => setMode('build');
runBtn.onclick = () => setMode(mode === 'run' ? 'build' : 'run');
undoBtn.onclick = () => restoreHistory(historyIndex - 1);
redoBtn.onclick = () => restoreHistory(historyIndex + 1);

resetBtn.onclick = () => {
  setMode('build');
  graph.restore({ version: 1, modules: [], connections: [] });
  freshTrack();
  workbench.rebuildFromGraph();
  history = [];
  historyIndex = -1;
  recordHistory();
  saveQuietly();
  refresh();
  workbench.focusAll();
  showToast('Đã làm sạch bàn lắp xe.');
};

document.querySelector<HTMLButtonElement>('#cameraIso')!.onclick = () => workbench.setCamera('iso');
document.querySelector<HTMLButtonElement>('#cameraTop')!.onclick = () => workbench.setCamera('top');
document.querySelector<HTMLButtonElement>('#focusAll')!.onclick = () => workbench.focusAll();

load();
workbench.rebuildFromGraph();
recordHistory();
refresh();
workbench.focusAll();

if (new URLSearchParams(location.search).has('qa')) {
  (window as any).__CAR_LAB__ = {
    snapshot() {
      const current = status();
      return {
        modules: [...graph.modules.values()],
        connections: [...graph.connections.values()],
        ready: current.ready,
        rpm: Object.fromEntries(current.state.rpm),
        carId: current.car?.id ?? null,
      };
    },
    rendered(id: string) {
      return workbench.renderedTransform(id);
    },
  };
}

if (
  'serviceWorker' in navigator &&
  !new URLSearchParams(location.search).has('qa') &&
  (location.protocol === 'https:' || location.hostname === 'localhost')
) {
  addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js?v=20260930-car2', {
        scope: './',
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {
      // The car lab still works online if service worker registration is unavailable.
    }
  });
}
