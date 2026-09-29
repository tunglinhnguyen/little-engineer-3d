import './styles/app.css';
import { ConnectionGraph } from './core/connectionGraph';
import { MODULES, PALETTE } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import { getMissionFeedback, MISSIONS } from './core/missions';
import type { ModuleCategory, ModuleInstance, ModuleType } from './core/types';
import { Workbench } from './three/workbench';
import { setSpeechEnabled, speak } from './ui/speech';
import { SoundEngine } from './ui/sound';
import { vehicleCanTravel } from './core/vehicleRules';
import { ProjectStore } from './core/projectStore';
import { ProgressStore, ACHIEVEMENTS } from './core/progress';
import { BLUEPRINTS, instantiateBlueprint } from './core/blueprints';
import { TUTORIALS, tutorialProgress } from './core/tutorials';
import { worldCollisionReport } from './core/physics';
import { buildVehicleRoute } from './core/worldRoutes';

const app = document.querySelector<HTMLDivElement>('#app')!;
const savedPlayerName = (localStorage.getItem('le3d-player-name') ?? '').trim().slice(0, 18);
app.innerHTML = `
  <canvas id="world"></canvas>
  <section class="welcome-screen ${savedPlayerName ? 'hidden' : ''}" id="welcomeScreen">
    <div class="welcome-card panel">
      <div class="welcome-icon">🧑‍🔧</div>
      <h1>Thế giới Kỹ sư 3D</h1>
      <p>Con tên là gì? Nhập tên để bắt đầu xây máy, xe, đường sắt, nhà cửa và cả một thế giới của riêng con.</p>
      <input id="playerNameInput" maxlength="18" autocomplete="off" placeholder="Tên của bé" />
      <button id="enterWorldBtn">🚀 Vào thế giới của con</button>
    </div>
  </section>
  <header class="topbar">
    <div class="brand"><div class="brand-icon">⚙️</div><div><b id="worldTitle">Thế giới Kỹ sư 3D</b><small>Build · Invent · Explore · v0.7.0</small></div></div>
    <div class="toolbar">
      <button id="buildBtn" class="active">🔧 Lắp ráp</button><button id="runBtn">▶ Chạy</button>
      <button id="nameBtn" class="icon-btn" title="Đổi tên">👤</button>
      <button id="toolboxBtn" class="icon-btn" title="Công cụ kỹ sư">🧰</button>
      <button id="undoBtn" class="icon-btn" title="Hoàn tác" aria-label="Hoàn tác">↶</button>
      <button id="redoBtn" class="icon-btn" title="Làm lại thao tác" aria-label="Làm lại thao tác">↷</button>
      <button id="saveBtn" class="icon-btn" title="Lưu">💾</button><button id="resetBtn" class="icon-btn" title="Xóa thế giới">🗑️</button>
    </div>
  </header>
  <aside class="mission panel" id="missionPanel">
    <div class="mission-head"><span id="missionEmoji">💡</span><div class="mission-label"><small>NHIỆM VỤ</small><b id="missionTitle"></b></div><button id="missionToggle" class="mission-toggle" aria-label="Thu nhỏ nhiệm vụ" title="Thu nhỏ nhiệm vụ">−</button></div>
    <p id="missionDescription"></p><div class="lesson" id="missionLesson"></div>
    <div class="mission-actions"><button id="prevMission">‹</button><span id="missionCount"></span><button id="nextMission">›</button></div>
  </aside>
  <aside class="inspector panel hidden-by-user" id="inspector"></aside>
  <aside class="tool-drawer panel hidden-by-user" id="toolDrawer">
    <div class="tool-head"><b>🧰 Bộ công cụ Kỹ sư</b><button id="closeTools">×</button></div>
    <div class="tool-tabs">
      <button data-tool-tab="build" class="active">Xây dựng</button>
      <button data-tool-tab="learn">Học</button>
      <button data-tool-tab="projects">Dự án</button>
      <button data-tool-tab="profile">Hồ sơ</button>
    </div>
    <div class="tool-page" data-tool-page="build">
      <div class="tool-section"><b>Chế độ thế giới</b><div class="tool-grid">
        <button id="sandboxBtn">🧱 Sandbox</button>
        <button id="energyBtn">✨ Dòng năng lượng: Tắt</button>
        <button id="xrayBtn">🩻 X-ray</button>
        <button id="explodeBtn">💥 Xem cấu tạo</button>
        <button id="dayNightBtn">🌙 Ban đêm</button>
        <button id="weatherBtn">🌧 Mưa</button>
        <button id="performanceBtn">⚡ Tối ưu iPad</button>
      </div></div>
      <div class="tool-section"><b>Blueprint</b><div id="blueprintList" class="blueprint-list"></div></div>
      <div class="tool-section maker">
        <b>🧩 Tạo mô-đun</b>
        <div class="maker-grid">
          <input id="makerName" maxlength="22" placeholder="Tên mô-đun" value="Khối của con" />
          <select id="makerSignal">
            <option value="structure">Kết cấu</option><option value="power">Điện</option>
            <option value="rotation">Truyền động</option><option value="fluid">Nước</option>
          </select>
          <select id="makerShape"><option value="box">Khối hộp</option><option value="cylinder">Hình trụ</option></select>
          <input id="makerColor" type="color" value="#6d9fd1" />
          <label>Rộng <input id="makerX" type="range" min="0.5" max="2.5" step="0.1" value="1.2"/></label>
          <label>Cao <input id="makerY" type="range" min="0.4" max="2.5" step="0.1" value="1.0"/></label>
          <label>Dài <input id="makerZ" type="range" min="0.5" max="2.5" step="0.1" value="1.2"/></label>
          <button id="createMakerBtn">➕ Tạo khối</button>
        </div>
      </div>
    </div>
    <div class="tool-page hidden" data-tool-page="learn">
      <div class="tool-section"><b>🎓 Hướng dẫn tương tác</b><div id="tutorialList" class="tutorial-list"></div><div id="tutorialProgress" class="tutorial-progress"></div></div>
      <div class="tool-section"><b>Chế độ học</b><div class="tool-grid"><button id="kidModeBtn" class="active">🧒 Trẻ em</button><button id="engineerModeBtn">🧠 Kỹ sư nhỏ</button></div></div>
    </div>
    <div class="tool-page hidden" data-tool-page="projects">
      <div class="tool-section project-create"><input id="projectName" maxlength="40" placeholder="Tên công trình" value="Thành phố của con"/><button id="saveProjectBtn">💾 Lưu thành dự án</button></div>
      <div class="tool-section"><div class="tool-grid"><button id="exportProjectBtn">📤 Sao chép JSON</button><button id="importProjectBtn">📥 Nhập JSON</button></div></div>
      <div id="projectList" class="project-list"></div>
    </div>
    <div class="tool-page hidden" data-tool-page="profile">
      <div id="profileSummary"></div>
    </div>
  </aside>
  <nav class="camera-bar panel">
    <button data-camera="iso" class="active">◩ Chéo</button>
    <button data-camera="top">▦ Trên</button>
    <button data-camera="front">▤ Trước</button>
    <button data-camera="rear">▥ Sau</button>
    <button data-camera="left">◧ Trái</button>
    <button data-camera="right">◨ Phải</button>
    <button id="focusAllBtn" title="Nhìn toàn bộ thế giới">⌗ Toàn cảnh</button>
    <button id="focusSelectedBtn" title="Nhìn gần mô-đun đang chọn">◎ Vật chọn</button>
    <button id="followCameraBtn" title="Theo mô-đun đang chọn khi nó di chuyển">🎥 Theo vật</button>
    <button id="cameraLockBtn" title="Khóa/mở xoay góc nhìn">🔓 Góc nhìn</button>
  </nav>
  <section class="palette panel">
    <div class="palette-title"><b>Kho mô-đun</b><span>${PALETTE.length} mô-đun · chọn theo nhóm</span></div>
    <div class="palette-tools"><input id="moduleSearch" type="search" inputmode="search" autocomplete="off" placeholder="🔎 Tìm xe, nhà, mô tơ, cây..." aria-label="Tìm mô-đun" /></div>
    <div class="category-tabs" id="categoryTabs"></div>
    <div class="parts" id="parts"></div>
  </section>
  <div class="coach" id="coach">Chọn một mô-đun ở kho phía dưới để bắt đầu.</div>
  <div class="toast hidden" id="toast"></div>
`;

