import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODULES } from '../core/moduleRegistry';
import { ConnectionGraph } from '../core/connectionGraph';
import type { Connection, ModuleInstance } from '../core/types';
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
  private dragPointerId: number | null = null;
  private dragModuleId: string | null = null;
  private dragStart = new THREE.Vector2(); private dragOrigin = new THREE.Vector3();
  private dragConnections: Connection[] = [];
  private lastTapId: string | null = null;
  private lastTapAt = 0;
  private lastTapPoint = new THREE.Vector2();
  private last = performance.now();
  private running = false;
  private rpm = new Map<string, number>();
  private active = new Set<string>();
  private fluid = new Set<string>();
  private labSign: THREE.Sprite | null = null;

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
    for (const x of [-8.6, 8.6]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), mat);
      tower.position.set(x, 1.6, -6.6);
      this.scene.add(tower);
    }
    this.labSign = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    this.labSign.position.set(0, 4.2, -7.7);
    this.labSign.scale.set(6.2, 1.65, 1);
    this.scene.add(this.labSign);
    this.setPlayerName('Bé');
  }

  setPlayerName(name: string) {
    if (!this.labSign) return;
    const clean = (name || 'Bé').trim().slice(0, 18);
    const sign = document.createElement('canvas');
    sign.width = 640;
    sign.height = 170;
    const ctx = sign.getContext('2d')!;
    ctx.fillStyle = '#123047';
    ctx.fillRect(0, 0, sign.width, sign.height);
    ctx.fillStyle = '#9fe9ff';
    ctx.font = '800 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('THẾ GIỚI KỸ SƯ CỦA', 320, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 58px system-ui';
    ctx.fillText(clean.toUpperCase(), 320, 115);
    const old = this.labSign.material as THREE.SpriteMaterial;
    old.map?.dispose();
    old.map = new THREE.CanvasTexture(sign);
    old.map.colorSpace = THREE.SRGBColorSpace;
    old.needsUpdate = true;
  }

  addInstance(instance: ModuleInstance) {
    this.graph.addModule(instance); const o = createModuleObject(instance); this.root.add(o); this.objects.set(instance.id, o); this.select(instance.id); this.hooks.onGraphChanged();
  }

  rebuildFromGraph() {
    this.finishDrag(true);
    for (const o of this.objects.values()) this.root.remove(o); this.objects.clear();
    for (const m of this.graph.modules.values()) { const o = createModuleObject(m); this.root.add(o); this.objects.set(m.id, o); }
    this.select(null);
  }

  removeSelected() { if (!this.selectedId || !this.hooks.canEdit()) return; this.finishDrag(true); this.graph.removeModule(this.selectedId); const o = this.objects.get(this.selectedId); if (o) this.root.remove(o); this.objects.delete(this.selectedId); this.select(null); this.hooks.onGraphChanged(); }

  rotateSelected() {
    if (!this.selectedId || !this.hooks.canEdit()) return; const m = this.graph.modules.get(this.selectedId), o = this.objects.get(this.selectedId); if (!m || !o) return;
    this.finishDrag(true); this.graph.disconnectModule(m.id); m.rotationY = (m.rotationY + Math.PI / 2) % (Math.PI * 2); o.rotation.y = m.rotationY;
    this.graph.snapModule(m.id); o.position.set(...m.position); this.refreshPorts(); this.hooks.onGraphChanged();
  }

  elevateSelected(delta: number) {
    if (!this.selectedId || !this.hooks.canEdit()) return;
    const m = this.graph.modules.get(this.selectedId), o = this.objects.get(this.selectedId);
    if (!m || !o) return;
    this.finishDrag(true);
    this.graph.disconnectModule(m.id);
    const nextY = Math.max(.15, Math.min(5.15, Math.round((m.position[1] + delta) * 4) / 4));
    m.position = [m.position[0], nextY, m.position[2]];
    o.position.set(...m.position);
    this.refreshPorts();
    this.hooks.onGraphChanged();
  }

  toggleSwitch() {
    if (!this.selectedId) return;
    const m = this.graph.modules.get(this.selectedId);
    if (!m || (m.type !== 'switch' && m.type !== 'valve')) return;
    m.switchOn = !(m.switchOn !== false);
    const old = this.objects.get(m.id);
    if (old) this.root.remove(old);
    const next = createModuleObject(m);
    this.root.add(next);
    this.objects.set(m.id, next);
    this.refreshPorts();
    this.hooks.onGraphChanged();
  }

  setSimulation(running: boolean, rpm: Map<string, number>, active: Set<string>, fluid: Set<string> = new Set()) {
    this.finishDrag(true);
    this.running = running;
    this.rpm = rpm;
    this.active = active;
    this.fluid = fluid;
  }

  cancelInteraction() { this.finishDrag(true); }

  setCamera(name: 'iso' | 'top' | 'front') {
    if (name === 'top') this.camera.position.set(0, 17, .01); else if (name === 'front') this.camera.position.set(0, 7.2, 13.8); else this.camera.position.set(9.6, 9.2, 11.4); this.controls.target.set(0, 0, 0); this.controls.update();
  }

  private select(id: string | null) {
    this.refreshPorts();
    for (const [key, o] of this.objects) { o.traverse(x => { if ((x as THREE.Mesh).isMesh && !x.userData.isPortVisual) { const mat = (x as THREE.Mesh).material; if (mat instanceof THREE.MeshStandardMaterial) mat.emissiveIntensity = key === id ? .12 : 0; } }); }
    this.selectedId = id; this.hooks.onSelect(id);
  }

  private refreshPorts() {
    for (const [id, object] of this.objects) {
      const m = this.graph.modules.get(id);
      const connected = new Set(m ? MODULES[m.type].ports.filter(p => this.graph.isPortUsed(id, p.id)).map(p => p.id) : []);
      setPortVisualsVisible(object, true, connected);
    }
  }

  private bindPointer() {
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.dragPointerId !== null) return;
      const hits = this.cast(e, [...this.objects.values()]); const root = hits[0]?.object.userData.moduleRoot as THREE.Group | undefined;
      if (!root) { this.select(null); return; }
      this.select(root.userData.moduleId);
      if (!this.hooks.canEdit()) {
        this.registerTap(root.userData.moduleId, e);
        return;
      }
      const point = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(this.dragPlane, point)) return;
      this.dragPointerId = e.pointerId; this.dragModuleId = root.userData.moduleId;
      this.dragStart.set(e.clientX, e.clientY); this.dragOrigin.copy(root.position);
      this.dragOffset.copy(root.position).sub(point); this.dragging = false; this.dragConnections = [];
      this.controls.enabled = false; this.canvas.setPointerCapture(e.pointerId);
    }, { capture: true });
    this.canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== this.dragPointerId || !this.dragModuleId || !this.hooks.canEdit()) return;
      if (!this.dragging && this.dragStart.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) < 5) return;
      this.updatePointer(e); const point = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.dragPlane, point)) return;
      if (!this.dragging) {
        this.dragConnections = [...this.graph.incoming(this.dragModuleId), ...this.graph.outgoing(this.dragModuleId)];
        this.graph.disconnectModule(this.dragModuleId); this.dragging = true; this.refreshPorts();
      }
      const o = this.objects.get(this.dragModuleId)!; point.add(this.dragOffset); o.position.set(Math.round(point.x * 4) / 4, .65, Math.round(point.z * 4) / 4); const m = this.graph.modules.get(this.dragModuleId)!; m.position = [o.position.x, o.position.y, o.position.z];
    });
    this.canvas.addEventListener('pointerup', e => {
      if (e.pointerId !== this.dragPointerId) return;
      const id = this.dragModuleId;
      const wasDragging = this.dragging;
      this.finishDrag(false);
      if (!wasDragging && id) this.registerTap(id, e);
    });
    this.canvas.addEventListener('pointercancel', e => { if (e.pointerId === this.dragPointerId) this.finishDrag(true); });
    this.canvas.addEventListener('lostpointercapture', e => { if (e.pointerId === this.dragPointerId) this.finishDrag(true); });
  }

  private registerTap(id: string, e: PointerEvent) {
    if (!this.lastTapPoint) this.lastTapPoint = new THREE.Vector2();
    const now = performance.now();
    const point = new THREE.Vector2(e.clientX, e.clientY);
    const isDouble = this.lastTapId === id && now - this.lastTapAt < 380 && point.distanceTo(this.lastTapPoint) < 28;
    this.lastTapId = id;
    this.lastTapAt = now;
    this.lastTapPoint.copy(point);
    if (!isDouble) return;
    this.lastTapId = null;
    const module = this.graph.modules.get(id);
    if (module?.type === 'switch' || module?.type === 'valve') {
      this.select(id);
      this.toggleSwitch();
    }
  }

  private finishDrag(cancelled: boolean) {
    if (this.dragPointerId === null) return;
    const pointerId = this.dragPointerId, id = this.dragModuleId, changed = this.dragging;
    this.dragPointerId = null; this.dragModuleId = null; this.dragging = false; this.controls.enabled = true;
    const m = id ? this.graph.modules.get(id) : undefined, o = id ? this.objects.get(id) : undefined;
    if (changed && m && o) {
      if (cancelled) {
        m.position = this.dragOrigin.toArray();
        for (const c of this.dragConnections) {
          if (this.graph.modules.has(c.fromModuleId) && this.graph.modules.has(c.toModuleId)) this.graph.connect(c);
        }
      } else this.graph.snapModule(m.id);
      o.position.set(...m.position);
    }
    this.dragConnections = []; this.refreshPorts();
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    if (changed && m) this.hooks.onGraphChanged();
  }

  private connectedComponent(startId: string) {
    const seen = new Set<string>([startId]);
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift()!;
      const edges = [...this.graph.incoming(id), ...this.graph.outgoing(id)];
      for (const edge of edges) {
        const other = edge.fromModuleId === id ? edge.toModuleId : edge.fromModuleId;
        if (seen.has(other)) continue;
        seen.add(other);
        queue.push(other);
      }
    }
    return seen;
  }

  private cast(e: PointerEvent, objects: THREE.Object3D[]) { this.updatePointer(e); return this.ray.intersectObjects(objects, true); }
  private updatePointer(e: PointerEvent) { const r = this.canvas.getBoundingClientRect(); this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); this.ray.setFromCamera(this.pointer, this.camera); }

  private resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  private loop(now: number) {
    requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(.04, (now - this.last) / 1000);
    this.last = now;

    if (this.running) {
      for (const [id, speed] of this.rpm) {
        const o = this.objects.get(id);
        if (!o) continue;
        const angle = speed / 60 * Math.PI * 2 * dt;
        const rotors: THREE.Object3D[] = [];
        o.traverse(child => { if (child.userData.rotor) rotors.push(child); });
        for (const rotor of rotors) {
          const amount = angle * (rotor.userData.rotorFactor ?? 1);
          if (rotor.userData.rotorAxis === 'z') rotor.rotation.z += amount;
          else if (rotor.userData.rotorAxis === 'y') rotor.rotation.y += amount;
          else rotor.rotation.x += amount;
        }

        const phase = now / 1000 * Math.max(.8, Math.abs(speed) / 60) * Math.PI * 2;
        o.traverse(child => {
          if (child.userData.pistonRod) {
            child.position.x = child.userData.pistonBaseX + Math.sin(phase) * .28;
          }
          if (child.userData.conveyorSlat) {
            const base = child.userData.conveyorBaseX as number;
            const travel = (now / 1000 * Math.sign(speed || 1) * Math.max(.12, Math.abs(speed) / 250)) % 1.8;
            let x = base + travel;
            while (x > .9) x -= 1.8;
            while (x < -.9) x += 1.8;
            child.position.x = x;
          }
        });
      }
    }

    for (const [id, o] of this.objects) {
      const m = this.graph.modules.get(id);
      if (!m) continue;

      if (m.type === 'lamp' || m.type === 'led') {
        let bulb: THREE.Mesh | undefined;
        o.traverse(child => {
          if (!bulb && child.userData.lampBulb && (child as THREE.Mesh).isMesh) bulb = child as THREE.Mesh;
        });
        if (bulb?.material instanceof THREE.MeshStandardMaterial) {
          const on = this.running && this.active.has(id);
          bulb.material.emissive.setHex(on ? (m.type === 'led' ? 0x35ff73 : 0xffc928) : 0x000000);
          bulb.material.emissiveIntensity = on ? 2.8 : 0;
        }
      }

      if (m.type === 'buzzer') {
        let cap: THREE.Object3D | undefined;
        o.traverse(child => { if (!cap && child.userData.buzzerCap) cap = child; });
        if (cap) {
          const on = this.running && this.active.has(id);
          const pulse = on ? 1 + Math.sin(now * .045) * .06 : 1;
          cap.scale.set(pulse, 1, pulse);
        }
      }

      if (o.userData.vehicle) {
        const moving = this.running && this.rpm.has(id);
        const bounce = moving ? Math.sin(now * .012) * .018 : 0;
        o.traverse(child => {
          if (child.userData.vehicleBody) child.position.y += bounce - (child.userData.lastVehicleBounce ?? 0);
          if (child.userData.speedEffect) child.visible = moving;
          child.userData.lastVehicleBounce = child.userData.vehicleBody ? bounce : child.userData.lastVehicleBounce;
        });
      }

      if (m.type === 'cloud') {
        const drift = Math.sin(now * .00035 + id.length) * .12;
        o.traverse(child => {
          if (!child.userData.cloudPuff) return;
          const base = child.userData.cloudBaseX ?? child.position.x;
          child.userData.cloudBaseX = base;
          child.position.x = base + drift;
        });
      }

      let waterFx: THREE.Object3D | undefined;
      o.traverse(child => { if (!waterFx && child.userData.waterEffect) waterFx = child; });
      if (waterFx) {
        const flowing = this.running && this.fluid.has(id);
        waterFx.visible = flowing;
        if (flowing) {
          waterFx.children.forEach((drop, index) => {
            const cycle = ((now * .0012 + index / 12) % 1);
            drop.position.z = .5 + cycle * 1.75;
            drop.position.y = -.18 * cycle * cycle + ((index % 2) ? .04 : -.04);
          });
        }
      }

      if (m.type === 'pipe') {
        o.traverse(child => {
          if (!child.userData.fluidGlow || !(child as THREE.Mesh).isMesh) return;
          const mat = (child as THREE.Mesh).material;
          if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = this.running && this.fluid.has(id) ? .72 : .2;
        });
      }

      if (m.type === 'water-tank') {
        o.traverse(child => {
          if (!child.userData.waterSurface) return;
          child.position.y = -.15 + Math.sin(now * .003) * .015;
        });
      }
    }

    // Vehicle travel preview: move the whole connected machine together so
    // batteries/motors/gearboxes do not visually detach from the vehicle.
    for (const [id, object] of this.objects) {
      const model = this.graph.modules.get(id);
      if (model) object.position.set(...model.position);
    }
    if (this.running) {
      const hasRoad = [...this.graph.modules.values()].some(m => m.type === 'road-straight' || m.type === 'road-curve' || m.type === 'bridge');
      const hasRail = [...this.graph.modules.values()].some(m => m.type === 'rail-straight' || m.type === 'rail-curve' || m.type === 'rail-crossing');
      const moved = new Set<string>();

      for (const [vehicleId, speed] of this.rpm) {
        const vehicle = this.graph.modules.get(vehicleId);
        if (!vehicle || MODULES[vehicle.type].behavior.kind !== 'vehicle') continue;
        if ((vehicle.type === 'train-engine' && !hasRail) ||
            ((vehicle.type === 'car-base' || vehicle.type === 'motorcycle-base') && !hasRoad)) continue;

        const component = this.connectedComponent(vehicleId);
        const travelSpeed = MODULES[vehicle.type].behavior.vehicleSpeed ?? 1;
        const distance = Math.sin(now * .00075 * travelSpeed * Math.max(.55, Math.abs(speed) / 90)) * 1.35;
        const dx = Math.cos(vehicle.rotationY) * distance;
        const dz = -Math.sin(vehicle.rotationY) * distance;

        for (const partId of component) {
          if (moved.has(partId)) continue;
          const model = this.graph.modules.get(partId);
          const part = this.objects.get(partId);
          if (!model || !part) continue;
          part.position.set(model.position[0] + dx, model.position[1], model.position[2] + dz);
          moved.add(partId);
        }
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
