import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODULES } from '../core/moduleRegistry';
import { ConnectionGraph, modulePortsCompatible } from '../core/connectionGraph';
import { buildVehicleRoute, routeKindForVehicle } from '../core/worldRoutes';
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
  readonly connectionLayer = new THREE.Group();
  readonly graph: ConnectionGraph;
  selectedId: string | null = null;
  private objects = new Map<string, THREE.Group>();
  private floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshStandardMaterial({ color: 0xd9e5dc, roughness: .92 }));
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
  private vehicleTravel = new Map<string, number>();
  private cameraLocked = false;
  private routeGuide = new THREE.Group();

  constructor(private canvas: HTMLCanvasElement, graph: ConnectionGraph, private hooks: WorkbenchHooks) {
    this.graph = graph;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.scene.background = new THREE.Color(0xcde8f2);
    this.scene.fog = new THREE.Fog(0xcde8f2, 58, 110);
    this.camera.far = 180;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.root);
    this.scene.add(this.connectionLayer);
    this.scene.add(this.routeGuide);
    this.camera.position.set(14, 13, 17);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 62;
    this.controls.panSpeed = .8;
    this.controls.rotateSpeed = .7;
    this.controls.zoomSpeed = .8;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8478, 2.4));
    const sun = new THREE.DirectionalLight(0xfff7e9, 3.25);
    sun.position.set(-8, 13, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -.00035;
    sun.shadow.normalBias = .025;
    const shadowCamera = sun.shadow.camera as THREE.OrthographicCamera;
    shadowCamera.left = -28; shadowCamera.right = 28; shadowCamera.top = 24; shadowCamera.bottom = -24;
    shadowCamera.near = 1; shadowCamera.far = 40;
    this.scene.add(sun);
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = 0; this.floor.receiveShadow = true; this.scene.add(this.floor);
    const grid = new THREE.GridHelper(56, 112, 0x688b7b, 0xa7bfb1);
    grid.position.y = .012;
    (grid.material as THREE.Material).opacity = .4;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);
    this.addLabDecor(); this.bindPointer(); this.resize(); addEventListener('resize', () => this.resize()); requestAnimationFrame(t => this.loop(t));
  }

  private addLabDecor() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x23435a, roughness: .75 });
    for (const x of [-15, 15]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), mat);
      tower.position.set(x, 1.6, -19);
      this.scene.add(tower);
    }
    this.labSign = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    this.labSign.position.set(0, 4.2, -20);
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

  addInstance(instance: ModuleInstance, attachToId: string | null = null) {
    this.graph.addModule(instance);
    if (attachToId) this.graph.attachModuleToTarget(instance.id, attachToId);
    const o = createModuleObject(instance);
    this.root.add(o);
    this.objects.set(instance.id, o);
    this.select(instance.id);
    this.refreshConnectionVisuals();
    this.hooks.onGraphChanged();
  }

  rebuildFromGraph() {
    this.finishDrag(true);
    for (const o of this.objects.values()) this.root.remove(o); this.objects.clear();
    for (const m of this.graph.modules.values()) { const o = createModuleObject(m); this.root.add(o); this.objects.set(m.id, o); }
    this.refreshConnectionVisuals();
    this.select(null);
  }

  removeSelected() { if (!this.selectedId || !this.hooks.canEdit()) return; this.finishDrag(true); this.graph.removeModule(this.selectedId); const o = this.objects.get(this.selectedId); if (o) this.root.remove(o); this.objects.delete(this.selectedId); this.refreshConnectionVisuals(); this.select(null); this.hooks.onGraphChanged(); }

  rotateSelected() {
    if (!this.selectedId || !this.hooks.canEdit()) return; const m = this.graph.modules.get(this.selectedId), o = this.objects.get(this.selectedId); if (!m || !o) return;
    this.finishDrag(true); this.graph.disconnectModule(m.id); m.rotationY = (m.rotationY + Math.PI / 2) % (Math.PI * 2); o.rotation.y = m.rotationY;
    this.graph.snapModule(m.id); o.position.set(...m.position); this.refreshConnectionVisuals(); this.refreshPorts(); this.hooks.onGraphChanged();
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
    this.refreshConnectionVisuals();
    this.refreshPorts();
    this.hooks.onGraphChanged();
  }

  toggleSwitch() {
    if (!this.selectedId) return;
    const m = this.graph.modules.get(this.selectedId);
    if (!m || (m.type !== 'switch' && m.type !== 'valve' && m.type !== 'door')) return;
    m.switchOn = m.type === 'door' ? m.switchOn !== true : !(m.switchOn !== false);
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
    this.connectionLayer.visible = !running;
    if (!running) this.vehicleTravel.clear();
  }

  cancelInteraction() { this.finishDrag(true); }
  clearSelection() { this.select(null); }

  setCamera(name: 'iso' | 'top' | 'front' | 'rear' | 'left' | 'right') {
    const target = this.controls.target.clone();
    const distance = Math.max(12, this.camera.position.distanceTo(target));
    if (name === 'top') this.camera.position.set(target.x, target.y + distance, target.z + .01);
    else if (name === 'front') this.camera.position.set(target.x, target.y + distance * .38, target.z + distance);
    else if (name === 'rear') this.camera.position.set(target.x, target.y + distance * .38, target.z - distance);
    else if (name === 'left') this.camera.position.set(target.x - distance, target.y + distance * .38, target.z);
    else if (name === 'right') this.camera.position.set(target.x + distance, target.y + distance * .38, target.z);
    else this.camera.position.set(target.x + distance * .62, target.y + distance * .56, target.z + distance * .72);
    this.camera.lookAt(target);
    this.controls.update();
  }

  focusAll() {
    if (!this.objects.size) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(14, 13, 17);
      this.controls.update();
      return;
    }
    const box = new THREE.Box3();
    for (const object of this.objects.values()) box.expandByObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(4, size.length() * .58);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(radius * .72, radius * .65, radius));
    this.camera.lookAt(center);
    this.controls.update();
  }

  focusSelected() {
    if (!this.selectedId) return;
    const object = this.objects.get(this.selectedId);
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(2.8, box.getSize(new THREE.Vector3()).length() * 1.8);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(size * .75, size * .6, size));
    this.camera.lookAt(center);
    this.controls.update();
  }

  setCameraLocked(locked: boolean) {
    this.cameraLocked = locked;
    this.controls.enabled = !locked && this.dragPointerId === null;
  }

  isCameraLocked() { return this.cameraLocked; }

  private select(id: string | null) {
    this.selectedId = id;
    this.refreshPorts();
    this.refreshRouteGuide();
    for (const [key, o] of this.objects) {
      o.traverse(x => {
        if (x.userData.moduleLabel) x.visible = key === id;
        if (!(x as THREE.Mesh).isMesh || x.userData.isPortVisual) return;
        const mat = (x as THREE.Mesh).material;
        if (mat instanceof THREE.MeshStandardMaterial) mat.emissiveIntensity = key === id ? .12 : 0;
      });
    }
    this.hooks.onSelect(id);
  }

  private refreshConnectionVisuals() {
    while (this.connectionLayer.children.length) {
      const child = this.connectionLayer.children[0];
      this.connectionLayer.remove(child);
      child.traverse(o => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (material instanceof THREE.Material) material.dispose();
      });
    }

    const axisY = new THREE.Vector3(0, 1, 0);
    const worldPort = (module: ModuleInstance, portId: string) => {
      const port = MODULES[module.type].ports.find(p => p.id === portId);
      if (!port) return null;
      const position = new THREE.Vector3(...port.position)
        .applyAxisAngle(axisY, module.rotationY)
        .add(new THREE.Vector3(...module.position));
      const axis = new THREE.Vector3(...port.axis).applyAxisAngle(axisY, module.rotationY).normalize();
      return { position, axis };
    };

    for (const connection of this.graph.connections.values()) {
      const from = this.graph.modules.get(connection.fromModuleId);
      const to = this.graph.modules.get(connection.toModuleId);
      if (!from || !to) continue;
      const a = worldPort(from, connection.fromPortId);
      const b = worldPort(to, connection.toPortId);
      if (!a || !b) continue;

      const delta = b.position.clone().sub(a.position);
      const distance = delta.length();
      const direction = distance > .025 ? delta.normalize() : a.axis.clone();
      const length = Math.max(.13, distance + .06);
      const center = a.position.clone().add(b.position).multiplyScalar(.5);

      const color =
        connection.signal === 'power' ? 0xc9554f :
        connection.signal === 'rotation' ? 0xd7a833 :
        connection.signal === 'fluid' ? 0x269ecf : 0x75838b;
      const radius =
        connection.signal === 'structural' ? .07 :
        connection.signal === 'rotation' ? .065 :
        connection.signal === 'fluid' ? .07 : .055;

      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: connection.signal === 'power' ? .5 : .28,
        metalness: connection.signal === 'rotation' || connection.signal === 'structural' ? .48 : .16,
      });
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 14), material);
      sleeve.position.copy(center);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      sleeve.castShadow = true;
      this.connectionLayer.add(sleeve);

      const collarMaterial = material.clone();
      collarMaterial.color.offsetHSL(0, 0, .12);
      for (const sign of [-1, 1]) {
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 1.35, .035, 14), collarMaterial.clone());
        collar.position.copy(center).addScaledVector(direction, sign * length * .38);
        collar.quaternion.copy(sleeve.quaternion);
        collar.castShadow = true;
        this.connectionLayer.add(collar);
      }
    }
  }

  private refreshRouteGuide() {
    if (!this.routeGuide) return;
    while (this.routeGuide.children.length) {
      const child = this.routeGuide.children[0];
      this.routeGuide.remove(child);
      if ((child as THREE.Line).geometry) (child as THREE.Line).geometry.dispose();
      const material = (child as THREE.Line).material;
      if (material instanceof THREE.Material) material.dispose();
    }

    if (!this.selectedId) return;
    const selected = this.graph.modules.get(this.selectedId);
    if (!selected || MODULES[selected.type].behavior.kind !== 'vehicle') return;
    const route = buildVehicleRoute(this.graph, selected.id);
    if (route.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(route.map(p => new THREE.Vector3(...p)), false, 'centripetal', .5);
    const points = curve.getPoints(Math.max(24, route.length * 14)).map(p => p.add(new THREE.Vector3(0, .08, 0)));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const kind = routeKindForVehicle(selected.type);
    const material = new THREE.LineDashedMaterial({
      color: kind === 'rail' ? 0xf2bd3f : kind === 'runway' ? 0xffffff : 0x2a9ed2,
      transparent: true,
      opacity: .9,
      dashSize: .28,
      gapSize: .16,
      depthTest: true,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this.routeGuide.add(line);
  }

  private refreshPorts() {
    const selected = this.selectedId ? this.graph.modules.get(this.selectedId) : undefined;
    const selectedPorts = selected ? MODULES[selected.type].ports : [];
    for (const [id, object] of this.objects) {
      const m = this.graph.modules.get(id);
      const connected = new Set(m ? MODULES[m.type].ports.filter(p => this.graph.isPortUsed(id, p.id)).map(p => p.id) : []);
      const compatibleTarget = Boolean(
        this.dragging &&
        selected &&
        m &&
        id !== selected.id &&
        MODULES[m.type].ports.some(target => selectedPorts.some(source => modulePortsCompatible(selected.type, source, m.type, target)))
      );
      setPortVisualsVisible(object, id === this.selectedId || compatibleTarget, connected);
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
      this.dragPlane.constant = -root.position.y;
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
        this.graph.disconnectModule(this.dragModuleId); this.dragging = true; this.refreshConnectionVisuals(); this.refreshPorts();
      }
      const o = this.objects.get(this.dragModuleId)!;
      point.add(this.dragOffset);
      o.position.set(Math.round(point.x * 4) / 4, this.dragOrigin.y, Math.round(point.z * 4) / 4);
      const m = this.graph.modules.get(this.dragModuleId)!;
      m.position = [o.position.x, o.position.y, o.position.z];
      if (this.graph.magnetizeModule(m.id, .62)) {
        o.position.set(...m.position);
        o.rotation.y = m.rotationY;
      }
      this.refreshPorts();
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
    if (module?.type === 'switch' || module?.type === 'valve' || module?.type === 'door') {
      this.select(id);
      this.toggleSwitch();
    }
  }

  private finishDrag(cancelled: boolean) {
    if (this.dragPointerId === null) return;
    const pointerId = this.dragPointerId, id = this.dragModuleId, changed = this.dragging;
    this.dragPointerId = null; this.dragModuleId = null; this.dragging = false; this.controls.enabled = !this.cameraLocked;
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
    this.dragConnections = []; this.refreshConnectionVisuals(); this.refreshPorts();
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    if (changed && m) this.hooks.onGraphChanged();
  }

  private connectedComponent(startId: string) {
    const seen = new Set<string>([startId]);
    const queue = [startId];
    const trainTypes = new Set(['train-engine', 'train-wagon']);

    while (queue.length) {
      const id = queue.shift()!;
      const current = this.graph.modules.get(id);
      if (!current) continue;

      const edges = [...this.graph.incoming(id), ...this.graph.outgoing(id)];
      for (const edge of edges) {
        const otherId = edge.fromModuleId === id ? edge.toModuleId : edge.fromModuleId;
        if (seen.has(otherId)) continue;
        const other = this.graph.modules.get(otherId);
        if (!other) continue;

        const driveLink = edge.signal === 'power' || edge.signal === 'rotation';
        const trainCoupler =
          edge.signal === 'structural' &&
          trainTypes.has(current.type) &&
          trainTypes.has(other.type);
        const mountedNozzle =
          edge.signal === 'fluid' &&
          id === startId &&
          edge.fromModuleId === startId &&
          other.type === 'nozzle';

        if (!driveLink && !trainCoupler && !mountedNozzle) continue;
        seen.add(otherId);
        if (!mountedNozzle) queue.push(otherId);
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

      if (m.type === 'lamp' || m.type === 'led' || m.type === 'streetlight') {
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

      if (m.type === 'traffic-light') {
        const on = this.running && this.active.has(id);
        const phase = (now / 1000) % 10;
        const activeIndex = phase < 4 ? 0 : phase < 5.5 ? 1 : 2;
        o.traverse(child => {
          if (!child.userData.trafficLamp || !(child as THREE.Mesh).isMesh) return;
          const material = (child as THREE.Mesh).material;
          if (!(material instanceof THREE.MeshStandardMaterial)) return;
          const lit = on && child.userData.trafficIndex === activeIndex;
          material.emissive.copy(lit ? material.color : new THREE.Color(0x000000));
          material.emissiveIntensity = lit ? 2.4 : 0;
        });
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

      const machineRunning = this.running && this.rpm.has(id);
      if (m.type === 'crane' && machineRunning) {
        o.traverse(child => {
          if (child.userData.craneBoom) child.rotation.z = Math.sin(now * .0011) * .16;
          if (child.userData.craneCable) child.scale.y = 1 + (Math.sin(now * .0015) + 1) * .18;
          if (child.userData.craneHook) child.position.y = -1.02 - (Math.sin(now * .0015) + 1) * .12;
        });
      }
      if (m.type === 'excavator' && machineRunning) {
        o.traverse(child => {
          if (child.userData.excavatorArm) child.rotation.z = -.18 + Math.sin(now * .0012) * .22;
          if (child.userData.excavatorForearm) child.rotation.z = -.65 + Math.sin(now * .0016 + 1.1) * .22;
          if (child.userData.excavatorBucket) child.rotation.z = -.25 + Math.sin(now * .0018 + 2) * .3;
        });
      }
      if (m.type === 'bulldozer') {
        o.traverse(child => {
          if (child.userData.bulldozerBlade) child.position.y = -.02 + (machineRunning ? Math.sin(now * .002) * .08 : 0);
        });
      }
      if (m.type === 'firetruck') {
        o.traverse(child => {
          if (!child.userData.sirenLight || !(child as THREE.Mesh).isMesh) return;
          const material = (child as THREE.Mesh).material;
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.copy(material.color);
            material.emissiveIntensity = machineRunning ? .4 + (Math.sin(now * .018 + child.userData.sirenPhase) + 1) * 1.4 : 0;
          }
        });
      }
      if (m.type === 'boat') {
        o.traverse(child => {
          if (child.userData.boatWake) child.visible = machineRunning;
        });
      }
      if (m.type === 'waterfall') {
        o.traverse(child => {
          if (!child.userData.waterfall) return;
          const scale = .92 + (Math.sin(now * .007) + 1) * .05;
          child.scale.y = scale;
          child.position.y = .2 - (1 - scale) * .4;
        });
      }
      if (m.type === 'water-tile' || m.type === 'river-tile' || m.type === 'sea-tile') {
        o.traverse(child => {
          if (!child.userData.waterSurface) return;
          const base = child.userData.waterBaseY ?? child.position.y;
          child.userData.waterBaseY = base;
          child.position.y = base + Math.sin(now * .0025 + id.length) * .025;
          child.rotation.z = Math.sin(now * .0014 + id.length) * .008;
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

    // Vehicle motion uses real world infrastructure. Road vehicles and trains
    // follow connected road/rail pieces; airplanes follow runways. The entire
    // connected drivetrain moves and turns as one assembly.
    for (const [id, object] of this.objects) {
      const model = this.graph.modules.get(id);
      if (!model) continue;
      object.position.set(...model.position);
      object.rotation.y = model.rotationY;
    }

    if (this.running) {
      const modules = [...this.graph.modules.values()];
      const waterSurfaces = modules.filter(m => m.type === 'water-tile' || m.type === 'river-tile' || m.type === 'sea-tile');
      const helipads = modules.filter(m => m.type === 'helipad');
      const moved = new Set<string>();

      const placeAssembly = (
        vehicleId: string,
        target: THREE.Vector3,
        yaw: number,
        extraY = 0,
      ) => {
        const vehicle = this.graph.modules.get(vehicleId);
        if (!vehicle) return;
        const component = this.connectedComponent(vehicleId);
        const base = new THREE.Vector3(...vehicle.position);
        const deltaYaw = yaw - vehicle.rotationY;
        const rotation = new THREE.Matrix4().makeRotationY(deltaYaw);

        for (const partId of component) {
          if (moved.has(partId)) continue;
          const model = this.graph.modules.get(partId);
          const part = this.objects.get(partId);
          if (!model || !part) continue;
          const offset = new THREE.Vector3(...model.position).sub(base).applyMatrix4(rotation);
          part.position.copy(target).add(offset);
          part.position.y += extraY;
          part.rotation.y = model.rotationY + deltaYaw;
          moved.add(partId);
        }
      };

      for (const [vehicleId, speed] of this.rpm) {
        const vehicle = this.graph.modules.get(vehicleId);
        if (!vehicle || MODULES[vehicle.type].behavior.kind !== 'vehicle') continue;

        const travelSpeed = MODULES[vehicle.type].behavior.vehicleSpeed ?? 1;
        const routeKind = routeKindForVehicle(vehicle.type);
        const route = routeKind ? buildVehicleRoute(this.graph, vehicleId) : [];

        if (route.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(
            route.map(p => new THREE.Vector3(...p)),
            false,
            'centripetal',
            .5,
          );
          const length = Math.max(1, curve.getLength());
          const unitsPerSecond = travelSpeed * (.65 + Math.abs(speed) / 120 * 1.25);
          let previousProgress = this.vehicleTravel.get(vehicleId);
          if (previousProgress === undefined) {
            const vehiclePoint = new THREE.Vector3(...vehicle.position);
            let bestT = 0;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i <= 48; i++) {
              const t = i / 48;
              const point = curve.getPointAt(t);
              const distance = point.distanceToSquared(vehiclePoint);
              if (distance < bestDistance) {
                bestDistance = distance;
                bestT = t;
              }
            }
            const tangent = curve.getTangentAt(THREE.MathUtils.clamp(bestT, .001, .999));
            const forward = new THREE.Vector3(Math.cos(vehicle.rotationY), 0, -Math.sin(vehicle.rotationY));
            previousProgress = forward.dot(tangent) >= 0 ? bestT : 2 - bestT;
            this.vehicleTravel.set(vehicleId, previousProgress);
          }
          let progress = previousProgress + unitsPerSecond * dt / length;

          const sample = (rawProgress: number) => {
            const cycle = ((rawProgress % 2) + 2) % 2;
            const reversing = cycle > 1;
            const t = reversing ? 2 - cycle : cycle;
            const clamped = THREE.MathUtils.clamp(t, 0, 1);
            const target = curve.getPointAt(clamped);
            const tangent = curve.getTangentAt(THREE.MathUtils.clamp(clamped, .001, .999));
            if (reversing) tangent.multiplyScalar(-1);
            return { reversing, t: clamped, target, tangent };
          };

          let frame = sample(progress);

          // Powered road traffic lights are functional: road vehicles stop
          // near a red light and continue automatically on yellow/green.
          if (
            routeKind === 'road' &&
            (vehicle.type === 'car-base' || vehicle.type === 'motorcycle-base' || vehicle.type === 'firetruck')
          ) {
            const redPhase = (now / 1000) % 10 < 4;
            if (redPhase) {
              const redLightNearby = modules.some(light =>
                light.type === 'traffic-light' &&
                this.active.has(light.id) &&
                Math.hypot(
                  light.position[0] - frame.target.x,
                  light.position[2] - frame.target.z,
                ) < 1.35
              );
              if (redLightNearby) {
                progress = previousProgress;
                frame = sample(progress);
              }
            }
          }

          this.vehicleTravel.set(vehicleId, progress);
          const baseYaw = Math.atan2(-frame.tangent.z, frame.tangent.x);
          const yaw = vehicle.type === 'train-engine' ? baseYaw + Math.PI : baseYaw;
          const lift = vehicle.type === 'airplane' ? Math.sin(Math.PI * frame.t) ** 2 * 1.7 : 0;
          placeAssembly(vehicleId, frame.target, yaw, lift);

          // Wagons follow the rail path independently instead of staying rigid
          // beside the locomotive on curves.
          if (vehicle.type === 'train-engine') {
            const component = [...this.connectedComponent(vehicleId)]
              .map(id => this.graph.modules.get(id))
              .filter((m): m is ModuleInstance => Boolean(m) && m!.type === 'train-wagon');

            component.forEach((wagon, index) => {
              const gap = (index + 1) * 2.25 / length;
              const wagonProgress = frame.reversing ? progress + gap : progress - gap;
              const wagonFrame = sample(wagonProgress);
              const object = this.objects.get(wagon.id);
              if (!object) return;
              object.position.copy(wagonFrame.target);
              object.position.y = wagon.position[1];
              object.rotation.y = Math.atan2(-wagonFrame.tangent.z, wagonFrame.tangent.x) + Math.PI;
              moved.add(wagon.id);
            });
          }
          continue;
        }

        const base = new THREE.Vector3(...vehicle.position);
        const phase = now * .00075 * travelSpeed * Math.max(.55, Math.abs(speed) / 90);

        if (vehicle.type === 'helicopter' && helipads.length) {
          const pad = helipads.reduce((best, candidate) => {
            const bd = Math.hypot(best.position[0] - vehicle.position[0], best.position[2] - vehicle.position[2]);
            const cd = Math.hypot(candidate.position[0] - vehicle.position[0], candidate.position[2] - vehicle.position[2]);
            return cd < bd ? candidate : best;
          });
          const target = new THREE.Vector3(
            pad.position[0] + Math.cos(phase * .65) * .45,
            pad.position[1],
            pad.position[2] + Math.sin(phase * .65) * .45,
          );
          placeAssembly(vehicleId, target, vehicle.rotationY + Math.sin(phase * .35) * .2, 1.0 + Math.sin(phase * 1.8) * .1);
          continue;
        }

        if (vehicle.type === 'boat' && waterSurfaces.length) {
          const water = waterSurfaces.reduce((best, candidate) => {
            const bd = Math.hypot(best.position[0] - vehicle.position[0], best.position[2] - vehicle.position[2]);
            const cd = Math.hypot(candidate.position[0] - vehicle.position[0], candidate.position[2] - vehicle.position[2]);
            return cd < bd ? candidate : best;
          });
          const rx = Math.max(.7, MODULES[water.type].size[0] * .36);
          const rz = Math.max(.7, MODULES[water.type].size[2] * .36);
          const target = new THREE.Vector3(
            water.position[0] + Math.cos(phase) * rx,
            vehicle.position[1],
            water.position[2] + Math.sin(phase) * rz,
          );
          const tangent = new THREE.Vector3(-Math.sin(phase) * rx, 0, Math.cos(phase) * rz).normalize();
          const yaw = Math.atan2(-tangent.z, tangent.x);
          placeAssembly(vehicleId, target, yaw, Math.sin(phase * 3) * .04);
          continue;
        }

        // Construction vehicles can still demonstrate drive and working
        // mechanisms when there is no dedicated road network.
        if (vehicle.type === 'crane' || vehicle.type === 'excavator' || vehicle.type === 'bulldozer') {
          const distance = Math.sin(phase * .55) * .55;
          const target = base.clone().add(new THREE.Vector3(
            Math.cos(vehicle.rotationY) * distance,
            0,
            -Math.sin(vehicle.rotationY) * distance,
          ));
          placeAssembly(vehicleId, target, vehicle.rotationY);
        }
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