const graph = new ConnectionGraph();
const simulator = new SimulationEngine(graph);
const sound = new SoundEngine();
const projectStore = new ProjectStore();
const progressStore = new ProgressStore();
progressStore.startSession();
let mode: 'build' | 'run' = 'build', missionIndex = Number(localStorage.getItem('le3d-mission') ?? 0) % MISSIONS.length;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const coach = document.querySelector<HTMLDivElement>('#coach')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const buildBtn = document.querySelector<HTMLButtonElement>('#buildBtn')!, runBtn = document.querySelector<HTMLButtonElement>('#runBtn')!;
let toastTimer = 0;
let completedMissionId: string | null = null;
let sandboxMode = localStorage.getItem('le3d-sandbox') === '1';
let engineerMode = localStorage.getItem('le3d-engineer-mode') === '1';
let energyMode: 'off' | 'all' | 'power' | 'rotation' | 'fluid' = 'off';
let activeTutorialId: string | null = localStorage.getItem('le3d-tutorial');

function showToast(text: string) { toast.textContent = text; toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 2200); }
function save() { localStorage.setItem('le3d-project', JSON.stringify(graph.serialize())); localStorage.setItem('le3d-mission', String(missionIndex)); showToast('💾 Đã lưu thế giới trên thiết bị'); }
function load() { try { const raw = localStorage.getItem('le3d-project'); if (raw) graph.restore(JSON.parse(raw)); } catch { localStorage.removeItem('le3d-project'); } }

load();

let history = [JSON.stringify(graph.serialize())];
let historyIndex = 0;
let restoringHistory = false;

function updateHistoryButtons() {
  const undo = document.querySelector<HTMLButtonElement>('#undoBtn');
  const redo = document.querySelector<HTMLButtonElement>('#redoBtn');
  if (undo) undo.disabled = historyIndex <= 0;
  if (redo) redo.disabled = historyIndex >= history.length - 1;
}

