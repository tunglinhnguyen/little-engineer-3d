import './styles/app.css';
import { ConnectionGraph } from './core/connectionGraph';
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
  { type: 'battery', short: 'Pin', help: 'Cấp điện cho xe.' },
  { type: 'switch', short: 'Công tắc', help: 'Bật hoặc ngắt điện.' },
  { type: 'motor', short: 'Mô tơ', help: 'Đổi điện thành chuyển động quay.' },
  { type: 'gearbox', short: 'Hộp số', help: 'Giảm tốc, tăng lực kéo.' },
  { type: 'differential', short: 'Vi sai', help: 'Truyền mô-men tới bánh xe.' },
  { type: 'car-base', short: 'Khung xe + bánh', help: 'Nhận truyền động và chạy trên đường.' },
];

const CAR_CHAIN = CAR_STEPS.map(step => step.type);
const CAR_TYPES = new Set<ModuleType>(CAR_CHAIN);
const TRACK_TYPE: ModuleType = 'road-straight';
const STORAGE_KEY = 'little-engineer-car-lab-v1';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="world"></canvas>

  <header class="topbar">
    <div class="brand">
      <span class="brand-icon">🚗</span>
      <div>
        <b>Ô tô Kỹ sư 3D</b>
        <small>Ráp đúng 6 mô-đun để xe chạy</small>
      </div>
    </div>
    <div class="mode-actions">
      <button id="buildBtn" class="primary active">🔧 Lắp ráp</button>
      <button id="runBtn" class="run" disabled>▶ Chạy xe</button>
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
    <div id="coach" class="coach">Bắt đầu bằng Pin.</div>
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
    <button id="focusSelected">◎ Mô-đun</button>
  </nav>

  <section class="palette panel">
    <div class="palette-title">
      <div><b>6 mô-đun của ô tô</b><small>Chạm lần lượt từ trái sang phải</small></div>
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

function isTrack(id: string) {
  return graph.modules.get(id)?.type === TRACK_TYPE;
}

const workbench = new Workbench(canvas, graph, {
  canEdit: () => mode === 'build',
  canMove: id => !isTrack(id),
  onSelect: renderSelection,
  onGraphChanged: () => {
    if (!restoring) recordHistory();
    saveQuietly();
    refresh();
    if (mode === 'run') applySimulation();
  },
});
workbench.setPlayerName('Kỹ sư nhí');

function freshTrack() {
  for (const module of [...graph.modules.values()]) {
    if (module.type === TRACK_TYPE) graph.removeModule(module.id);
  }

  const count = 6;
  const spacing = 2.888;
  const firstZ = -(count - 1) * spacing / 2;
  const ids: string[] = [];

  for (let i = 0; i < count; i++) {
    const id = 'track-' + i;
    ids.push(id);
    graph.addModule({
      id,
      type: TRACK_TYPE,
      position: [0.8, .65, firstZ + i * spacing],
      rotationY: 0,
    });
  }

  for (let i = 1; i < ids.length; i++) {
    graph.connect({
      id: 'track-link-' + i,
      fromModuleId: ids[i - 1],
      fromPortId: 'structure-front',
      toModuleId: ids[i],
      toPortId: 'structure-back',
      signal: 'structural',
    });
  }
}

function sanitizeAndRestore(raw: string) {
  const parsed = JSON.parse(raw) as { modules?: ModuleInstance[]; connections?: any[] };
  const allowed = new Set<ModuleType>([...CAR_TYPES, TRACK_TYPE]);
  const modules = (parsed.modules ?? []).filter(m => allowed.has(m.type));
  const ids = new Set(modules.map(m => m.id));
  const connections = (parsed.connections ?? []).filter(c => ids.has(c.fromModuleId) && ids.has(c.toModuleId));
  graph.restore({ version: 2, modules, connections });
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) sanitizeAndRestore(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const tracks = [...graph.modules.values()].filter(m => m.type === TRACK_TYPE);
  if (tracks.length !== 6) freshTrack();
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
  workbench.rebuildFromGraph();
  restoring = false;
  historyIndex = index;
  saveQuietly();
  updateHistoryButtons();
  refresh();
  workbench.focusAll();
}

function freshTrackIfMissing() {
  const tracks = [...graph.modules.values()].filter(m => m.type === TRACK_TYPE);
  if (tracks.length !== 6) freshTrack();
}

function carModule(type: ModuleType) {
  return [...graph.modules.values()].find(m => m.type === type);
}

function prefixConnected(index: number) {
  if (index === 0) return Boolean(carModule(CAR_CHAIN[0]));
  return Boolean(graph.findPathByTypes(CAR_CHAIN.slice(0, index + 1)));
}

