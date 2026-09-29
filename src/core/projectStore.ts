import type { ProjectSnapshot } from './types';
import type { ConnectionGraph } from './connectionGraph';

const PROJECTS_KEY = 'le3d-projects-v1';
const ACTIVE_KEY = 'le3d-active-project';

function parseProjects(): ProjectSnapshot[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeProjects(projects: ProjectSnapshot[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 24)));
}

export class ProjectStore {
  list() {
    return parseProjects().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  activeId() {
    return localStorage.getItem(ACTIVE_KEY);
  }

  setActive(id: string | null) {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  }

  save(graph: ConnectionGraph, name: string, playerName: string, id = this.activeId() ?? crypto.randomUUID(), thumbnail?: string) {
    const projects = parseProjects();
    const existing = projects.find(p => p.id === id);
    const snapshot: ProjectSnapshot = {
      id,
      name: name.trim().slice(0, 40) || 'Công trình của bé',
      updatedAt: Date.now(),
      playerName,
      graph: graph.serialize(),
      thumbnail: thumbnail ?? existing?.thumbnail,
    };
    const next = [snapshot, ...projects.filter(p => p.id !== id)];
    writeProjects(next);
    this.setActive(id);
    return snapshot;
  }

  load(id: string) {
    const snapshot = parseProjects().find(p => p.id === id) ?? null;
    if (snapshot) this.setActive(snapshot.id);
    return snapshot;
  }

  duplicate(id: string) {
    const source = this.load(id);
    if (!source) return null;
    const copy: ProjectSnapshot = {
      ...source,
      id: crypto.randomUUID(),
      name: source.name + ' – bản sao',
      updatedAt: Date.now(),
      graph: JSON.parse(JSON.stringify(source.graph)),
    };
    const projects = parseProjects();
    writeProjects([copy, ...projects]);
    this.setActive(copy.id);
    return copy;
  }

  remove(id: string) {
    writeProjects(parseProjects().filter(p => p.id !== id));
    if (this.activeId() === id) this.setActive(null);
  }

  export(id: string) {
    const project = parseProjects().find(p => p.id === id);
    return project ? JSON.stringify({ format: 'little-engineer-3d', version: 1, project }, null, 2) : null;
  }

  import(json: string) {
    const parsed = JSON.parse(json);
    const incoming = parsed?.project ?? parsed;
    if (!incoming?.graph?.modules || !incoming?.graph?.connections) throw new Error('Tệp dự án không hợp lệ');
    const project: ProjectSnapshot = {
      id: crypto.randomUUID(),
      name: String(incoming.name ?? 'Dự án nhập').slice(0, 40),
      updatedAt: Date.now(),
      playerName: String(incoming.playerName ?? 'Bé').slice(0, 18),
      graph: incoming.graph,
    };
    writeProjects([project, ...parseProjects()]);
    this.setActive(project.id);
    return project;
  }
}