function recordHistory() {
  if (restoringHistory) return;
  const snapshot = JSON.stringify(graph.serialize());
  if (snapshot === history[historyIndex]) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

const workbench = new Workbench(canvas, graph, {
  canEdit: () => mode === 'build',
  onSelect: renderInspector,
  onGraphChanged: () => {
    recordHistory();
    saveQuietly(); renderInspector(workbench.selectedId);
    if (mode === 'run') evaluateRun(); else { updateMissionHint(); updateProgress(); }
  },
});
workbench.rebuildFromGraph();

const welcomeScreen = document.querySelector<HTMLElement>('#welcomeScreen')!;
const playerNameInput = document.querySelector<HTMLInputElement>('#playerNameInput')!;
const worldTitle = document.querySelector<HTMLElement>('#worldTitle')!;
const enterWorldBtn = document.querySelector<HTMLButtonElement>('#enterWorldBtn')!;
const nameBtn = document.querySelector<HTMLButtonElement>('#nameBtn')!;
playerNameInput.value = savedPlayerName;

function applyPlayerName(raw: string, announce = true) {
  const clean = raw.trim().replace(/\s+/g, ' ').slice(0, 18) || 'Bé';
  localStorage.setItem('le3d-player-name', clean);
  playerNameInput.value = clean;
  worldTitle.textContent = 'Thế giới của ' + clean;
  document.title = 'Thế giới của ' + clean;
  workbench.setPlayerName(clean);
  welcomeScreen.classList.add('hidden');
  if (announce) speak('Chào ' + clean + '. Chào mừng con đến thế giới kỹ sư của mình. Hãy chọn mô đun để bắt đầu xây dựng.');
}
if (savedPlayerName) applyPlayerName(savedPlayerName, false);
else workbench.setPlayerName('Bé');

enterWorldBtn.onclick = () => applyPlayerName(playerNameInput.value);
playerNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') applyPlayerName(playerNameInput.value); });
nameBtn.onclick = () => {
  playerNameInput.value = localStorage.getItem('le3d-player-name') ?? '';
  welcomeScreen.classList.remove('hidden');
  requestAnimationFrame(() => playerNameInput.focus());
};

function saveQuietly() { localStorage.setItem('le3d-project', JSON.stringify(graph.serialize())); }

function moduleName(instance: ModuleInstance | undefined) {
  return instance?.custom?.name?.trim() || (instance ? MODULES[instance.type].name : '');
}

function updateProgress(state = simulator.evaluate()) {
  const modules = [...graph.modules.values()];
  const buildingCount = modules.filter(m => MODULES[m.type].category === 'building').length;
  const hasRoad = modules.some(m => ['road-straight','road-curve','road-crossing','road-t-junction','bridge'].includes(m.type));
  const hasTree = modules.some(m => m.type === 'tree' || m.type === 'bush' || m.type === 'flower');
  const vehicleModules = modules.filter(m => MODULES[m.type].behavior.kind === 'vehicle');
  const vehicleActive = vehicleModules.some(m => vehicleCanTravel(graph,m.id,state.rpm).ready);
  const trainActive = modules.some(m => m.type === 'train-engine' && vehicleCanTravel(graph,m.id,state.rpm).ready);
  const waterActive = modules.some(m => m.type === 'nozzle' && state.flow.has(m.id) && (state.flow.get(m.id) ?? 0) > .1);
  const electricalActive = modules.some(m =>
    MODULES[m.type].behavior.kind === 'power-output' && state.powered.has(m.id)
  );

  const newly = progressStore.evaluate({
    moduleCount: modules.length,
    electricalActive,
    mechanicalCount: state.rpm.size,
    waterActive,
    vehicleActive,
    trainActive,
    architecturalCount: buildingCount,
    cityLike: hasRoad && hasTree && buildingCount >= 3 && vehicleModules.length > 0,
  });

  if (newly.length) {
    const award = newly[0];
    showToast(award.icon + ' Mở khóa: ' + award.title);
    speak('Chúc mừng. Con vừa nhận huy hiệu ' + award.title + '.');
  }
  renderProfile();
  renderTutorialProgress(state);
}


function findFreePosition(type: ModuleType): [number, number, number] {
  const def = MODULES[type];
  const radius = Math.max(def.size[0], def.size[2]) * .5 + .22;
  const selected = workbench?.selectedId ? graph.modules.get(workbench.selectedId) : undefined;
  const originX = selected?.position[0] ?? 0;
  const originZ = selected?.position[2] ?? 0;
  const step = 1.7;

  const candidates: [number, number][] = [];
  for (let ring = 0; ring <= 12; ring++) {
    for (let gx = -ring; gx <= ring; gx++) {
      for (let gz = -ring; gz <= ring; gz++) {
        if (ring > 0 && Math.max(Math.abs(gx), Math.abs(gz)) !== ring) continue;
        const x = Math.round((originX + gx * step) * 4) / 4;
        const z = Math.round((originZ + gz * step) * 4) / 4;
        if (Math.abs(x) > 27 || Math.abs(z) > 19) continue;
        candidates.push([x, z]);
      }
    }
  }

  for (const [x, z] of candidates) {
    const free = [...graph.modules.values()].every(existing => {
      const other = MODULES[existing.type];
      const otherRadius = Math.max(other.size[0], other.size[2]) * .5 + .22;
      return Math.hypot(x - existing.position[0], z - existing.position[2]) >= radius + otherRadius;
    });
    if (free) return [x, .65, z];
  }

  const n = graph.modules.size;
  return [
    Math.max(-27, Math.min(27, originX + ((n % 9) - 4) * 1.8)),
    .65,
    Math.max(-19, Math.min(19, originZ - 6 - Math.floor(n / 9) * 1.6)),
  ];
}

function contextualSpawnPosition(type: ModuleType): [number, number, number] | null {
  const selectedId = workbench.selectedId;
  const selected = selectedId ? graph.modules.get(selectedId) : undefined;
  if (!selected) return null;

  const pair = new Set([selected.type, type]);
  const atSelected = (): [number, number, number] => [selected.position[0], selected.position[1], selected.position[2]];

  if ((selected.type === 'car-base' || selected.type === 'motorcycle-base' || selected.type === 'firetruck') &&
      (type === 'road-straight' || type === 'road-curve')) return atSelected();
  if ((type === 'car-base' || type === 'motorcycle-base' || type === 'firetruck') &&
      (selected.type === 'road-straight' || selected.type === 'road-curve')) return atSelected();

  if (selected.type === 'train-engine' && (type === 'rail-straight' || type === 'rail-curve')) return atSelected();
  if (type === 'train-engine' && (selected.type === 'rail-straight' || selected.type === 'rail-curve')) return atSelected();

  if (selected.type === 'airplane' && type === 'runway') return atSelected();
  if (type === 'airplane' && selected.type === 'runway') return atSelected();

  if (selected.type === 'helicopter' && type === 'helipad') return atSelected();
  if (type === 'helicopter' && selected.type === 'helipad') return atSelected();

  if (selected.type === 'boat' && (type === 'sea-tile' || type === 'water-tile')) return atSelected();
  if (type === 'boat' && (selected.type === 'sea-tile' || selected.type === 'water-tile')) return atSelected();

  void pair;
  return null;
}

function addModule(type: ModuleType) {
  if (mode !== 'build') { showToast('⏹ Dừng mô phỏng trước khi thay linh kiện'); return; }
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
  const instance: ModuleInstance = {
    id,
    type,
    position: contextualSpawnPosition(type) ?? findFreePosition(type),
    rotationY: 0,
    switchOn: (type === 'switch' || type === 'valve') ? true : (type === 'door' || type === 'rail-switch') ? false : undefined,
  };
  const attachTo = workbench.selectedId;
  workbench.addInstance(instance, attachTo);
  const joined = graph.incoming(id).length + graph.outgoing(id).length > 0;
  showToast(joined
    ? `🧲 ${MODULES[type].name} đã tự căn và ghép đúng khớp`
    : `➕ Đã đặt ${MODULES[type].name} vào chỗ trống`);
  speak(`Đây là ${MODULES[type].name}. ${MODULES[type].description} ${MODULES[type].science}`);
}

const parts = document.querySelector<HTMLDivElement>('#parts')!;
const categoryTabs = document.querySelector<HTMLDivElement>('#categoryTabs')!;
const moduleSearch = document.querySelector<HTMLInputElement>('#moduleSearch')!;
const CATEGORY_META: Record<ModuleCategory | 'all', { label: string; icon: string }> = {
  all: { label: 'Tất cả', icon: '🧰' },
  energy: { label: 'Nguồn', icon: '⚡' },
  control: { label: 'Điều khiển', icon: '🎛️' },
  motion: { label: 'Truyền động', icon: '⚙️' },
  output: { label: 'Cơ cấu', icon: '🛠️' },
  fluid: { label: 'Nước', icon: '💧' },
  structure: { label: 'Khung máy', icon: '🧱' },
  vehicle: { label: 'Xe & tàu', icon: '🚗' },
  transport: { label: 'Đường & ray', icon: '🛤️' },
  building: { label: 'Xây nhà', icon: '🏠' },
  nature: { label: 'Thiên nhiên', icon: '🌳' },
};
let activeCategory: ModuleCategory | 'all' = 'all';
let moduleQuery = '';

const searchable = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function renderPalette() {
  parts.innerHTML = '';
  const q = searchable(moduleQuery.trim());
  let shown = 0;
  for (const type of PALETTE) {
    const d = MODULES[type];
    if (activeCategory !== 'all' && d.category !== activeCategory) continue;
    const haystack = searchable([type, d.name, d.description, d.science, CATEGORY_META[d.category].label].join(' '));
    if (q && !haystack.includes(q)) continue;
    const b = document.createElement('button');
    b.className = 'part ' + d.category;
    b.innerHTML = '<span>' + d.icon + '</span><b>' + d.name + '</b><small>' + CATEGORY_META[d.category].label + '</small>';
    b.onclick = () => addModule(type);
    parts.appendChild(b);
    shown++;
  }
  if (!shown) {
    const empty = document.createElement('div');
    empty.className = 'palette-empty';
    empty.textContent = 'Không tìm thấy mô-đun phù hợp.';
    parts.appendChild(empty);
  }
}
for (const category of ['all', 'energy', 'control', 'motion', 'output', 'fluid', 'vehicle', 'transport', 'building', 'nature', 'structure'] as const) {
  const b = document.createElement('button');
  b.className = 'category-tab' + (category === 'all' ? ' active' : '');
  b.textContent = CATEGORY_META[category].icon + ' ' + CATEGORY_META[category].label;
  b.onclick = () => {
    activeCategory = category;
    categoryTabs.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderPalette();
  };
  categoryTabs.appendChild(b);
}
moduleSearch.addEventListener('input', () => {
  moduleQuery = moduleSearch.value;
  renderPalette();
});
renderPalette();
const palette = document.querySelector<HTMLElement>('.palette')!;
const positionCoach = () => document.documentElement.style.setProperty('--palette-clearance', `${innerHeight - palette.getBoundingClientRect().top + 12}px`);
new ResizeObserver(positionCoach).observe(palette);
addEventListener('resize', positionCoach);
positionCoach();

function renderInspector(id: string | null) {
  const el = document.querySelector<HTMLDivElement>('#inspector')!;
  if (!id) {
    el.classList.add('hidden-by-user');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden-by-user');

  const m = graph.modules.get(id);
  if (!m) return;
  const d = MODULES[m.type];
  const disabled = mode === 'run' ? 'disabled' : '';
  const isToggle = m.type === 'switch' || m.type === 'valve' || m.type === 'door' || m.type === 'rail-switch';
  const canElevate = d.category === 'building' || d.category === 'nature' || d.category === 'transport' || d.category === 'structure';
  const state = simulator.evaluate();
  let runtimeStatus = '';
  if (d.behavior.kind === 'vehicle') {
    const travel = vehicleCanTravel(graph, id, state.rpm);
    const rpm = state.rpm.get(id);
    runtimeStatus = travel.ready
      ? '✅ Sẵn sàng chạy · ' + Math.round(Math.abs(rpm ?? 0)) + ' rpm · ' + travel.infrastructure.message
      : '⚠️ ' + travel.message;
  } else if (d.behavior.kind === 'motor') {
    runtimeStatus = state.powered.has(id) ? '✅ Mô tơ có điện và đang tạo mô-men.' : '○ Mô tơ chưa có điện.';
  } else if (d.behavior.kind === 'pump') {
    runtimeStatus = state.rpm.has(id) && state.fluid.has(id)
      ? '✅ Bơm có cả mô-men và nước đầu hút.'
      : state.rpm.has(id)
        ? '⚠️ Bơm đang quay nhưng chưa có nước đầu hút.'
        : state.fluid.has(id)
          ? '⚠️ Có nước nhưng cánh bơm chưa quay.'
          : '○ Cần cả truyền động quay và nguồn nước.';
  } else if (d.behavior.kind === 'source') {
    runtimeStatus = '✅ Nguồn điện sẵn sàng.';
  } else if (d.behavior.kind === 'rotation-source') {
    runtimeStatus = '✅ Nguồn quay ' + Math.round(Math.abs(state.rpm.get(id) ?? d.behavior.rpm ?? 0)) + ' rpm.';
  } else if (d.behavior.kind === 'switch') {
    runtimeStatus = m.switchOn === false ? '⛔ Công tắc đang ngắt mạch.' : '✅ Công tắc đang đóng mạch.';
  } else if (
    d.behavior.kind === 'pass-rotation' ||
    d.behavior.kind === 'gear' ||
    d.behavior.kind === 'transmission' ||
    d.behavior.kind === 'rotation-output'
  ) {
    runtimeStatus = state.rpm.has(id)
      ? '✅ Đang quay ' + Math.round(Math.abs(state.rpm.get(id) ?? 0)) + ' rpm.'
      : '○ Chưa nhận chuyển động quay.';
  } else if (d.behavior.kind === 'power-output' || d.behavior.kind === 'sensor') {
    runtimeStatus = state.powered.has(id) ? '✅ Đang được cấp điện.' : '○ Chưa có điện.';
  } else if (d.behavior.kind === 'fluid-valve') {
    runtimeStatus = m.switchOn === false
      ? '⛔ Van đang đóng.'
      : state.fluid.has(id) ? '✅ Van mở và có nước đi qua.' : '○ Van mở nhưng chưa có nước đầu vào.';
  } else if (d.behavior.kind === 'fluid-pass' || d.behavior.kind === 'fluid-output') {
    runtimeStatus = state.fluid.has(id) ? '✅ Có dòng nước.' : '○ Chưa có dòng nước.';
  }


  const ports = d.ports.map(p => {
    const edge = [...graph.connections.values()].find(c =>
      (c.fromModuleId === id && c.fromPortId === p.id) || (c.toModuleId === id && c.toPortId === p.id)
    );
    const other = edge ? graph.modules.get(edge.fromModuleId === id ? edge.toModuleId : edge.fromModuleId) : undefined;
    const signalName =
      p.signal === 'power' ? 'Điện' :
      p.signal === 'rotation' ? 'Truyền động' :
      p.signal === 'fluid' ? 'Nước' : 'Khớp';
    const direction = p.direction === 'out' ? 'ra' : p.direction === 'in' ? 'vào' : 'ghép';
    return '<li class="' + (other ? 'connected' : 'disconnected') + '">' +
      '<span>' + (other ? '✓ ' : '○ ') + signalName + ' ' + direction +
      (other ? ': ' + moduleName(other) : '') + '</span>' +
      (other && mode === 'build' ? '<button class="detach-port" data-port="' + p.id + '" title="Tháo riêng khớp này">×</button>' : '') +
      '</li>';
  }).join('');

  const metrics: string[] = [];
  if (state.voltage.has(id)) metrics.push('⚡ ' + state.voltage.get(id)!.toFixed(1) + ' V');
  if (state.current.has(id)) metrics.push('🔌 ' + state.current.get(id)!.toFixed(2) + ' A');
  if (state.rpm.has(id)) metrics.push('↻ ' + Math.round(Math.abs(state.rpm.get(id)!)) + ' rpm');
  if (state.torque.has(id)) metrics.push('🔧 ' + state.torque.get(id)!.toFixed(2) + ' N·m');
  if (state.flow.has(id)) metrics.push('💧 ' + state.flow.get(id)!.toFixed(1) + ' L/min');
  if (state.pressure.has(id)) metrics.push('◉ ' + state.pressure.get(id)!.toFixed(2) + ' bar');
  const faults = state.faults.get(id) ?? [];
  const metricsHtml = engineerMode && metrics.length
    ? '<div class="engineering-metrics">' + metrics.map(x => '<span>' + x + '</span>').join('') + '</div>'
    : '';
  const faultHtml = faults.length
    ? '<div class="fault-list">' + faults.map(x => '<span>⚠️ ' + x + '</span>').join('') + '</div>'
    : '';

  const switchHint = isToggle
    ? '<div class="switch-hint">👆 Chạm 2 lần để ' +
      (m.type === 'valve' ? 'mở/đóng van.' : m.type === 'door' ? 'mở/đóng cửa.' : m.type === 'rail-switch' ? 'đổi nhánh đường ray.' : 'bật/tắt công tắc.') +
      '</div>'
    : '';

  const toggleLabel = m.type === 'valve'
    ? (m.switchOn === false ? '🟢 Mở van' : '🔴 Đóng van')
    : m.type === 'door'
      ? (m.switchOn === true ? '🚪 Đóng cửa' : '🚪 Mở cửa')
      : m.type === 'rail-switch'
        ? (m.switchOn === true ? '🔀 Chuyển về thẳng' : '🔀 Chuyển sang nhánh')
        : (m.switchOn === false ? '🟢 Bật' : '🔴 Tắt');

  const elevationButtons = canElevate
    ? '<div class="elevation-row"><button id="lowerPart" ' + disabled + '>⬇ Hạ</button><button id="raisePart" ' + disabled + '>⬆ Nâng</button></div>'
    : '';
  const terrainButtons = d.category === 'nature'
    ? '<div class="elevation-row"><button id="digPart" ' + disabled + '>⛏ Đào</button><button id="raiseTerrainPart" ' + disabled + '>⛰ Đắp</button></div>'
    : '';

  el.classList.add('compact');
  el.innerHTML =
    '<div class="inspect-title"><span>' + d.icon + '</span><div><b>' + moduleName(m) + '</b><small>' + d.description + '</small></div><button id="closeInspector" class="inspect-close" title="Đóng">×</button></div>' +
    switchHint +
    (runtimeStatus ? '<div class="runtime-status">' + runtimeStatus + '</div>' : '') +
    metricsHtml + faultHtml +
    '<div class="inspect-actions primary-actions">' +
      '<button id="rotatePart" ' + disabled + '>↻ Xoay</button>' +
      '<button id="focusPart">◎ Nhìn gần</button>' +
      (isToggle ? '<button id="toggleSwitch">' + toggleLabel + '</button>' : '') +
    '</div>' +
    '<button id="detailToggle" class="detail-toggle">ℹ Chi tiết & khớp nối</button>' +
    '<div id="inspectDetails" class="inspect-details hidden">' +
      '<p class="science">🧠 ' + d.science + '</p>' +
      '<ul class="port-status" aria-label="Trạng thái kết nối">' + (ports || '<li>Không có cổng chức năng.</li>') + '</ul>' +
      elevationButtons + terrainButtons +
      '<div class="inspect-actions"><button id="duplicatePart" ' + disabled + '>⧉ Nhân bản</button><button id="deletePart" class="danger" ' + disabled + '>🗑 Xóa</button></div>' +
    '</div>';

  document.querySelector<HTMLButtonElement>('#closeInspector')!.onclick = () => {
    workbench.clearSelection();
    el.classList.add('hidden-by-user');
  };
  document.querySelector<HTMLButtonElement>('#rotatePart')!.onclick = () => workbench.rotateSelected();
  document.querySelector<HTMLButtonElement>('#focusPart')!.onclick = () => workbench.focusSelected();
  document.querySelector<HTMLButtonElement>('#detailToggle')!.onclick = () => {
    document.querySelector<HTMLElement>('#inspectDetails')!.classList.toggle('hidden');
    el.classList.toggle('compact');
  };

  const lower = document.querySelector<HTMLButtonElement>('#lowerPart');
  const raise = document.querySelector<HTMLButtonElement>('#raisePart');
  if (lower) lower.onclick = () => workbench.elevateSelected(-.5);
  if (raise) raise.onclick = () => workbench.elevateSelected(.5);

  const duplicate = document.querySelector<HTMLButtonElement>('#duplicatePart');
  if (duplicate) duplicate.onclick = () => workbench.duplicateSelected();
  const del = document.querySelector<HTMLButtonElement>('#deletePart');
  if (del) del.onclick = () => workbench.removeSelected();

  document.querySelectorAll<HTMLButtonElement>('.detach-port').forEach(button => {
    button.onclick = () => workbench.disconnectSelectedPort(button.dataset.port!);
  });
  const dig = document.querySelector<HTMLButtonElement>('#digPart');
  const raiseTerrain = document.querySelector<HTMLButtonElement>('#raiseTerrainPart');
  if (dig) dig.onclick = () => workbench.sculptSelected(-.25);
  if (raiseTerrain) raiseTerrain.onclick = () => workbench.sculptSelected(.25);

  const sw = document.querySelector<HTMLButtonElement>('#toggleSwitch');
  if (sw) sw.onclick = () => {
    workbench.toggleSwitch();
    const current = graph.modules.get(id);
    if (!current) return;
    renderInspector(id);
    const text = current.type === 'valve'
      ? (current.switchOn === false ? 'Van đã đóng. Nước bị chặn.' : 'Van đã mở. Nước có thể đi qua.')
      : current.type === 'door'
        ? (current.switchOn === true ? 'Cửa đã mở.' : 'Cửa đã đóng.')
        : current.type === 'rail-switch'
          ? (current.switchOn === true ? 'Ghi đã chuyển sang nhánh rẽ.' : 'Ghi đang ở tuyến thẳng.')
          : (current.switchOn === false ? 'Công tắc đã tắt. Mạch điện bị ngắt.' : 'Công tắc đã bật. Nếu mạch nối đúng, điện sẽ chạy.');
    speak(text);
  };
}

function renderMission(announce = true) {
  const mission = MISSIONS[missionIndex];
  document.querySelector<HTMLElement>('#missionEmoji')!.textContent = mission.emoji;
  document.querySelector<HTMLElement>('#missionTitle')!.textContent = mission.title;
  document.querySelector<HTMLElement>('#missionDescription')!.textContent = mission.description;
  document.querySelector<HTMLElement>('#missionLesson')!.textContent = mission.lesson;
  document.querySelector<HTMLElement>('#missionCount')!.textContent = (missionIndex + 1) + ' / ' + MISSIONS.length;
  localStorage.setItem('le3d-mission', String(missionIndex));
  updateMissionHint();
  if (announce) speak(mission.title + '. ' + mission.description + ' ' + mission.lesson);
}

function updateMissionHint(state = simulator.evaluate()) {
  if (activeTutorialId) {
    const tutorial = TUTORIALS.find(t => t.id === activeTutorialId);
    if (tutorial) {
      const progress = tutorialProgress(tutorial,graph,state);
      const message = progress.done
        ? '🎓 Hoàn thành hướng dẫn ' + tutorial.title + '. Con có thể thử một cách thiết kế khác.'
        : '🎓 ' + (progress.next?.title ?? tutorial.title) + ': ' + progress.summary;
      coach.textContent = message;
      renderTutorialProgress(state);
      return { status: progress.done ? 'tutorial-complete' : 'tutorial', message };
    }
  }
  if (sandboxMode) {
    const message = '🧱 Sandbox: tự do xây, chạy thử và khám phá. Không bắt buộc theo nhiệm vụ.';
    coach.textContent = message;
    return { status: 'sandbox', message };
  }
  const feedback = getMissionFeedback(graph, MISSIONS[missionIndex], state, mode === 'run');
  coach.textContent = feedback.message;
  return feedback;
}

const missionPanel = document.querySelector<HTMLElement>('#missionPanel')!;
const missionToggle = document.querySelector<HTMLButtonElement>('#missionToggle')!;
const setMissionCollapsed = (collapsed: boolean) => {
  missionPanel.classList.toggle('collapsed', collapsed);
  missionToggle.textContent = collapsed ? '+' : '−';
  missionToggle.title = collapsed ? 'Mở nhiệm vụ' : 'Thu nhỏ nhiệm vụ';
  missionToggle.setAttribute('aria-label', missionToggle.title);
  localStorage.setItem('le3d-mission-collapsed', collapsed ? '1' : '0');
};
missionToggle.onclick = () => setMissionCollapsed(!missionPanel.classList.contains('collapsed'));
setMissionCollapsed(localStorage.getItem('le3d-mission-collapsed') === '1');

document.querySelector<HTMLButtonElement>('#prevMission')!.onclick = () => { missionIndex = (missionIndex - 1 + MISSIONS.length) % MISSIONS.length; completedMissionId = null; renderMission(true); if (mode === 'run') evaluateRun(); };
document.querySelector<HTMLButtonElement>('#nextMission')!.onclick = () => { missionIndex = (missionIndex + 1) % MISSIONS.length; completedMissionId = null; renderMission(true); if (mode === 'run') evaluateRun(); };
renderMission(false);

function evaluateRun() {
  const state = simulator.evaluate();
  workbench.setSimulation(true, state.rpm, state.active, state.fluid);
  workbench.setEnergyView(energyMode,state);
  sound.update(graph.modules.values(), state, true);
  const mission = MISSIONS[missionIndex];
  let feedback = updateMissionHint(state);

  if (feedback.status !== 'complete') {
    for (const module of graph.modules.values()) {
      if (!state.rpm.has(module.id) || MODULES[module.type].behavior.kind !== 'vehicle') continue;
      const travel = vehicleCanTravel(graph, module.id, state.rpm);
      if (!travel.ready) {
        feedback = {
          status: 'inactive',
          message: '⚠️ ' + MODULES[module.type].name + ': ' + travel.message,
        };
        coach.textContent = feedback.message;
        break;
      }
    }
  }
  if (feedback.status === 'tutorial-complete') {
    showToast('🎓 Hoàn thành hướng dẫn!');
    activeTutorialId = null;
    localStorage.removeItem('le3d-tutorial');
    renderTutorialList();
  } else if (!sandboxMode && !activeTutorialId && feedback.status === 'complete') {
    if (completedMissionId !== mission.id) {
      showToast('⭐ Nhiệm vụ hoàn thành!');
      speak(mission.success);
      progressStore.mission(mission.id);
      progressStore.concept(
        mission.id.includes('pump') || mission.id.includes('water') ? 'Nước & áp suất' :
        ['car','motorcycle','train','airplane','helicopter','boat','firetruck'].includes(mission.id) ? 'Giao thông' :
        ['house','city','landscape','bridge-world','two-storey-house','furnish-home','island-world','adventure-land'].includes(mission.id) ? 'Xây dựng & thế giới' :
        ['gear','belt','piston','conveyor','winch','fan','drill','propeller'].includes(mission.id) ? 'Cơ khí' : 'Điện',
      );
    }
    completedMissionId = mission.id;
  } else {
    if (completedMissionId !== null) { clearTimeout(toastTimer); toast.classList.add('hidden'); }
    completedMissionId = null;
  }
  updateProgress(state);
  return feedback;
}

function setMode(next: 'build' | 'run') {
  workbench.cancelInteraction();
  mode = next;
  buildBtn.classList.toggle('active', mode === 'build');
  runBtn.classList.toggle('active', mode === 'run');
  if (mode === 'run') {
    runBtn.textContent = '⏹ Dừng';
    showToast('▶ Mô phỏng đang chạy');
    const feedback = evaluateRun();
    if (feedback.status !== 'complete') speak(feedback.message);
  } else {
    runBtn.textContent = '▶ Chạy';
    completedMissionId = null;
    workbench.setSimulation(false, new Map(), new Set(), new Set());
    sound.stopAll();
    const state = simulator.evaluate();
    workbench.setEnergyView(energyMode,state);
    updateMissionHint(state);
    updateProgress(state);
  }
  renderInspector(workbench.selectedId);
}
buildBtn.onclick = () => setMode('build');
runBtn.onclick = async () => {
  if (mode !== 'run') await sound.unlock();
  setMode(mode === 'run' ? 'build' : 'run');
};

function restoreHistory(index: number) {
  if (index < 0 || index >= history.length || index === historyIndex) return;
  if (mode === 'run') setMode('build');
  restoringHistory = true;
  try {
    graph.restore(JSON.parse(history[index]));
    historyIndex = index;
    workbench.rebuildFromGraph();
    saveQuietly();
    updateMissionHint();
    updateHistoryButtons();
  } finally {
    restoringHistory = false;
  }
}

document.querySelector<HTMLButtonElement>('#undoBtn')!.onclick = () => restoreHistory(historyIndex - 1);
document.querySelector<HTMLButtonElement>('#redoBtn')!.onclick = () => restoreHistory(historyIndex + 1);
updateHistoryButtons();

document.querySelector<HTMLButtonElement>('#saveBtn')!.onclick = save;
document.querySelector<HTMLButtonElement>('#resetBtn')!.onclick = () => {
  if (mode === 'run') setMode('build');
  graph.restore({ modules: [], connections: [] });
  workbench.rebuildFromGraph();
  recordHistory();
  saveQuietly();
  coach.textContent = 'Thế giới đã được làm sạch. Con có thể bắt đầu một công trình mới!';
  showToast('🗑️ Đã làm sạch thế giới');
};

document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-camera]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  workbench.setCamera(b.dataset.camera as 'iso' | 'top' | 'front' | 'rear' | 'left' | 'right');
});
document.querySelector<HTMLButtonElement>('#focusAllBtn')!.onclick = () => workbench.focusAll();
document.querySelector<HTMLButtonElement>('#focusSelectedBtn')!.onclick = () => workbench.focusSelected();
const followCameraBtn = document.querySelector<HTMLButtonElement>('#followCameraBtn')!;
followCameraBtn.onclick = () => {
  const enabled = !workbench.isCameraFollowSelected();
  workbench.setCameraFollowSelected(enabled);
  followCameraBtn.classList.toggle('active', enabled);
  followCameraBtn.textContent = enabled ? '🎥 Đang theo' : '🎥 Theo vật';
  showToast(enabled ? '🎥 Camera sẽ theo mô-đun đang chọn' : '🎥 Đã tắt camera theo vật');
};
const cameraLockBtn = document.querySelector<HTMLButtonElement>('#cameraLockBtn')!;
cameraLockBtn.onclick = () => {
  const locked = !workbench.isCameraLocked();
  workbench.setCameraLocked(locked);
  cameraLockBtn.textContent = locked ? '🔒 Góc nhìn' : '🔓 Góc nhìn';
  cameraLockBtn.classList.toggle('active', locked);
  showToast(locked ? '🔒 Đã khóa góc nhìn' : '🔓 Có thể xoay và zoom góc nhìn');
};