function status() {
  const state = simulator.evaluate();
  const car = carModule('car-base');
  const switchModule = carModule('switch');
  const connected = Boolean(graph.findPathByTypes(CAR_CHAIN));
  const poweredCar = Boolean(car && state.rpm.has(car.id));
  const roadReady = Boolean(car && vehicleCanTravel(graph, car.id, state.rpm).ready);
  const switchOn = switchModule?.switchOn !== false;
  return {
    state,
    car,
    connected,
    poweredCar,
    roadReady,
    switchOn,
    ready: connected && poweredCar && roadReady && switchOn,
  };
}

function nextRequiredIndex() {
  for (let i = 0; i < CAR_STEPS.length; i++) {
    if (!prefixConnected(i)) return i;
  }
  return -1;
}

function suggestedPosition(index: number): [number, number, number] {
  return [-6.7 + index * 1.6, .65, -3.15];
}

function addCarPart(type: ModuleType) {
  if (mode === 'run') {
    showToast('⏹ Dừng xe trước khi sửa.');
    return;
  }

  const existing = carModule(type);
  if (existing) {
    workbench.selectById(existing.id);
    workbench.focusSelected();
    return;
  }

  const index = CAR_STEPS.findIndex(step => step.type === type);
  if (index < 0) return;

  if (index > 0 && !prefixConnected(index - 1)) {
    showToast('Lắp ' + CAR_STEPS[index - 1].short + ' trước.');
    return;
  }

  const previous = index > 0 ? carModule(CAR_STEPS[index - 1].type) : undefined;
  const instance: ModuleInstance = {
    id: type + '-' + crypto.randomUUID().slice(0, 8),
    type,
    position: suggestedPosition(index),
    rotationY: 0,
    switchOn: type === 'switch' ? true : undefined,
  };

  workbench.addInstance(instance, previous?.id ?? null);
  if (previous) {
    graph.snapModule(instance.id, 1.25);
    workbench.rebuildFromGraph();
    workbench.selectById(instance.id);
  }
  showToast('✓ Đã lắp ' + CAR_STEPS[index].short);
  if (type === 'car-base') workbench.focusAll();
}

