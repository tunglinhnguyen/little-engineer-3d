import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODULES } from '../core/moduleRegistry';
import { ConnectionGraph, normalizeConnection, portsCompatible } from '../core/connectionGraph';
import type { ModuleInstance, PortDefinition } from '../core/types';
import { createModuleObject, setPortVisualsVisible } from './moduleFactory';

export interface WorkbenchHooks {
  onSelect(id: string | null): void;
  onGraphChanged(): void;
  canEdit(): boolean;
}

export class Workbench {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly root = new THREE.Group();
  readonly graph: ConnectionGraph;
  selectedId: string | null = null;
  private objects = new Map<string, THREE.Group>();
  private floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: 0xd9e5dc, roughness: .9 }));
  private ray = new THREE.Raycaster(); private pointer = new THREE.Vector2();
  private dragging = false; private dragOffset = new THREE.Vector3(); private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.65);
  private last = performance.now(); private running = false; private rpm = new Map<string, number>(); private active = new Set<string>();

  constructor(private canvas: HTMLCanvasElement, graph: ConnectionGraph, private hooks: WorkbenchHooks) {
    this.graph = graph;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); this.renderer.shadowMap.enabled = true; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0xcde8f2); this.scene.fog = new THREE.Fog(0xcde8f2, 24, 50);
    this.scene.add(this.root); this.camera.position.set(9.6, 9.2, 11.4);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.target.set(0, 0, 0); this.controls.maxPolarAngle = Math.PI * .48; this.controls.minDistance = 5; this.controls.maxDistance = 26;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8478, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 3.5); sun.position.set(-8, 13, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); this.scene.add(sun);
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = 0; this.floor.receiveShadow = true; this.scene.add(this.floor);
    const grid = new THREE.GridHelper(26, 52, 0x688b7b, 0xa7bfb1); grid.position.y = .012; this.scene.add(grid);
    this.addLabDecor(); this.bindPointer(); this.resize(); addEventListener('resize', () => this.resize()); requestAnimationFrame(t => this.loop(t));
  }

  private addLabDecor() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x23435a, roughness: .75 });
    for (const x of [-8.6, 8.6]) { const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), mat); tower.position.set(x, 1.6, -6.6); this.scene.add(tower); }
    const sign = document.createElement('canvas'); sign.width = 512; sign.height = 150; const c = sign.getContext('2d')!; c.fillStyle = '#123047'; c.fillRect(0, 0, 512, 150); c.fillStyle = '#fff'; c.font = '800 46px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('STEAM LAB 3D', 256, 75);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sign) })); sprite.position.set(0, 4.2, -7.7); sprite.scale.set(5.6, 1.65, 1); this.scene.add(sprite);
  }

  addInstance(instance: ModuleInstance) {
    this.graph.addModule(instance); const o = createModuleObject(instance); setPortVisualsVisible(o, false); this.root.add(o); this.objects.set(instance.id, o); this.select(instance.id); this.hooks.onGraphChanged();
  }

  rebuildFromGraph() {
    for (const o of this.objects.values()) this.root.remove(o); this.objects.clear();
    for (const m of this.graph.modules.values()) { const o = createModuleObject(m); setPortVisualsVisible(o, false); this.root.add(o); this.objects.set(m.id, o); }
    this.select(null);
  }

  removeSelected() { if (!this.selectedId || !this.hooks.canEdit()) return; this.graph.removeModule(this.selectedId); const o = this.objects.get(this.selectedId); if (o) this.root.remove(o); this.objects.delete(this.selectedId); this.select(null); this.hooks.onGraphChanged(); }

  rotateSelected() {
    if (!this.selectedId || !this.hooks.canEdit()) return; const m = this.graph.modules.get(this.selectedId), o = this.objects.get(this.selectedId); if (!m || !o) return;
    this.graph.disconnectModule(m.id); m.rotationY = (m.rotationY + Math.PI / 2) % (Math.PI * 2); o.rotation.y = m.rotationY; this.hooks.onGraphChanged();
  }

  toggleSwitch() {
    if (!this.selectedId) return; const m = this.graph.modules.get(this.selectedId); if (!m || m.type !== 'switch') return;
    m.switchOn = !(m.switchOn !== false); const old = this.objects.get(m.id); if (old) this.root.remove(old); const next = createModuleObject(m); setPortVisualsVisible(next, true); this.root.add(next); this.objects.set(m.id, next); this.hooks.onGraphChanged();
  }

  setSimulation(running: boolean, rpm: Map<string, number>, active: Set<string>) { this.running = running; this.rpm = rpm; this.active = active; }

  setCamera(name: 'iso' | 'top' | 'front') {
    if (name === 'top') this.camera.position.set(0, 17, .01); else if (name === 'front') this.camera.position.set(0, 7.2, 13.8); else this.camera.position.set(9.6, 9.2, 11.4); this.controls.target.set(0, 0, 0); this.controls.update();
  }

  private select(id: string | null) {
    for (const [key, o] of this.objects) { setPortVisualsVisible(o, key === id); o.traverse(x => { if ((x as THREE.Mesh).isMesh && !x.userData.isPortVisual) { const mat = (x as THREE.Mesh).material; if (mat instanceof THREE.MeshStandardMaterial) mat.emissiveIntensity = key === id ? .12 : 0; } }); }
    this.selectedId = id; this.hooks.onSelect(id);
  }

  private bindPointer() {
    this.canvas.addEventListener('pointerdown', e => {
      if (!this.hooks.canEdit()) return; const hits = this.cast(e, [...this.objects.values()]); const root = hits[0]?.object.userData.moduleRoot as THREE.Group | undefined;
      if (!root) { this.select(null); return; } this.select(root.userData.moduleId); this.dragging = true; this.controls.enabled = false; this.graph.disconnectModule(root.userData.moduleId);
      const point = new THREE.Vector3(); this.ray.ray.intersectPlane(this.dragPlane, point); this.dragOffset.copy(root.position).sub(point); this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.dragging || !this.selectedId || !this.hooks.canEdit()) return; this.updatePointer(e); const point = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.dragPlane, point)) return;
      const o = this.objects.get(this.selectedId)!; point.add(this.dragOffset); o.position.set(Math.round(point.x * 4) / 4, .65, Math.round(point.z * 4) / 4); const m = this.graph.modules.get(this.selectedId)!; m.position = [o.position.x, o.position.y, o.position.z];
    });
    this.canvas.addEventListener('pointerup', e => { if (!this.dragging) return; this.dragging = false; this.controls.enabled = true; this.trySnapSelected(); try { this.canvas.releasePointerCapture(e.pointerId); } catch {} this.hooks.onGraphChanged(); });
  }

  private cast(e: PointerEvent, objects: THREE.Object3D[]) { this.updatePointer(e); return this.ray.intersectObjects(objects, true); }
  private updatePointer(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.pointer, this.camera); }

  private worldPort(o: THREE.Group, p: PortDefinition) { return o.localToWorld(new THREE.Vector3(...p.position)); }
  private worldAxis(o: THREE.Group, p: PortDefinition) { return new THREE.Vector3(...p.axis).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion())).normalize(); }
  private trySnapSelected() {
    if (!this.selectedId) return; const moving = this.graph.modules.get(this.selectedId)!, movingObj = this.objects.get(this.selectedId)!; const def = MODULES[moving.type];
    let best: { d: number; movingPort: PortDefinition; other: ModuleInstance; otherPort: PortDefinition; delta: THREE.Vector3 } | null = null;
    for (const mp of def.ports) {
      if (this.graph.isPortUsed(moving.id, mp.id)) continue; const mpw = this.worldPort(movingObj, mp);
      for (const other of this.graph.modules.values()) { if (other.id === moving.id) continue; const otherObj = this.objects.get(other.id)!;
        for (const op of MODULES[other.type].ports) { if (this.graph.isPortUsed(other.id, op.id) || !portsCompatible(mp, op)) continue; const opw = this.worldPort(otherObj, op); const d = mpw.distanceTo(opw); const facing = this.worldAxis(movingObj, mp).dot(this.worldAxis(otherObj, op)); if (d < .72 && facing < -.6 && (!best || d < best.d)) best = { d, movingPort: mp, other, otherPort: op, delta: opw.clone().sub(mpw) }; }
      }
    }
    if (!best) return; movingObj.position.add(best.delta); moving.position = [movingObj.position.x, movingObj.position.y, movingObj.position.z]; const normalized = normalizeConnection(moving, best.movingPort, best.other, best.otherPort); if (!normalized) return;
    this.graph.connect({ id: crypto.randomUUID(), ...normalized }); this.flashSnap(best.other.id);
  }

  private flashSnap(id: string) { const o = this.objects.get(id); if (!o) return; o.scale.setScalar(1.07); setTimeout(() => o.scale.setScalar(1), 150); }

  private resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  private loop(now: number) {
    requestAnimationFrame(t => this.loop(t)); const dt = Math.min(.04, (now - this.last) / 1000); this.last = now;
    if (this.running) for (const [id, speed] of this.rpm) { const o = this.objects.get(id); if (!o) continue; let rotor: THREE.Object3D | undefined; o.traverse(child => { if (!rotor && child.userData.rotor) rotor = child; }); const angle = speed / 60 * Math.PI * 2 * dt; if (rotor) rotor.rotation.x += angle; else o.rotation.x += 0; }
    for (const [id, o] of this.objects) { const m = this.graph.modules.get(id); if (!m || m.type !== 'lamp') continue; let bulb: THREE.Mesh | undefined; o.traverse(child => { if (!bulb && child.userData.lampBulb && (child as THREE.Mesh).isMesh) bulb = child as THREE.Mesh; }); if (bulb?.material instanceof THREE.MeshStandardMaterial) { const on = this.running && this.active.has(id); bulb.material.emissive.setHex(on ? 0xffc928 : 0x000000); bulb.material.emissiveIntensity = on ? 2.8 : 0; } }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
}