const toolDrawer = document.querySelector<HTMLElement>('#toolDrawer')!;
const toolboxBtn = document.querySelector<HTMLButtonElement>('#toolboxBtn')!;
const closeToolsBtn = document.querySelector<HTMLButtonElement>('#closeTools')!;
toolboxBtn.onclick = () => toolDrawer.classList.toggle('hidden-by-user');
closeToolsBtn.onclick = () => toolDrawer.classList.add('hidden-by-user');

document.querySelectorAll<HTMLButtonElement>('[data-tool-tab]').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('[data-tool-tab]').forEach(x => x.classList.remove('active'));
    document.querySelectorAll<HTMLElement>('[data-tool-page]').forEach(x => x.classList.add('hidden'));
    button.classList.add('active');
    document.querySelector<HTMLElement>('[data-tool-page="' + button.dataset.toolTab + '"]')?.classList.remove('hidden');
    if (button.dataset.toolTab === 'projects') renderProjectList();
    if (button.dataset.toolTab === 'profile') renderProfile();
  };
});

function renderBlueprintList() {
  const host = document.querySelector<HTMLElement>('#blueprintList')!;
  host.innerHTML = '';
  for (const blueprint of BLUEPRINTS) {
    const button = document.createElement('button');
    button.className = 'blueprint-card';
    button.innerHTML = '<span>' + blueprint.icon + '</span><div><b>' + blueprint.title + '</b><small>' + blueprint.description + '</small></div>';
    button.onclick = () => {
      if (mode === 'run') setMode('build');
      const selected = workbench.selectedId ? graph.modules.get(workbench.selectedId) : undefined;
      const origin: [number,number,number] = selected
        ? [selected.position[0] + 4.5, .65, selected.position[2]]
        : [0,.65,0];
      const built = instantiateBlueprint(blueprint,origin);
      for (const module of built.modules) graph.addModule(module);
      for (const connection of built.connections) graph.connect(connection);
      workbench.rebuildFromGraph();
      recordHistory();
      saveQuietly();
      updateProgress();
      workbench.focusAll();
      showToast('📐 Đã dựng blueprint ' + blueprint.title);
      speak('Blueprint ' + blueprint.title + ' đã được đặt. Con có thể tháo, đổi hoặc mở rộng nó.');
    };
    host.appendChild(button);
  }
}
renderBlueprintList();