function renderPalette() {
  parts.innerHTML = '';
  const next = nextRequiredIndex();

  CAR_STEPS.forEach((step, index) => {
    const existing = carModule(step.type);
    const done = prefixConnected(index);
    const button = document.createElement('button');
    button.className = 'part' + (done ? ' done' : '') + (index === next ? ' next' : '');
    button.disabled = mode === 'run' || (!existing && index > 0 && !prefixConnected(index - 1));
    button.innerHTML = `
      <span class="step-no">${done ? '✓' : index + 1}</span>
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
    const exists = Boolean(carModule(step.type));
    const done = prefixConnected(index);
    const cls = done ? 'done' : exists ? 'present' : '';
    return `<div class="progress-step ${cls}"><span>${done ? '✓' : index + 1}</span><b>${step.short}</b></div>`;
  }).join('');
}

function renderCoach() {
  const current = status();
  const next = nextRequiredIndex();
  const doneCount = CAR_STEPS.filter((_, i) => prefixConnected(i)).length;
  progressText.textContent = doneCount + ' / ' + CAR_STEPS.length;

  if (current.ready) {
    readyBadge.textContent = mode === 'run' ? 'Đang chạy' : 'Sẵn sàng';
    readyBadge.className = 'ready';
    coach.textContent = mode === 'run'
      ? '🚗 Xe đang nhận điện, truyền mô-men qua hộp số và vi sai để chạy trên đường.'
      : '✅ Xe đã ráp đúng. Bấm “Chạy xe”.';
    return;
  }

  readyBadge.textContent = 'Chưa sẵn sàng';
  readyBadge.className = '';

  if (next >= 0) {
    const step = CAR_STEPS[next];
    const exists = carModule(step.type);
    coach.textContent = exists
      ? '🧲 ' + step.short + ' đã có nhưng chưa nối đúng. Chọn mô-đun rồi bấm “Gắn”.'
      : 'Bước ' + (next + 1) + ': chạm “' + step.short + '”.';
    return;
  }

  if (!current.switchOn) {
    coach.textContent = '⏻ Công tắc đang tắt. Chọn Công tắc rồi bấm “Bật”.';
  } else if (!current.roadReady) {
    coach.textContent = '🛣️ Đặt khung xe gần đường thử rồi bấm “Gắn” nếu cần.';
  } else {
    coach.textContent = 'Kiểm tra lại các khớp truyền động.';
  }
}

function refresh() {
  renderPalette();
  renderSteps();
  renderCoach();
  renderSelection(workbench.selectedId);
  const current = status();
  runBtn.disabled = !current.ready && mode === 'build';
  runBtn.textContent = mode === 'run' ? '■ Dừng xe' : '▶ Chạy xe';
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
  const def = MODULES[module.type];
  selectedIcon.textContent = def.icon;
  selectedName.textContent = module.type === 'car-base' ? 'Khung xe + 4 bánh' : def.name;

  if (module.type === TRACK_TYPE) {
    selectedState.textContent = 'Đường thử cố định';
    moduleActions.innerHTML = '<button id="focusOnly">◎ Nhìn gần</button>';
    document.querySelector<HTMLButtonElement>('#focusOnly')!.onclick = () => workbench.focusSelected();
    return;
  }

  const links = graph.incoming(id).length + graph.outgoing(id).length;
  const s = simulator.evaluate();
  const detail: string[] = [links + ' khớp nối'];
  if (s.voltage.has(id)) detail.push(s.voltage.get(id)!.toFixed(1) + ' V');
  if (s.rpm.has(id)) detail.push(Math.round(Math.abs(s.rpm.get(id)!)) + ' rpm');
  selectedState.textContent = detail.join(' · ');

  const switchAction = module.type === 'switch'
    ? `<button id="togglePart" class="primary">${module.switchOn === false ? '⏻ Bật' : '⏻ Tắt'}</button>`
    : '';

  moduleActions.innerHTML = `
    ${switchAction}
    <button id="snapPart" class="primary">🧲 Gắn</button>
    <button id="rotatePart">↻ Xoay</button>
    <button id="detachPart">⤴ Tháo</button>
    <button id="deletePart" class="danger">🗑 Xóa</button>
  `;

  const toggle = document.querySelector<HTMLButtonElement>('#togglePart');
  if (toggle) toggle.onclick = () => {
    workbench.toggleSwitch();
    refresh();
  };

  document.querySelector<HTMLButtonElement>('#snapPart')!.onclick = () => {
    const joined = workbench.snapSelected();
    showToast(joined ? '🧲 Đã gắn đúng khớp.' : 'Chưa có khớp phù hợp ở gần.');
    refresh();
  };

  document.querySelector<HTMLButtonElement>('#rotatePart')!.onclick = () => {
    workbench.rotateSelected();
    refresh();
  };

  document.querySelector<HTMLButtonElement>('#detachPart')!.onclick = () => {
    const detached = workbench.detachSelected();
    showToast(detached ? 'Đã tháo mô-đun.' : 'Mô-đun chưa có khớp nối.');
    refresh();
  };

  document.querySelector<HTMLButtonElement>('#deletePart')!.onclick = () => {
    workbench.removeSelected();
    refresh();
  };
}

function applySimulation() {
  const s = simulator.evaluate();
  workbench.setSimulation(true, s.rpm, s.active, s.fluid);
  renderCoach();
  renderSelection(workbench.selectedId);
}

function setMode(next: 'build' | 'run') {
  if (next === 'run') {
    const current = status();
    if (!current.ready) {
      showToast('Ráp đủ 6 mô-đun và nối đúng trước.');
      return;
    }
    mode = 'run';
    applySimulation();
    workbench.focusAll();
  } else {
    mode = 'build';
    workbench.setSimulation(false, new Map(), new Set(), new Set());
  }
  refresh();
}

buildBtn.onclick = () => setMode('build');
runBtn.onclick = () => setMode(mode === 'run' ? 'build' : 'run');

undoBtn.onclick = () => restoreHistory(historyIndex - 1);
redoBtn.onclick = () => restoreHistory(historyIndex + 1);

resetBtn.onclick = () => {
  setMode('build');
  graph.restore({ version: 2, modules: [], connections: [] });
  freshTrack();
  workbench.rebuildFromGraph();
  history = [];
  historyIndex = -1;
  recordHistory();
  saveQuietly();
  refresh();
  workbench.focusAll();
  showToast('Đã làm sạch bàn lắp ráp.');
};

document.querySelector<HTMLButtonElement>('#cameraIso')!.onclick = () => workbench.setCamera('iso');
document.querySelector<HTMLButtonElement>('#cameraTop')!.onclick = () => workbench.setCamera('top');
document.querySelector<HTMLButtonElement>('#focusAll')!.onclick = () => workbench.focusAll();
document.querySelector<HTMLButtonElement>('#focusSelected')!.onclick = () => workbench.focusSelected();

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
      const registration = await navigator.serviceWorker.register('./sw.js?v=20260930-car1', {
        scope: './',
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {
      // The focused car lab still works online if service worker registration is unavailable.
    }
  });
}
