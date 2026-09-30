import './styles/app.css';
import { ConnectionGraph, normalizeConnection } from './core/connectionGraph';
import { MODULES } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import type { ModuleInstance, ModuleType, Vector3Tuple } from './core/types';
import { vehicleCanTravel } from './core/vehicleRules';
import { Workbench, type SnapPose } from './three/workbench';

type CarPart = {
  type: Exclude<ModuleType, 'road-straight'>;
  short: string;
  help: string;
};

const CAR_PARTS: CarPart[] = [
  { type: 'car-base', short: 'Khung xe', help: 'Nền để gắn các bộ phận.' },
  { type: 'battery', short: 'Pin', help: 'Nguồn điện 6 V.' },
  { type: 'switch', short: 'Công tắc', help: 'Bật hoặc ngắt điện.' },
  { type: 'motor', short: 'Mô tơ', help: 'Biến điện thành quay.' },
  { type: 'gearbox', short: 'Hộp số', help: 'Giảm tốc, tăng lực kéo.' },
  { type: 'differential', short: 'Vi sai', help: 'Truyền mô-men tới bánh.' },
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
const STORAGE_KEY = 'little-engineer-car-lab-v3';
const CAR_YAW = -Math.PI / 2;
const CHASSIS_HOME: Vector3Tuple = [.8, .65, -4.9];

const STAGING: Record<Exclude<ModuleType, 'road-straight'>, Vector3Tuple> = {
  'car-base': [-4.1, .65, -5.0],
  battery: [-5.25, .65, -2.8],
  switch: [-3.75, .65, -2.8],
  motor: [-5.25, .65, -4.05],
  gearbox: [-3.75, .65, -4.05],
  differential: [-2.35, .65, -3.45],
};

const LOCAL_SLOTS: Record<Exclude<ModuleType, 'road-straight' | 'car-base'>, Vector3Tuple> = {
  battery: [.55, .37, .46],
  switch: [.55, .37, -.43],
  motor: [-.28, .33, .46],
  gearbox: [-.28, .33, -.43],
  differential: [-1.05, .26, 0],
};

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="world"></canvas>

  <header class="topbar">
    <div class="brand">
      <span class="brand-icon">🚗</span>
      <div>
        <b>Ô tô Kỹ sư 3D</b>
        <small>Tự kéo linh kiện vào xe · gần đúng sẽ tự hút khớp</small>
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
      <div><small>ĐÃ LẮP ĐÚNG VỊ TRÍ</small><b id="progressText">0 / 6</b></div>
      <span id="readyBadge">Chưa sẵn sàng</span>
    </div>
    <div id="stepList" class="step-list"></div>
    <div id="coach" class="coach">Chọn linh kiện bất kỳ. Kéo Khung xe vào đường thử rồi kéo các bộ phận lên khung.</div>
  </aside>

  <aside id="selectionPanel" class="selection-panel panel hidden">
    <div class="selection-title">
      <span id="selectedIcon">⚙️</span>
      <div><b id="selectedName">Mô-đun</b><small id="selectedState"></small></div>
    </div>
    <div id="gestureHint" class="gesture-hint"></div>
    <div id="moduleActions" class="module-actions"></div>
  </aside>

  <nav class="camera-bar panel">
    <button id="cameraIso" class="active">◩ Chéo</button>
    <button id="cameraTop">▦ Trên</button>
    <button id="focusAll">⌗ Toàn xe</button>
  </nav>

  <section class="palette panel">
    <div class="palette-title">
      <div>
        <b>Kho linh kiện ô tô</b>
        <small>Chọn bất kỳ thứ tự nào · chạm để lấy ra, sau đó kéo bằng tay để lắp</small>
      </div>
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
const gestureHint = document.querySelector<HTMLElement>('#gestureHint')!;
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

function rotateOffset(local: Vector3Tuple, yaw: number): Vector3Tuple {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    local[0] * c + local[2] * s,
    local[1],
    -local[0] * s + local[2] * c,
  ];
}

function distance(a: Vector3Tuple, b: Vector3Tuple) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function carModule(type: ModuleType) {
  return [...graph.modules.values()].find(module => module.type === type);
}

function isTrack(id: string) {
  return graph.modules.get(id)?.type === TRACK_TYPE;
}

function isChassisInstalled() {
  const chassis = carModule('car-base');
  return Boolean(
    chassis &&
    distance(chassis.position, CHASSIS_HOME) < .12 &&
    Math.abs(chassis.rotationY - CAR_YAW) < .08
  );
}

function partSlotPose(type: Exclude<ModuleType, 'road-straight' | 'car-base'>): SnapPose | null {
  const chassis = carModule('car-base');
  if (!chassis || !isChassisInstalled()) return null;

  const local = LOCAL_SLOTS[type];
  const rotated = rotateOffset(local, chassis.rotationY);
  return {
    position: [
      chassis.position[0] + rotated[0],
      chassis.position[1] + rotated[1],
      chassis.position[2] + rotated[2],
    ],
    rotationY: chassis.rotationY,
    label: MODULES[type].name,
  };
}