function renderTutorialList() {
  const host = document.querySelector<HTMLElement>('#tutorialList')!;
  host.innerHTML = '';
  for (const tutorial of TUTORIALS) {
    const b = document.createElement('button');
    b.className = 'tutorial-card' + (tutorial.id === activeTutorialId ? ' active' : '');
    b.innerHTML = '<span>' + tutorial.icon + '</span><div><b>' + tutorial.title + '</b><small>' + tutorial.steps.length + ' bước</small></div>';
    b.onclick = () => {
      activeTutorialId = activeTutorialId === tutorial.id ? null : tutorial.id;
      if (activeTutorialId) localStorage.setItem('le3d-tutorial',activeTutorialId);
      else localStorage.removeItem('le3d-tutorial');
      renderTutorialList();
      renderTutorialProgress();
      updateMissionHint();
      if (activeTutorialId) speak('Bắt đầu hướng dẫn ' + tutorial.title + '.');
    };
    host.appendChild(b);
  }
}

function renderTutorialProgress(state = simulator.evaluate()) {
  const host = document.querySelector<HTMLElement>('#tutorialProgress');
  if (!host) return;
  const tutorial = TUTORIALS.find(t => t.id === activeTutorialId);
  if (!tutorial) {
    host.innerHTML = '<p>Chọn một hướng dẫn. Game sẽ kiểm tra từng bước theo chính công trình của con.</p>';
    return;
  }
  const progress = tutorialProgress(tutorial,graph,state);
  host.innerHTML =
    '<div class="tutorial-meter"><span style="width:' + progress.percent + '%"></span></div>' +
    '<b>' + progress.completed + ' / ' + progress.total + ' bước</b>' +
    '<p>' + progress.summary + '</p>' +
    (progress.focusName ? '<small>Tiếp theo: ' + progress.focusName + '</small>' : '');
}
renderTutorialList();
renderTutorialProgress();

