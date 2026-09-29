import './styles/app.css';
import { ConnectionGraph } from './core/connectionGraph';
import { MODULES, PALETTE } from './core/moduleRegistry';
import { SimulationEngine } from './core/simulation';
import { getMissionFeedback, MISSIONS } from './core/missions';
import type { ModuleInstance, ModuleType } from './core/types';
import { Workbench } from './three/workbench';
import { setSpeechEnabled, speak } from './ui/speech';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="world"></canvas>
  <header class="topbar">
    <div class="brand"><div class="brand-icon">⚙️</div><div><b>Little Engineer 3D</b><small>Phòng thí nghiệm STEAM</small></div></div>
    <div class="toolbar">
      <button id="buildBtn" class="active">🔧 Lắp ráp</button><button id="runBtn">▶ Chạy</button>
      <button id="saveBtn" class="icon-btn" title="Lưu">💾</button><button id="resetBtn" class="icon-btn" title="Làm lại">↺</button>
    </div>
  </header>
  <aside class="mission panel" id="missionPanel">
    <div class="mission-head"><span id="missionEmoji">💡</span><div><small>NHIỆM VỤ</small><b id="missionTitle"></b></div></div>
    <p id="missionDescription"></p><div class="lesson" id="missionLesson"></div>
    <div class="mission-actions"><button id="prevMission">‹</button><span id="missionCount"></span><button id="nextMission">›</button></div>
  </aside>
  <aside class="inspector panel" id="inspector">
    <div class="empty">Chạm một mô-đun để xem thông tin.</div>
  </aside>
  <nav class="camera-bar panel"><button data-camera="iso" class="active">◩ Chéo</button><button data-camera="top">▦ Trên</button><button data-camera="front">▤ Trước</button></nav>
  <section class="palette panel"><div class="palette-title"><b>Kho mô-đun</b><span>Chạm để lấy linh kiện</span></div><div class="parts" id="parts"></div></section>
  <div class="coach" id="coach">Chọn một mô-đun ở kho phía dưới để bắt đầu.</div>
  <div class="toast hidden" id="toast"></div>
`;

const graph = new ConnectionGraph();
const simulator = new SimulationEngine(graph);
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

function saveQuietly() { localStorage.setItem('le3d-project', JSON.stringify(graph.serialize())); }

function addModule(type: ModuleType) {
  if (mode !== 'build') { showToast('⏹ Dừng mô phỏng trước khi thay linh kiện'); return; }
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`; const spread = (graph.modules.size % 5) - 2;
  const instance: ModuleInstance = { id, type, position: [spread * 1.1, .65, 2.8 - Math.floor(graph.modules.size / 5) * .9], rotationY: 0, switchOn: type === 'switch' ? true : undefined };
  workbench.addInstance(instance); speak(`Đây là ${MODULES[type].name}. ${MODULES[type].description}`);
}

const parts = document.querySelector<HTMLDivElement>('#parts')!;
for (const type of PALETTE) { const d = MODULES[type], b = document.createElement('button'); b.className = `part ${d.category}`; b.innerHTML = `<span>${d.icon}</span><b>${d.name}</b><small>${d.category}</small>`; b.onclick = () => addModule(type); parts.appendChild(b); }
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
    const name = `${p.signal === 'power' ? 'Điện' : 'Truyền động'} ${p.direction === 'out' ? 'ra' : 'vào'}`;
    return `<li class="${other ? 'connected' : 'disconnected'}">${other ? '✓' : '○'} ${name}: ${other ? `đã nối ${MODULES[other.type].name}` : 'chưa nối'}</li>`;
  }).join('');
  const disabled = mode === 'run' ? 'disabled' : '';
  el.innerHTML = `<div class="inspect-title"><span>${d.icon}</span><div><b>${d.name}</b><small>${d.description}</small></div></div><p class="science">🧠 ${d.science}</p><ul class="port-status" aria-label="Trạng thái kết nối">${ports}</ul><div class="inspect-actions"><button id="rotatePart" ${disabled}>↻ Xoay 90°</button>${m.type === 'switch' ? `<button id="toggleSwitch">${m.switchOn === false ? '🟢 Bật' : '🔴 Tắt'} công tắc</button>` : ''}<button id="deletePart" class="danger" ${disabled}>🗑 Xóa</button></div>`;
  document.querySelector<HTMLButtonElement>('#rotatePart')!.onclick = () => workbench.rotateSelected(); document.querySelector<HTMLButtonElement>('#deletePart')!.onclick = () => workbench.removeSelected();
  const sw = document.querySelector<HTMLButtonElement>('#toggleSwitch'); if (sw) sw.onclick = () => { workbench.toggleSwitch(); const current = graph.modules.get(id); if (current) { renderInspector(id); speak(current.switchOn === false ? 'Công tắc đã tắt. Mạch điện bị ngắt.' : 'Công tắc đã bật. Nếu mạch đã nối đúng, điện sẽ chạy.'); } };
}