function snapPoseFor(id: string, raw: Vector3Tuple): SnapPose | null {
  const module = graph.modules.get(id);
  if (!module || module.type === TRACK_TYPE) return null;

  if (module.type === 'car-base') {
    return distance(raw, CHASSIS_HOME) <= 1.45
      ? { position: [...CHASSIS_HOME], rotationY: CAR_YAW, label: 'Đường thử' }
      : null;
  }

  const pose = partSlotPose(module.type);
  if (!pose) return null;
  return distance(raw, pose.position) <= 1.0 ? pose : null;
}

function isInstalled(module: ModuleInstance | undefined) {
  if (!module || module.type === TRACK_TYPE) return false;

  if (module.type === 'car-base') return isChassisInstalled();

  const pose = partSlotPose(module.type);
  return Boolean(
    pose &&
    distance(module.position, pose.position) < .1 &&
    Math.abs(module.rotationY - pose.rotationY) < .08
  );
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
    if (!from || !to || !isInstalled(from) || !isInstalled(to)) continue;

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
      const allowed = new Set<ModuleType>([...CAR_PARTS.map(part => part.type), TRACK_TYPE]);
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

function status() {
  const state = simulator.evaluate();
  const car = carModule('car-base');
  const switchModule = carModule('switch');
  const installedCount = CAR_PARTS.filter(part => isInstalled(carModule(part.type))).length;
  const allInstalled = installedCount === CAR_PARTS.length;
  const connected = Boolean(graph.findPathByTypes(FUNCTION_CHAIN));
  const poweredCar = Boolean(car && state.rpm.has(car.id));
  const roadReady = Boolean(car && vehicleCanTravel(graph, car.id, state.rpm).ready);
  const switchOn = switchModule?.switchOn !== false;

  return {
    state,
    car,
    installedCount,
    allInstalled,
    connected,
    poweredCar,
    roadReady,
    switchOn,
    ready: allInstalled && connected && poweredCar && roadReady && switchOn,
  };
}

const workbench = new Workbench(canvas, graph, {
  canEdit: () => mode === 'build',
  canMove: id => !isTrack(id),
  requiresHoldToMove: id => isInstalled(graph.modules.get(id)),
  getSnapPose: (id, raw) => snapPoseFor(id, raw),
  onHoldReady: id => {
    const module = graph.modules.get(id);
    if (!module) return;
    showToast('Giữ đủ rồi — kéo ' + MODULES[module.type].name + ' để tháo.');
  },
  onDrop: (id, snapped) => {
    const module = graph.modules.get(id);
    if (!module) return;

    if (snapped) {
      ensureFunctionalLinks();
      showToast('🧲 ' + MODULES[module.type].name + ' đã khớp đúng vị trí.');
    } else {
      showToast(MODULES[module.type].name + ' đang ở trạng thái rời.');
    }
  },
  onSelect: renderSelection,
  onGraphChanged: () => {
    ensureFunctionalLinks();
    if (!restoring) recordHistory();
    saveQuietly();
    refresh();
    if (mode === 'run') applySimulation();
  },
});

function spawnPart(type: Exclude<ModuleType, 'road-straight'>) {
  if (mode === 'run') {
    showToast('⏹ Dừng xe trước khi lắp.');
    return;
  }

  const existing = carModule(type);
  if (existing) {
    workbench.selectById(existing.id);
    workbench.focusSelected();
    return;
  }

  const instance: ModuleInstance = {
    id: type + '-' + crypto.randomUUID().slice(0, 8),
    type,
    position: [...STAGING[type]],
    rotationY: 0,
    switchOn: type === 'switch' ? true : undefined,
  };

  workbench.addInstance(instance);
  showToast('Đã lấy ' + MODULES[type].name + '. Kéo bằng tay để lắp.');
}

function deleteModule(id: string) {
  const module = graph.modules.get(id);
  if (!module || module.type === TRACK_TYPE) return;

  graph.removeModule(id);
  workbench.rebuildFromGraph();
  ensureFunctionalLinks();
  recordHistory();
  saveQuietly();
  refresh();
  showToast('Đã cất ' + MODULES[module.type].name + ' khỏi bàn lắp.');
}

function renderPalette() {
  parts.innerHTML = '';

  CAR_PARTS.forEach(part => {
    const module = carModule(part.type);
    const installed = isInstalled(module);
    const button = document.createElement('button');

    button.className =
      'part' +
      (installed ? ' done' : module ? ' present' : '');

    button.disabled = mode === 'run';
    button.innerHTML = `
      <span class="step-no">${installed ? '✓' : module ? '•' : '+'}</span>
      <span class="part-icon">${MODULES[part.type].icon}</span>
      <b>${part.short}</b>
      <small>${installed ? 'Đã lắp' : module ? 'Đang ở bàn lắp' : part.help}</small>
    `;

    button.onclick = () => spawnPart(part.type);
    parts.appendChild(button);
  });
}

function renderSteps() {
  stepList.innerHTML = CAR_PARTS.map(part => {
    const module = carModule(part.type);
    const installed = isInstalled(module);
    const cls = installed ? 'done' : module ? 'present' : '';
    const symbol = installed ? '✓' : module ? '↕' : '○';

    return `
      <div class="progress-step ${cls}">
        <span>${symbol}</span>
        <b>${part.short}</b>
      </div>
    `;
  }).join('');
}

function renderCoach() {
  const current = status();
  progressText.textContent = current.installedCount + ' / ' + CAR_PARTS.length;

  if (current.ready) {
    readyBadge.textContent = mode === 'run' ? 'Đang chạy' : 'Sẵn sàng';
    readyBadge.className = 'ready';
    coach.textContent = mode === 'run'
      ? '🚗 Mô tơ, hộp số, vi sai và bánh xe đang hoạt động cùng một cụm.'
      : '✅ Xe đã lắp đúng. Bấm “Chạy” để thử.';
    return;
  }

  readyBadge.textContent = 'Chưa sẵn sàng';
  readyBadge.className = '';

  if (!carModule('car-base')) {
    coach.textContent = 'Chọn linh kiện bất kỳ. Khi muốn ráp, lấy Khung xe và kéo nó vào đường thử; gần đúng sẽ tự hút.';
    return;
  }

  if (!isChassisInstalled()) {
    coach.textContent = 'Kéo Khung xe vào giữa đường thử. Khi tới gần đúng vị trí, khung sẽ tự căn thẳng và hút vào.';
    return;
  }

  if (!current.allInstalled) {
    coach.textContent = 'Khung đã sẵn sàng. Chọn bất kỳ linh kiện còn thiếu rồi kéo lên khung; gần đúng vị trí sẽ tự khớp.';
    return;
  }

  if (!current.switchOn) {
    coach.textContent = '⏻ Mọi thứ đã lắp đúng nhưng Công tắc đang tắt. Chạm Công tắc rồi bật lên.';
    return;
  }

  coach.textContent = 'Kiểm tra lại một khớp truyền động vừa bị tháo.';
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
    gestureHint.textContent = 'Đường không thể kéo nhầm.';
    moduleActions.innerHTML = '<button id="focusTrack">◎ Nhìn toàn xe</button>';
    document.querySelector<HTMLButtonElement>('#focusTrack')!.onclick = () => workbench.focusAll();
    return;
  }

  const installed = isInstalled(module);
  const state = simulator.evaluate();
  const details: string[] = [installed ? 'Đã khớp trên xe' : 'Linh kiện rời'];

  if (state.voltage.has(id)) details.push(state.voltage.get(id)!.toFixed(1) + ' V');
  if (state.rpm.has(id)) details.push(Math.round(Math.abs(state.rpm.get(id)!)) + ' rpm');
  selectedState.textContent = details.join(' · ');

  gestureHint.textContent = installed
    ? '🔒 Đã khóa: chạm chỉ để chọn. Muốn tháo, giữ khoảng 0,5 giây rồi kéo ra.'
    : module.type === 'car-base'
      ? '☝️ Kéo khung xe vào đường thử. Gần đúng vị trí sẽ tự hút và căn thẳng.'
      : isChassisInstalled()
        ? '☝️ Kéo linh kiện lên khung xe. Gần đúng vị trí sẽ tự hút vào.'
        : '☝️ Có thể kéo linh kiện tự do. Lắp Khung xe vào đường trước để hiện vị trí hút.';

  const toggleAction = module.type === 'switch'
    ? `<button id="togglePart" class="primary">${module.switchOn === false ? '⏻ Bật' : '⏻ Tắt'}</button>`
    : '';

  moduleActions.innerHTML = `
    ${toggleAction}
    <button id="focusPart">◎ Nhìn gần</button>
    <button id="deletePart" class="danger">🗑 Cất linh kiện</button>
  `;

  const toggle = document.querySelector<HTMLButtonElement>('#togglePart');
  if (toggle) {
    toggle.onclick = () => {
      workbench.toggleSwitch();
      refresh();
    };
  }

  document.querySelector<HTMLButtonElement>('#focusPart')!.onclick = () => workbench.focusSelected();
  document.querySelector<HTMLButtonElement>('#deletePart')!.onclick = () => deleteModule(id);
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
      showToast('Kéo đủ 6 bộ phận vào đúng vị trí trước.');
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
        installedCount: current.installedCount,
        rpm: Object.fromEntries(current.state.rpm),
        carId: current.car?.id ?? null,
      };
    },
    rendered(id: string) {
      return workbench.renderedTransform(id);
    },
    screen(id: string) {
      return workbench.screenPointForModule(id);
    },
    screenWorld(position: Vector3Tuple) {
      return workbench.screenPointForWorld(position);
    },
    snapPose(type: Exclude<ModuleType, 'road-straight'>) {
      if (type === 'car-base') return { position: CHASSIS_HOME, rotationY: CAR_YAW };
      return partSlotPose(type);
    },
    isInstalled(id: string) {
      return isInstalled(graph.modules.get(id));
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
      const registration = await navigator.serviceWorker.register('./sw.js?v=20260930-car3', {
        scope: './',
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {}
  });
}