function renderProfile() {
  const host = document.querySelector<HTMLElement>('#profileSummary');
  if (!host) return;
  const profile = progressStore.load();
  const achievements = ACHIEVEMENTS.map(a => {
    const unlocked = Boolean(profile.achievements[a.id]);
    return '<div class="achievement ' + (unlocked ? 'unlocked' : '') + '"><span>' + a.icon + '</span><div><b>' + a.title + '</b><small>' + a.description + '</small></div><em>' + (unlocked ? '✓' : '○') + '</em></div>';
  }).join('');
  const concepts = Object.entries(profile.concepts)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,8)
    .map(([name,value]) => '<span class="concept-chip">' + name + ' · ' + value + '</span>')
    .join('');
  host.innerHTML =
    '<div class="profile-stats"><div><b>' + profile.missionsCompleted.length + '</b><small>Nhiệm vụ</small></div>' +
    '<div><b>' + profile.buildsSaved + '</b><small>Công trình</small></div>' +
    '<div><b>' + Object.keys(profile.achievements).length + '</b><small>Huy hiệu</small></div></div>' +
    '<div class="concept-list">' + concepts + '</div><div class="achievement-list">' + achievements + '</div>';
}
renderProfile();

function renderProjectList() {
  const host = document.querySelector<HTMLElement>('#projectList')!;
  const projects = projectStore.list();
  host.innerHTML = projects.length ? '' : '<p class="project-empty">Chưa có dự án đã lưu.</p>';
  for (const project of projects) {
    const card = document.createElement('div');
    card.className = 'project-card' + (project.id === projectStore.activeId() ? ' active' : '');
    const date = new Date(project.updatedAt).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    card.innerHTML =
      (project.thumbnail ? '<img src="' + project.thumbnail + '" alt="" />' : '<div class="project-thumb">🏗️</div>') +
      '<div class="project-info"><b>' + project.name + '</b><small>' + date + ' · ' + project.graph.modules.length + ' mô-đun</small></div>' +
      '<div class="project-actions"><button data-action="load">Mở</button><button data-action="copy">Bản sao</button><button data-action="delete">Xóa</button></div>';
    card.querySelector<HTMLButtonElement>('[data-action="load"]')!.onclick = () => {
      const loaded = projectStore.load(project.id);
      if (!loaded) return;
      if (mode === 'run') setMode('build');
      graph.restore(loaded.graph);
      workbench.rebuildFromGraph();
      history = [JSON.stringify(graph.serialize())];
      historyIndex = 0;
      localStorage.setItem('le3d-project-name',loaded.name);
      (document.querySelector<HTMLInputElement>('#projectName')!).value = loaded.name;
      saveQuietly();
      updateHistoryButtons();
      updateMissionHint();
      workbench.focusAll();
      renderProjectList();
      showToast('📂 Đã mở ' + loaded.name);
    };
    card.querySelector<HTMLButtonElement>('[data-action="copy"]')!.onclick = () => {
      const copy = projectStore.duplicate(project.id);
      if (copy) { showToast('📑 Đã tạo bản sao'); renderProjectList(); }
    };
    card.querySelector<HTMLButtonElement>('[data-action="delete"]')!.onclick = () => {
      projectStore.remove(project.id);
      renderProjectList();
    };
    host.appendChild(card);
  }
}

