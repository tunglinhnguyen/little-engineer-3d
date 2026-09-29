import './styles/app.css';
import { ConnectionGraph } from './core/connectionGraph';
import { MODULES, PALETTE } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import { getMissionFeedback, MISSIONS } from './core/missions';
import type { ModuleCategory, ModuleInstance, ModuleType } from './core/types';
import { Workbench } from './three/workbench';
import { setSpeechEnabled, speak } from './ui/speech';
import { SoundEngine } from './ui/sound';

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
    <div class="brand"><div class="brand-icon">⚙️</div><div><b id="worldTitle">Thế giới Kỹ sư 3D</b><small>Build · Invent · Explore · v0.4.0</small></div></div>
    <div class="toolbar">
      <button id="buildBtn" class="active">🔧 Lắp ráp</button><button id="runBtn">▶ Chạy</button>
      <button id="nameBtn" class="icon-btn" title="Đổi tên">👤</button>
      <button id="saveBtn" class="icon-btn" title="Lưu">💾</button><button id="resetBtn" class="icon-btn" title="Làm lại">↺</button>
    </div>
  </header>
  <aside class="mission panel" id="missionPanel">
    <div class="mission-head"><span id="missionEmoji">💡</span><div class="mission-label"><small>NHIỆM VỤ</small><b id="missionTitle"></b></div><button id="missionToggle" class="mission-toggle" aria-label="Thu nhỏ nhiệm vụ" title="Thu nhỏ nhiệm vụ">−</button></div>
    <p id="missionDescription"></p><div class="lesson" id="missionLesson"></div>
    <div class="mission-actions"><button id="prevMission">‹</button><span id="missionCount"></span><button id="nextMission">›</button></div>
  </aside>
  <aside class="inspector panel" id="inspector">
    <div class="empty">Chạm một mô-đun để xem thông tin.</div>
  </aside>
  <nav class="camera-bar panel"><button data-camera="iso" class="active">◩ Chéo</button><button data-camera="top">▦ Trên</button><button data-camera="front">▤ Trước</button></nav>
  <section class="palette panel"><div class="palette-title"><b>Kho mô-đun</b><span>${PALETTE.length} mô-đun · chọn theo nhóm</span></div><div class="category-tabs" id="categoryTabs"></div><div class="parts" id="parts"></div></section>
  <div class="coach" id="coach">Chọn một mô-đun ở kho phía dưới để bắt đầu.</div>
  <div class="toast hidden" id="toast"></div>