function renderMission(speakIt = false) {
  const m = MISSIONS[missionIndex]; document.querySelector('#missionEmoji')!.textContent = m.emoji; document.querySelector('#missionTitle')!.textContent = m.title; document.querySelector('#missionDescription')!.textContent = m.description; document.querySelector('#missionLesson')!.textContent = `🔎 ${m.lesson}`; document.querySelector('#missionCount')!.textContent = `${missionIndex + 1}/${MISSIONS.length}`; localStorage.setItem('le3d-mission', String(missionIndex)); if (speakIt) speak(`${m.title}. ${m.description}`); updateMissionHint();
}
function updateMissionHint(state = simulator.evaluate()) {
  const feedback = getMissionFeedback(graph, MISSIONS[missionIndex], state, mode === 'run');
  coach.textContent = feedback.message;
  return feedback;
}

document.querySelector<HTMLButtonElement>('#prevMission')!.onclick = () => { missionIndex = (missionIndex - 1 + MISSIONS.length) % MISSIONS.length; completedMissionId = null; renderMission(true); if (mode === 'run') evaluateRun(); };
document.querySelector<HTMLButtonElement>('#nextMission')!.onclick = () => { missionIndex = (missionIndex + 1) % MISSIONS.length; completedMissionId = null; renderMission(true); if (mode === 'run') evaluateRun(); };
renderMission(false);

function evaluateRun() {
  const state = simulator.evaluate(); workbench.setSimulation(true, state.rpm, state.active);
  const mission = MISSIONS[missionIndex], feedback = updateMissionHint(state);
  if (feedback.status === 'complete') {
    if (completedMissionId !== mission.id) { showToast('⭐ Nhiệm vụ hoàn thành!'); speak(mission.success); }
    completedMissionId = mission.id;
  } else {
    if (completedMissionId !== null) { clearTimeout(toastTimer); toast.classList.add('hidden'); }
    completedMissionId = null;
  }
}

function setMode(next: 'build' | 'run') {
  workbench.cancelInteraction();
  mode = next; buildBtn.classList.toggle('active', mode === 'build'); runBtn.classList.toggle('active', mode === 'run');
  if (mode === 'run') { runBtn.textContent = '⏹ Dừng'; showToast('▶ Mô phỏng đang chạy'); evaluateRun(); }
  else { runBtn.textContent = '▶ Chạy'; completedMissionId = null; workbench.setSimulation(false, new Map(), new Set()); updateMissionHint(); }
  renderInspector(workbench.selectedId);
}
buildBtn.onclick = () => setMode('build'); runBtn.onclick = () => setMode(mode === 'run' ? 'build' : 'run');

document.querySelector<HTMLButtonElement>('#saveBtn')!.onclick = save;
document.querySelector<HTMLButtonElement>('#resetBtn')!.onclick = () => { graph.restore({ modules: [], connections: [] }); workbench.rebuildFromGraph(); saveQuietly(); setMode('build'); coach.textContent = 'Phòng lab đã được làm sạch. Bắt đầu một máy mới nhé!'; showToast('↺ Đã làm sạch bàn lắp ráp'); };

document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-camera]').forEach(x => x.classList.remove('active')); b.classList.add('active'); workbench.setCamera(b.dataset.camera as 'iso' | 'top' | 'front'); });

const speechToggle = document.createElement('button'); speechToggle.className = 'speech-toggle'; speechToggle.textContent = '🔊'; speechToggle.title = 'Bật/tắt hướng dẫn bằng giọng nói'; let speechOn = true; speechToggle.onclick = () => { speechOn = !speechOn; setSpeechEnabled(speechOn); speechToggle.textContent = speechOn ? '🔊' : '🔇'; }; document.body.appendChild(speechToggle);


if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}