const projectNameInput = document.querySelector<HTMLInputElement>('#projectName')!;
projectNameInput.value = localStorage.getItem('le3d-project-name') ?? projectNameInput.value;
document.querySelector<HTMLButtonElement>('#saveProjectBtn')!.onclick = () => {
  const name = projectNameInput.value.trim() || 'Công trình của con';
  localStorage.setItem('le3d-project-name',name);
  let thumbnail: string | undefined;
  try { thumbnail = canvas.toDataURL('image/jpeg',.55); } catch {}
  projectStore.save(graph,name,localStorage.getItem('le3d-player-name') ?? 'Bé',undefined,thumbnail);
  progressStore.buildSaved();
  updateProgress();
  renderProjectList();
  showToast('💾 Đã lưu dự án ' + name);
};

document.querySelector<HTMLButtonElement>('#exportProjectBtn')!.onclick = async () => {
  const active = projectStore.activeId();
  if (!active) { showToast('Hãy lưu dự án trước'); return; }
  const json = projectStore.export(active);
  if (!json) return;
  try {
    await navigator.clipboard.writeText(json);
    showToast('📤 Đã sao chép JSON dự án');
  } catch {
    prompt('Sao chép JSON dự án:',json);
  }
};

document.querySelector<HTMLButtonElement>('#importProjectBtn')!.onclick = () => {
  const json = prompt('Dán JSON dự án Little Engineer 3D:');
  if (!json) return;
  try {
    const project = projectStore.import(json);
    graph.restore(project.graph);
    workbench.rebuildFromGraph();
    history = [JSON.stringify(graph.serialize())];
    historyIndex = 0;
    saveQuietly();
    renderProjectList();
    workbench.focusAll();
    showToast('📥 Đã nhập dự án');
  } catch {
    showToast('⚠️ JSON dự án không hợp lệ');
  }
};

const sandboxBtn = document.querySelector<HTMLButtonElement>('#sandboxBtn')!;
function syncSandbox() {
  missionPanel.classList.toggle('sandbox-hidden',sandboxMode);
  sandboxBtn.classList.toggle('active',sandboxMode);
  sandboxBtn.textContent = sandboxMode ? '🧱 Sandbox ✓' : '🧱 Sandbox';
  localStorage.setItem('le3d-sandbox',sandboxMode?'1':'0');
  updateMissionHint();
}
sandboxBtn.onclick = () => { sandboxMode = !sandboxMode; syncSandbox(); };
syncSandbox();

const energyBtn = document.querySelector<HTMLButtonElement>('#energyBtn')!;
const energyModes: Array<'off'|'all'|'power'|'rotation'|'fluid'> = ['off','all','power','rotation','fluid'];
const energyLabels: Record<'off'|'all'|'power'|'rotation'|'fluid',string> = {
  off:'Tắt',all:'Tất cả',power:'Điện',rotation:'Mô-men',fluid:'Nước'
};
energyBtn.onclick = () => {
  energyMode = energyModes[(energyModes.indexOf(energyMode)+1)%energyModes.length];
  workbench.setEnergyView(energyMode,simulator.evaluate());
  energyBtn.textContent = '✨ Dòng năng lượng: ' + energyLabels[energyMode];
  energyBtn.classList.toggle('active',energyMode!=='off');
};

let xrayOn = false;
const xrayBtn = document.querySelector<HTMLButtonElement>('#xrayBtn')!;
xrayBtn.onclick = () => {
  xrayOn=!xrayOn;
  workbench.setXRaySelected(xrayOn);
  xrayBtn.classList.toggle('active',xrayOn);
  xrayBtn.textContent=xrayOn?'🩻 X-ray ✓':'🩻 X-ray';
};

let explodedOn = false;
const explodeBtn = document.querySelector<HTMLButtonElement>('#explodeBtn')!;
explodeBtn.onclick = () => {
  explodedOn=!explodedOn;
  workbench.setExplodedSelected(explodedOn);
  explodeBtn.classList.toggle('active',explodedOn);
  explodeBtn.textContent=explodedOn?'💥 Cấu tạo ✓':'💥 Xem cấu tạo';
};

let nightOn = false;
const dayNightBtn = document.querySelector<HTMLButtonElement>('#dayNightBtn')!;
dayNightBtn.onclick = () => {
  nightOn=!nightOn;
  workbench.setDayPhase(nightOn?'night':'day');
  dayNightBtn.textContent=nightOn?'☀️ Ban ngày':'🌙 Ban đêm';
  dayNightBtn.classList.toggle('active',nightOn);
};

let rainOn = false;
const weatherBtn = document.querySelector<HTMLButtonElement>('#weatherBtn')!;
weatherBtn.onclick = () => {
  rainOn=!rainOn;
  workbench.setWeather(rainOn?'rain':'clear');
  weatherBtn.textContent=rainOn?'☀️ Trời quang':'🌧 Mưa';
  weatherBtn.classList.toggle('active',rainOn);
};

let performanceOn = false;
const performanceBtn = document.querySelector<HTMLButtonElement>('#performanceBtn')!;
performanceBtn.onclick = () => {
  performanceOn=!performanceOn;
  workbench.setPerformanceMode(performanceOn);
  performanceBtn.textContent=performanceOn?'⚡ iPad ✓':'⚡ Tối ưu iPad';
  performanceBtn.classList.toggle('active',performanceOn);
};

const kidModeBtn=document.querySelector<HTMLButtonElement>('#kidModeBtn')!;
const engineerModeBtn=document.querySelector<HTMLButtonElement>('#engineerModeBtn')!;
function syncLearningMode(){
  kidModeBtn.classList.toggle('active',!engineerMode);
  engineerModeBtn.classList.toggle('active',engineerMode);
  localStorage.setItem('le3d-engineer-mode',engineerMode?'1':'0');
  renderInspector(workbench.selectedId);
}
kidModeBtn.onclick=()=>{engineerMode=false;syncLearningMode();};
engineerModeBtn.onclick=()=>{engineerMode=true;syncLearningMode();};
syncLearningMode();