`;

const graph = new ConnectionGraph();
const simulator = new SimulationEngine(graph);
const sound = new SoundEngine();
let mode: 'build' | 'run' = 'build', missionIndex = Number(localStorage.getItem('le3d-mission') ?? 0) % MISSIONS.length;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const coach = document.querySelector<HTMLDivElement>('#coach')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const buildBtn = document.querySelector<HTMLButtonElement>('#buildBtn')!, runBtn = document.querySelector<HTMLButtonElement>('#runBtn')!;
let toastTimer = 0;
let completedMissionId: string | null = null;

function showToast(text: string) { toast.textContent = text; toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 2200); }
function save() { localStorage.setItem('le3d-project', JSON.stringify(graph.serialize())); localStorage.setItem('le3d-mission', String(missionIndex)); showToast('💾 Đã lưu phòng lab trên thiết bị'); }
function load() { try { const raw = localStorage.getItem('le3d-project'); if (raw) graph.restore(JSON.parse(raw)); } catch { localStorage.removeItem('le3d-project'); } }

load();
const workbench = new Workbench(canvas, graph, {
  canEdit: () => mode === 'build',
  onSelect: renderInspector,
  onGraphChanged: () => {
    saveQuietly(); renderInspector(workbench.selectedId);
    if (mode === 'run') evaluateRun(); else updateMissionHint();
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

function findFreePosition(type: ModuleType): [number, number, number] {
  const def = MODULES[type];
  const radius = Math.max(def.size[0], def.size[2]) * .5 + .22;
  const xs = [0, -1.6, 1.6, -3.2, 3.2, -4.8, 4.8, -6.4, 6.4];
  const zs = [2.8, 1.35, -.1, -1.55, -3, 4.25, -4.45];
  for (const z of zs) {
    for (const x of xs) {
      const free = [...graph.modules.values()].every(existing => {
        const other = MODULES[existing.type];
        const otherRadius = Math.max(other.size[0], other.size[2]) * .5 + .22;
        const dx = x - existing.position[0], dz = z - existing.position[2];
        return Math.hypot(dx, dz) >= radius + otherRadius;
      });
      if (free) return [x, .65, z];
    }
  }
  const n = graph.modules.size;
  return [((n % 7) - 3) * 1.65, .65, -5.8 - Math.floor(n / 7) * 1.5];
}

function addModule(type: ModuleType) {
  if (mode !== 'build') { showToast('⏹ Dừng mô phỏng trước khi thay linh kiện'); return; }
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
  const instance: ModuleInstance = {
    id,
    type,
    position: findFreePosition(type),
    rotationY: 0,
    switchOn: (type === 'switch' || type === 'valve') ? true : undefined,
  };
  workbench.addInstance(instance);
  showToast(`➕ Đã đặt ${MODULES[type].name} vào chỗ trống`);
  speak(`Đây là ${MODULES[type].name}. ${MODULES[type].description} ${MODULES[type].science}`);
}

const parts = document.querySelector<HTMLDivElement>('#parts')!;
const categoryTabs = document.querySelector<HTMLDivElement>('#categoryTabs')!;
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

function renderPalette() {
  parts.innerHTML = '';
  for (const type of PALETTE) {
    const d = MODULES[type];
    if (activeCategory !== 'all' && d.category !== activeCategory) continue;
    const b = document.createElement('button');
    b.className = 'part ' + d.category;
    b.innerHTML = '<span>' + d.icon + '</span><b>' + d.name + '</b><small>' + CATEGORY_META[d.category].label + '</small>';
    b.onclick = () => addModule(type);
    parts.appendChild(b);
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
renderPalette();
const palette = document.querySelector<HTMLElement>('.palette')!;
const positionCoach = () => document.documentElement.style.setProperty('--palette-clearance', `${innerHeight - palette.getBoundingClientRect().top + 12}px`);
new ResizeObserver(positionCoach).observe(palette);
addEventListener('resize', positionCoach);
positionCoach();

function renderInspector(id: string | null) {
  const el = document.querySelector<HTMLDivElement>('#inspector')!; if (!id) { el.innerHTML = `<div class="empty">Chạm một mô-đun để xem thông tin.</div>`; return; }
  const m = graph.modules.get(id); if (!m) return; const d = MODULES[m.type];
  const ports = d.ports.map(p => {
    const edge = [...graph.connections.values()].find(c => (c.fromModuleId === id && c.fromPortId === p.id) || (c.toModuleId === id && c.toPortId === p.id));
    const other = edge ? graph.modules.get(edge.fromModuleId === id ? edge.toModuleId : edge.fromModuleId) : undefined;
    const signalName = p.signal === 'power' ? 'Điện' : p.signal === 'rotation' ? 'Truyền động' : p.signal === 'fluid' ? 'Nước' : 'Kết cấu';
    const name = signalName + ' ' + (p.direction === 'out' ? 'ra' : p.direction === 'in' ? 'vào' : 'hai chiều');
    return `<li class="${other ? 'connected' : 'disconnected'}">${other ? '✓' : '○'} ${name}: ${other ? `đã nối ${MODULES[other.type].name}` : 'chưa nối'}</li>`;
  }).join('');
  const disabled = mode === 'run' ? 'disabled' : '';
  const isToggle = m.type === 'switch' || m.type === 'valve';
  const switchHint = isToggle ? '<div class="switch-hint">👆 Chạm 2 lần trực tiếp để ' + (m.type === 'valve' ? 'mở/đóng van.' : 'bật/tắt nhanh.') + '</div>' : '';
  const toggleLabel = m.type === 'valve'
    ? (m.switchOn === false ? '🟢 Mở van' : '🔴 Đóng van')
    : (m.switchOn === false ? '🟢 Bật công tắc' : '🔴 Tắt công tắc');
  el.innerHTML = `<div class="inspect-title"><span>${d.icon}</span><div><b>${d.name}</b><small>${d.description}</small></div></div><p class="science">🧠 ${d.science}</p>${switchHint}<ul class="port-status" aria-label="Trạng thái kết nối">${ports}</ul><div class="inspect-actions"><button id="rotatePart" ${disabled}>↻ Xoay 90°</button>${isToggle ? `<button id="toggleSwitch">${toggleLabel}</button>` : ''}<button id="deletePart" class="danger" ${disabled}>🗑 Xóa</button></div>`;
  document.querySelector<HTMLButtonElement>('#rotatePart')!.onclick = () => workbench.rotateSelected();
  document.querySelector<HTMLButtonElement>('#deletePart')!.onclick = () => workbench.removeSelected();
  const sw = document.querySelector<HTMLButtonElement>('#toggleSwitch');
  if (sw) sw.onclick = () => {
    workbench.toggleSwitch();
    const current = graph.modules.get(id);
    if (current) {
      renderInspector(id);
      const text = current.type === 'valve'
        ? (current.switchOn === false ? 'Van đã đóng. Nước bị chặn.' : 'Van đã mở. Nước có thể đi qua.')
        : (current.switchOn === false ? 'Công tắc đã tắt. Mạch điện bị ngắt.' : 'Công tắc đã bật. Nếu mạch nối đúng, điện sẽ chạy.');
      speak(text);
    }
  };
}

function renderMission(speakIt = false) {
  const m = MISSIONS[missionIndex]; document.querySelector('#missionEmoji')!.textContent = m.emoji; document.querySelector('#missionTitle')!.textContent = m.title; document.querySelector('#missionDescription')!.textContent = m.description; document.querySelector('#missionLesson')!.textContent = `🔎 ${m.lesson}`; document.querySelector('#missionCount')!.textContent = `${missionIndex + 1}/${MISSIONS.length}`; localStorage.setItem('le3d-mission', String(missionIndex)); if (speakIt) speak(`${m.title}. ${m.description}`); updateMissionHint();
}
function updateMissionHint(state = simulator.evaluate()) {
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
  sound.update(graph.modules.values(), state, true);
  const mission = MISSIONS[missionIndex], feedback = updateMissionHint(state);
  if (feedback.status === 'complete') {
    if (completedMissionId !== mission.id) { showToast('⭐ Nhiệm vụ hoàn thành!'); speak(mission.success); }
    completedMissionId = mission.id;
  } else {
    if (completedMissionId !== null) { clearTimeout(toastTimer); toast.classList.add('hidden'); }
    completedMissionId = null;
  }
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
    updateMissionHint();
  }
  renderInspector(workbench.selectedId);
}
buildBtn.onclick = () => setMode('build');
runBtn.onclick = async () => {
  if (mode !== 'run') await sound.unlock();
  setMode(mode === 'run' ? 'build' : 'run');
};

document.querySelector<HTMLButtonElement>('#saveBtn')!.onclick = save;
document.querySelector<HTMLButtonElement>('#resetBtn')!.onclick = () => { graph.restore({ modules: [], connections: [] }); workbench.rebuildFromGraph(); saveQuietly(); setMode('build'); coach.textContent = 'Thế giới đã được làm sạch. Con có thể bắt đầu một công trình mới!'; showToast('↺ Đã làm sạch bàn lắp ráp'); };

document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-camera]').forEach(x => x.classList.remove('active')); b.classList.add('active'); workbench.setCamera(b.dataset.camera as 'iso' | 'top' | 'front'); });

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


if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js?v=20260929-4', {
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