document.querySelector<HTMLButtonElement>('#createMakerBtn')!.onclick = () => {
  if (mode === 'run') setMode('build');
  const name = document.querySelector<HTMLInputElement>('#makerName')!.value.trim().slice(0,22) || 'Khối của con';
  const signal = document.querySelector<HTMLSelectElement>('#makerSignal')!.value;
  const type: ModuleType =
    signal==='power'?'custom-power-block':
    signal==='rotation'?'custom-rotation-block':
    signal==='fluid'?'custom-fluid-block':'custom-block';
  const color = Number.parseInt(document.querySelector<HTMLInputElement>('#makerColor')!.value.slice(1),16);
  const shape = document.querySelector<HTMLSelectElement>('#makerShape')!.value as 'box'|'cylinder';
  const size: [number,number,number] = [
    Number(document.querySelector<HTMLInputElement>('#makerX')!.value),
    Number(document.querySelector<HTMLInputElement>('#makerY')!.value),
    Number(document.querySelector<HTMLInputElement>('#makerZ')!.value),
  ];
  const instance: ModuleInstance = {
    id:type+'-'+crypto.randomUUID().slice(0,8),
    type,
    position:findFreePosition(type),
    rotationY:0,
    switchOn:type==='custom-power-block'?true:undefined,
    custom:{name,color,shape,size},
  };
  workbench.addInstance(instance,workbench.selectedId);
  showToast('🧩 Đã tạo ' + name);
  speak('Con vừa tạo mô đun ' + name + '.');
};

const speechToggle = document.createElement('button');
speechToggle.className = 'speech-toggle';
speechToggle.textContent = '🗣️';
speechToggle.title = 'Bật/tắt giọng hướng dẫn';
let speechOn = localStorage.getItem('le3d-speech') !== '0';
setSpeechEnabled(speechOn);
speechToggle.classList.toggle('muted', !speechOn);
speechToggle.onclick = () => {
  speechOn = !speechOn;
  setSpeechEnabled(speechOn);
  localStorage.setItem('le3d-speech', speechOn ? '1' : '0');
  speechToggle.classList.toggle('muted', !speechOn);
  if (speechOn) speak('Đã bật giọng hướng dẫn.');
};
document.body.appendChild(speechToggle);

const audioToggle = document.createElement('button');
audioToggle.className = 'audio-toggle';
let soundOn = localStorage.getItem('le3d-sound') !== '0';
sound.setEnabled(soundOn);
audioToggle.textContent = soundOn ? '🔉' : '🔇';
audioToggle.title = 'Bật/tắt âm thanh máy';
audioToggle.onclick = async () => {
  soundOn = !soundOn;
  sound.setEnabled(soundOn);
  localStorage.setItem('le3d-sound', soundOn ? '1' : '0');
  audioToggle.textContent = soundOn ? '🔉' : '🔇';
  if (soundOn) {
    await sound.unlock();
    if (mode === 'run') evaluateRun();
  }
};
document.body.appendChild(audioToggle);


if (new URLSearchParams(location.search).has('qa')) {
  const stateSnapshot = () => {
    const state = simulator.evaluate();
    return {
      powered: [...state.powered],
      active: [...state.active],
      rpm: Object.fromEntries(state.rpm),
      voltage: Object.fromEntries(state.voltage),
      current: Object.fromEntries(state.current),
      torque: Object.fromEntries(state.torque),
      fluid: [...state.fluid],
      flow: Object.fromEntries(state.flow),
      pressure: Object.fromEntries(state.pressure),
      faults: Object.fromEntries(state.faults),
      modules: [...graph.modules.values()],
      connections: [...graph.connections.values()],
      collisions: worldCollisionReport(graph.modules.values()),
      renderer: workbench.rendererInfo(),
    };
  };

  (window as any).__LE3D_QA__ = {
    loadGraph(data: { modules: ModuleInstance[]; connections: any[] }) {
      if (mode === 'run') setMode('build');
      graph.restore(data);
      workbench.rebuildFromGraph();
      history = [JSON.stringify(graph.serialize())];
      historyIndex = 0;
      updateHistoryButtons();
      saveQuietly();
      workbench.focusAll();
      updateProgress();
      return stateSnapshot();
    },
    reset() {
      if (mode === 'run') setMode('build');
      graph.restore({ modules: [], connections: [] });
      workbench.rebuildFromGraph();
      history = [JSON.stringify(graph.serialize())];
      historyIndex = 0;
      updateHistoryButtons();
      return stateSnapshot();
    },
    run() { setMode('run'); return stateSnapshot(); },
    stop() { setMode('build'); return stateSnapshot(); },
    state: stateSnapshot,
    select(id: string | null) { workbench.selectById(id); renderInspector(id); return stateSnapshot(); },
    snap(id: string) {
      const result = graph.snapModule(id);
      workbench.rebuildFromGraph();
      updateProgress();
      return { result, state: stateSnapshot() };
    },
    route(id: string) { return buildVehicleRoute(graph,id); },
    vehicle(id: string) { return vehicleCanTravel(graph,id,simulator.evaluate().rpm); },
    feedback(id: string) {
      const mission = MISSIONS.find(m => m.id === id);
      return mission ? getMissionFeedback(graph,mission,simulator.evaluate(),mode==='run') : null;
    },
    addBlueprint(id: string, origin: [number,number,number] = [0,.65,0]) {
      const blueprint = BLUEPRINTS.find(b => b.id === id);
      if (!blueprint) return null;
      const built = instantiateBlueprint(blueprint,origin);
      for (const module of built.modules) graph.addModule(module);
      for (const connection of built.connections) graph.connect(connection);
      workbench.rebuildFromGraph();
      recordHistory();
      updateProgress();
      workbench.focusAll();
      return stateSnapshot();
    },
    energy(value: typeof energyMode) { energyMode=value; workbench.setEnergyView(value,simulator.evaluate()); return stateSnapshot(); },
    engineer(value: boolean) { engineerMode=value; syncLearningMode(); return stateSnapshot(); },
    sandbox(value: boolean) { sandboxMode=value; syncSandbox(); return stateSnapshot(); },
    weather(value: 'clear'|'rain') { rainOn=value==='rain'; workbench.setWeather(value); return stateSnapshot(); },
    day(value: 'day'|'night') { nightOn=value==='night'; workbench.setDayPhase(value); return stateSnapshot(); },
    performance(value: boolean) { performanceOn=value; workbench.setPerformanceMode(value); return stateSnapshot(); },
    xray(value: boolean) { xrayOn=value; workbench.setXRaySelected(value); return stateSnapshot(); },
    explode(value: boolean) { explodedOn=value; workbench.setExplodedSelected(value); return stateSnapshot(); },
    rendered(id: string) { return workbench.renderedTransform(id); },
    camera(name: 'iso'|'top'|'front'|'rear'|'left'|'right') { workbench.setCamera(name); return workbench.rendererInfo(); },
    audit() {
      const state = simulator.evaluate();
      return {
        modules: graph.modules.size,
        connections: graph.connections.size,
        collisions: worldCollisionReport(graph.modules.values()).length,
        faults: [...state.faults.entries()],
        renderer: workbench.rendererInfo(),
        palette: PALETTE.length,
        missions: MISSIONS.length,
        tutorials: TUTORIALS.length,
        blueprints: BLUEPRINTS.length,
      };
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
      const registration = await navigator.serviceWorker.register('./sw.js?v=20260929-8', {
        scope: './',
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {
      // The lab still works online if service-worker registration is unavailable.
    }
  });

  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });
}
