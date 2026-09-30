import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODULES } from '../core/moduleRegistry';
import { ConnectionGraph } from '../core/connectionGraph';
import { buildVehicleRoute } from '../core/worldRoutes';
import type { Connection, ModuleInstance, Vector3Tuple } from '../core/types';
import { createModuleObject, setPortVisualsVisible } from './moduleFactory';

export interface SnapPose {
  position: Vector3Tuple;
  rotationY: number;
  label?: string;
}

export interface WorkbenchHooks {
  onSelect(id: string | null): void;
  onGraphChanged(): void;
  canEdit(): boolean;
  canMove?(id: string): boolean;
  requiresHoldToMove?(id: string): boolean;
  getSnapPose?(id: string, position: Vector3Tuple): SnapPose | null;
  onDrop?(id: string, snapped: boolean): void;
  onHoldReady?(id: string): void;
  onDoubleTap?(id: string): void;
}

export class Workbench {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, .1, 120);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly graph: ConnectionGraph;
  selectedId: string | null = null;

  private root = new THREE.Group();
  private connectionLayer = new THREE.Group();
  private objects = new Map<string, THREE.Group>();
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.65);

  private dragPointerId: number | null = null;
  private dragModuleId: string | null = null;
  private dragStart = new THREE.Vector2();
  private dragOrigin = new THREE.Vector3();
  private dragOriginRotation = 0;
  private dragOffset = new THREE.Vector3();
  private dragConnections: Connection[] = [];
  private dragging = false;
  private holdRequired = false;
  private holdReady = false;
  private holdCancelled = false;
  private holdTimer = 0;
  private snapActive = false;
  private snapLabel = '';
  private lastTapAt = 0;
  private lastTapId: string | null = null;

  private running = false;
  private stopUntil = new Map<string, number>();
  private stopLatch = new Set<string>();
  private rpm = new Map<string, number>();
  private vehicleProgress = new Map<string, number>();
  private last = performance.now();

  constructor(
    private canvas: HTMLCanvasElement,
    graph: ConnectionGraph,
    private hooks: WorkbenchHooks,
  ) {
    this.graph = graph;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.scene.background = new THREE.Color(0xcfe6ef);
    this.scene.fog = new THREE.Fog(0xcfe6ef, 45, 85);
    this.scene.add(this.root);
    this.scene.add(this.connectionLayer);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.MeshStandardMaterial({ color: 0xd9e5dc, roughness: .94 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(40, 80, 0x6f8f80, 0xa9beb3);
    grid.position.y = .01;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = .28;
    this.scene.add(grid);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6d8278, 2.15));

    const sun = new THREE.DirectionalLight(0xfff7e9, 2.8);
    sun.position.set(-7, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    this.scene.add(sun);

    this.camera.position.set(11, 10, 13);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.target.set(-1.5, .25, 0);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 38;
    this.controls.maxPolarAngle = Math.PI * .49;
    this.controls.panSpeed = .72;
    this.controls.rotateSpeed = .64;
    this.controls.zoomSpeed = .8;

    this.bindPointer();
    this.resize();
    addEventListener('resize', () => this.resize());
    requestAnimationFrame(time => this.loop(time));
  }

  setPlayerName(_name: string) {}

  addInstance(instance: ModuleInstance) {
    this.graph.addModule(instance);
    const object = createModuleObject(instance);
    this.root.add(object);
    this.objects.set(instance.id, object);
    this.select(instance.id);
    this.refreshConnectionVisuals();
    this.hooks.onGraphChanged();
  }

  rebuildFromGraph() {
    this.finishDrag(true);
    for (const object of this.objects.values()) this.root.remove(object);
    this.objects.clear();

    for (const module of this.graph.modules.values()) {
      const object = createModuleObject(module);
      this.root.add(object);
      this.objects.set(module.id, object);
    }

    this.refreshConnectionVisuals();
    this.select(null);
  }

  removeSelected() {
    if (!this.selectedId || !this.hooks.canEdit()) return;
    if (this.hooks.canMove?.(this.selectedId) === false) return;

    this.finishDrag(true);
    this.graph.removeModule(this.selectedId);
    const object = this.objects.get(this.selectedId);
    if (object) this.root.remove(object);
    this.objects.delete(this.selectedId);
    this.refreshConnectionVisuals();
    this.select(null);
    this.hooks.onGraphChanged();
  }

  toggleSwitch() {
    if (!this.selectedId) return;
    const module = this.graph.modules.get(this.selectedId);
    if (!module || module.type !== 'switch') return;

    module.switchOn = module.switchOn === false;
    const oldObject = this.objects.get(module.id);
    if (oldObject) this.root.remove(oldObject);

    const nextObject = createModuleObject(module);
    this.root.add(nextObject);
    this.objects.set(module.id, nextObject);
    this.refreshPorts();
    this.refreshConnectionVisuals();
    this.hooks.onGraphChanged();
  }

  setSimulation(
    running: boolean,
    rpm: Map<string, number>,
    _active: Set<string>,
  ) {
    this.finishDrag(true);
    this.running = running;
    this.rpm = rpm;

    if (!running) {
      this.vehicleProgress.clear();
      this.stopUntil.clear();
      this.stopLatch.clear();
      for (const [id, object] of this.objects) {
        const module = this.graph.modules.get(id);
        if (!module) continue;
        object.position.set(...module.position);
        object.rotation.y = module.rotationY;
      }
    }
  }

  clearSelection() {
    this.select(null);
  }

  selectById(id: string | null) {
    if (id && !this.graph.modules.has(id)) return;
    this.select(id);
  }

  renderedTransform(id: string) {
    const object = this.objects.get(id);
    if (!object) return null;
    return {
      position: object.position.toArray() as Vector3Tuple,
      rotationY: object.rotation.y,
    };
  }

  screenPointForWorld(position: Vector3Tuple) {
    const rect = this.canvas.getBoundingClientRect();
    const point = new THREE.Vector3(...position).project(this.camera);
    return {
      x: rect.left + (point.x + 1) * .5 * rect.width,
      y: rect.top + (1 - (point.y + 1) * .5) * rect.height,
    };
  }

  screenPointForModule(id: string) {
    const object = this.objects.get(id);
    if (!object) return null;

    // Find a point that is actually visible for this module. This matters for
    // open-frame objects such as the chassis: their origin may project through
    // an empty center or behind another loose part.
    const candidates: THREE.Vector3[] = [];
    object.updateWorldMatrix(true, true);
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || child.userData.isPortVisual || !mesh.visible) return;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) return;
      const localCenter = geometry.boundingBox.getCenter(new THREE.Vector3());
      candidates.push(mesh.localToWorld(localCenter));
    });
    candidates.push(object.getWorldPosition(new THREE.Vector3()));

    const rect = this.canvas.getBoundingClientRect();
    for (const world of candidates) {
      const projected = world.clone().project(this.camera);
      const x = rect.left + (projected.x + 1) * .5 * rect.width;
      const y = rect.top + (1 - (projected.y + 1) * .5) * rect.height;
      this.pointer.set(projected.x, projected.y);
      this.ray.setFromCamera(this.pointer, this.camera);
      const hit = this.ray.intersectObjects([...this.objects.values()], true)[0];
      if (hit?.object.userData.moduleId === id) return { x, y };
    }

    return this.screenPointForWorld(object.position.toArray() as Vector3Tuple);
  }

  setCamera(name: 'iso' | 'top' | 'front' | 'rear' | 'left' | 'right') {
    const target = this.controls.target.clone();
    const distance = Math.max(10, this.camera.position.distanceTo(target));

    if (name === 'top') {
      this.camera.position.set(target.x, target.y + distance, target.z + .01);
    } else if (name === 'front') {
      this.camera.position.set(target.x, target.y + distance * .32, target.z + distance);
    } else if (name === 'rear') {
      this.camera.position.set(target.x, target.y + distance * .32, target.z - distance);
    } else if (name === 'left') {
      this.camera.position.set(target.x - distance, target.y + distance * .32, target.z);
    } else if (name === 'right') {
      this.camera.position.set(target.x + distance, target.y + distance * .32, target.z);
    } else {
      this.camera.position.set(
        target.x + distance * .66,
        target.y + distance * .58,
        target.z + distance * .78,
      );
    }

    this.camera.lookAt(target);
    this.controls.update();
  }

  focusAll() {
    if (!this.objects.size) return;

    const box = new THREE.Box3();
    for (const object of this.objects.values()) box.expandByObject(object);

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(6, size.length() * .55);

    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(radius * .7, radius * .62, radius));
    this.camera.lookAt(center);
    this.controls.update();
  }

  focusSelected() {
    if (!this.selectedId) return;
    const object = this.objects.get(this.selectedId);
    if (!object) return;

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const radius = Math.max(3.2, size * 2.2);

    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(radius * .7, radius * .55, radius));
    this.camera.lookAt(center);
    this.controls.update();
  }

  private select(id: string | null) {
    this.selectedId = id;

    for (const [moduleId, object] of this.objects) {
      object.traverse(child => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || child.userData.isPortVisual) return;
        const mat = mesh.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        mat.emissive.setHex(moduleId === id ? 0x15364a : 0x000000);
        mat.emissiveIntensity = moduleId === id ? .08 : 0;
      });
    }

    this.refreshPorts();
    this.hooks.onSelect(id);
  }

  private setSnapHighlight(id: string | null, active: boolean) {
    if (!id) return;
    const object = this.objects.get(id);
    if (!object) return;

    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || child.userData.isPortVisual) return;
      const mat = mesh.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (active) {
        mat.emissive.setHex(0x2fc978);
        mat.emissiveIntensity = .34;
      } else if (id === this.selectedId) {
        mat.emissive.setHex(0x15364a);
        mat.emissiveIntensity = .08;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    });
  }

  private refreshPorts() {
    for (const [id, object] of this.objects) {
      const module = this.graph.modules.get(id);
      if (!module) continue;

      const connected = new Set(
        MODULES[module.type].ports
          .filter(port => this.graph.isPortUsed(id, port.id))
          .map(port => port.id),
      );

      setPortVisualsVisible(object, id === this.selectedId, connected);
    }
  }

  private worldPort(module: ModuleInstance, portId: string) {
    const port = MODULES[module.type].ports.find(item => item.id === portId);
    if (!port) return null;

    const local = new THREE.Vector3(...port.position);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), module.rotationY);
    return local.add(new THREE.Vector3(...module.position));
  }

  private refreshConnectionVisuals() {
    while (this.connectionLayer.children.length) {
      const child = this.connectionLayer.children[0] as THREE.Line;
      this.connectionLayer.remove(child);
      child.geometry?.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }

    for (const connection of this.graph.connections.values()) {
      if (connection.signal === 'structural') continue;

      const from = this.graph.modules.get(connection.fromModuleId);
      const to = this.graph.modules.get(connection.toModuleId);
      if (!from || !to) continue;

      const a = this.worldPort(from, connection.fromPortId);
      const b = this.worldPort(to, connection.toPortId);
      if (!a || !b) continue;

      const midpoint = a.clone().lerp(b, .5);
      midpoint.y += .18;
      const color = connection.signal === 'power' ? 0xff5a52 : 0xffbd38;
      const curve = new THREE.QuadraticBezierCurve3(
        a.clone().add(new THREE.Vector3(0,.05,0)),
        midpoint,
        b.clone().add(new THREE.Vector3(0,.05,0)),
      );
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(18));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: .92 }),
      );
      line.userData.signal = connection.signal;
      this.connectionLayer.add(line);
    }
  }

  private beginPointerDrag(
    id: string,
    pointerId: number,
    clientX: number,
    clientY: number,
  ) {
    const root = this.objects.get(id);
    if (!root) return false;

    this.updatePointerFromCoords(clientX, clientY);
    this.dragPlane.constant = -root.position.y;
    const point = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.dragPlane, point)) return false;

    this.dragPointerId = pointerId;
    this.dragModuleId = id;
    this.dragStart.set(clientX, clientY);
    this.dragOrigin.copy(root.position);
    this.dragOriginRotation = root.rotation.y;
    this.dragOffset.copy(root.position).sub(point);
    this.dragConnections = [
      ...this.graph.incoming(id),
      ...this.graph.outgoing(id),
    ];
    this.dragging = false;
    this.snapActive = false;
    this.snapLabel = '';
    this.controls.enabled = false;
    this.canvas.setPointerCapture(pointerId);
    return true;
  }

  private bindPointer() {
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.dragPointerId !== null || this.running) return;

      const hits = this.cast(event);
      const root = hits[0]?.object.userData.moduleRoot as THREE.Group | undefined;

      if (!root) {
        this.select(null);
        return;
      }

      const id = root.userData.moduleId as string;
      this.select(id);

      if (!this.hooks.canEdit() || this.hooks.canMove?.(id) === false) return;
      if (!this.beginPointerDrag(id, event.pointerId, event.clientX, event.clientY)) return;

      this.holdRequired = this.hooks.requiresHoldToMove?.(id) === true;
      this.holdReady = !this.holdRequired;
      this.holdCancelled = false;

      if (this.holdRequired) {
        this.holdTimer = window.setTimeout(() => {
          if (this.dragPointerId !== event.pointerId || this.dragModuleId !== id) return;
          this.holdReady = true;
          this.setSnapHighlight(id, true);
          this.hooks.onHoldReady?.(id);
          try { navigator.vibrate?.(20); } catch {}
        }, 460);
      }
    });

    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== this.dragPointerId || !this.dragModuleId) return;

      const distance = this.dragStart.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY),
      );

      // A long-press must be a deliberate hold, not a slow continuation of
      // an accidental swipe. Moving before the hold threshold cancels the
      // unlock for the rest of this touch.
      if (this.holdRequired && !this.holdReady) {
        if (distance > 10) {
          clearTimeout(this.holdTimer);
          this.holdTimer = 0;
          this.holdCancelled = true;
        }
        return;
      }

      if (this.holdCancelled) return;
      if (!this.dragging && distance < 7) return;

      this.updatePointer(event);
      const point = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(this.dragPlane, point)) return;

      if (!this.dragging) {
        this.graph.disconnectModule(this.dragModuleId);
        this.dragging = true;
        this.refreshConnectionVisuals();
      }

      const object = this.objects.get(this.dragModuleId);
      const module = this.graph.modules.get(this.dragModuleId);
      if (!object || !module) return;

      point.add(this.dragOffset);
      const raw: Vector3Tuple = [
        Math.round(point.x * 8) / 8,
        this.dragOrigin.y,
        Math.round(point.z * 8) / 8,
      ];

      module.position = raw;
      const pose = this.hooks.getSnapPose?.(module.id, raw) ?? null;

      this.setSnapHighlight(module.id, false);
      if (pose) {
        module.position = [...pose.position];
        module.rotationY = pose.rotationY;
        this.snapActive = true;
        this.snapLabel = pose.label ?? '';
        this.setSnapHighlight(module.id, true);
      } else {
        this.snapActive = false;
        this.snapLabel = '';
      }

      object.position.set(...module.position);
      object.rotation.y = module.rotationY;
    });

    const end = (event: PointerEvent, cancelled: boolean) => {
      if (event.pointerId !== this.dragPointerId) return;
      this.finishDrag(cancelled);
    };

    this.canvas.addEventListener('pointerup', event => end(event, false));
    this.canvas.addEventListener('pointercancel', event => end(event, true));
    this.canvas.addEventListener('lostpointercapture', event => end(event, true));
  }

  private finishDrag(cancelled: boolean) {
    if (this.dragPointerId === null) return;

    clearTimeout(this.holdTimer);
    this.holdTimer = 0;

    const pointerId = this.dragPointerId;
    const id = this.dragModuleId;
    const changed = this.dragging;
    const snapped = this.snapActive;

    this.dragPointerId = null;
    this.dragModuleId = null;
    this.dragging = false;
    this.holdRequired = false;
    this.holdReady = false;
    this.holdCancelled = false;
    this.snapActive = false;
    this.snapLabel = '';
    this.controls.enabled = true;

    const module = id ? this.graph.modules.get(id) : undefined;
    const object = id ? this.objects.get(id) : undefined;

    if (!changed && !cancelled && id) {
      const now = performance.now();
      if (this.lastTapId === id && now - this.lastTapAt < 320) {
        this.lastTapAt = 0;
        this.lastTapId = null;
        this.hooks.onDoubleTap?.(id);
      } else {
        this.lastTapAt = now;
        this.lastTapId = id;
      }
    }

    if (changed && module && object) {
      if (cancelled) {
        module.position = this.dragOrigin.toArray() as Vector3Tuple;
        module.rotationY = this.dragOriginRotation;
        for (const connection of this.dragConnections) this.graph.connect(connection);
      } else {
        this.hooks.onDrop?.(module.id, snapped);
      }

      object.position.set(...module.position);
      object.rotation.y = module.rotationY;
    }

    if (id) this.setSnapHighlight(id, false);
    this.dragConnections = [];
    this.refreshConnectionVisuals();
    this.refreshPorts();

    if (this.canvas.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }

    if (changed) this.hooks.onGraphChanged();
  }

  private cast(event: PointerEvent) {
    this.updatePointer(event);
    return this.ray.intersectObjects([...this.objects.values()], true);
  }

  private updatePointer(event: PointerEvent) {
    this.updatePointerFromCoords(event.clientX, event.clientY);
  }

  private updatePointerFromCoords(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
  }

  private vehicleAssembly(startId: string) {
    const assembly = new Set<string>([startId]);

    // Physical attachment is independent from the energy graph. Every part
    // that is snapped into a car slot must travel with the chassis even when
    // it is passive (front axle/front wheels).
    for (const module of this.graph.modules.values()) {
      if (module.slotKey?.startsWith('car:')) assembly.add(module.id);
    }

    return assembly;
  }

  private trafficSpeedScale(position: THREE.Vector3, now: number) {
    let scale = 1;

    for (const module of this.graph.modules.values()) {
      if (
        (module.type === 'traffic-light' || module.type === 'stop-sign' || module.type === 'speed-sign') &&
        !module.slotKey?.startsWith('roadside:')
      ) continue;

      const dx = module.position[0] - position.x;
      const dz = module.position[2] - position.z;
      const d = Math.hypot(dx, dz);

      if (module.type === 'traffic-light' && d < 1.55) {
        if (module.switchOn === false) return 0;
      }

      if (module.type === 'speed-sign' && d < 2.25) {
        scale = Math.min(scale, .45);
      }

      if (module.type === 'stop-sign') {
        if (d > 1.8) {
          this.stopLatch.delete(module.id);
          this.stopUntil.delete(module.id);
          continue;
        }

        if (d < 1.12 && !this.stopLatch.has(module.id)) {
          this.stopLatch.add(module.id);
          this.stopUntil.set(module.id, now + 1500);
        }

        if (d < 1.45 && now < (this.stopUntil.get(module.id) ?? 0)) {
          return 0;
        }
      }
    }

    return scale;
  }

  private nearestRouteT(curve: THREE.CatmullRomCurve3, position: THREE.Vector3) {
    let bestT = 0;
    let bestDistance = Infinity;

    for (let index = 0; index <= 80; index++) {
      const t = index / 80;
      const distance = curve.getPointAt(t).distanceToSquared(position);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestT = t;
      }
    }

    return bestT;
  }

  private loop(now: number) {
    requestAnimationFrame(time => this.loop(time));

    const dt = Math.min(.04, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    if (this.running) {
      const pulse = .72 + Math.sin(now * .012) * .2;
      for (const child of this.connectionLayer.children) {
        const line = child as THREE.Line;
        const mat = line.material;
        if (mat instanceof THREE.LineBasicMaterial) mat.opacity = pulse;
      }

      for (const [id, speed] of this.rpm) {
        const object = this.objects.get(id);
        const module = this.graph.modules.get(id);
        if (!object || !module || module.type === 'wheel') continue;

        const angle = speed / 60 * Math.PI * 2 * dt;
        object.traverse(child => {
          if (!child.userData.rotor) return;
          const direction = Number(child.userData.rotorDirection ?? 1);
          const axis = child.userData.rotorAxis;
          if (axis === 'z') child.rotation.z += angle * direction;
          else if (axis === 'y') child.rotation.y += angle * direction;
          else child.rotation.x += angle * direction;
        });
      }

      for (const [id, speed] of this.rpm) {
        const module = this.graph.modules.get(id);
        if (!module || module.type !== 'car-base') continue;

        const route = buildVehicleRoute(this.graph, id);
        if (route.length < 2) continue;

        const curve = new THREE.CatmullRomCurve3(
          route.map(point => new THREE.Vector3(...point)),
          false,
          'centripetal',
          .5,
        );
        const length = Math.max(1, curve.getLength());

        let progress = this.vehicleProgress.get(id);
        if (progress === undefined) {
          progress = this.nearestRouteT(curve, new THREE.Vector3(...module.position));
        }

        const currentReverse = progress > 1;
        const currentT = currentReverse ? 2 - progress : progress;
        const currentPoint = curve.getPointAt(currentT);
        const trafficScale = this.trafficSpeedScale(currentPoint, now);

        const unitsPerSecond = (.8 + Math.abs(speed) / 120 * 1.25) * trafficScale;
        progress = (progress + (unitsPerSecond / length) * dt) % 2;
        this.vehicleProgress.set(id, progress);

        const reverse = progress > 1;
        const t = reverse ? 2 - progress : progress;
        const target = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        if (reverse) tangent.multiplyScalar(-1);

        const yaw = Math.atan2(-tangent.z, tangent.x);
        const assembly = this.vehicleAssembly(id);
        const base = new THREE.Vector3(...module.position);
        const deltaYaw = yaw - module.rotationY;
        const rotation = new THREE.Matrix4().makeRotationY(deltaYaw);

        for (const partId of assembly) {
          const model = this.graph.modules.get(partId);
          const object = this.objects.get(partId);
          if (!model || !object) continue;

          const offset = new THREE.Vector3(...model.position)
            .sub(base)
            .applyMatrix4(rotation);

          object.position.copy(target).add(offset);
          object.rotation.y = model.rotationY + deltaYaw;
        }

        // All four wheels roll from vehicle ground speed. The rear pair is
        // driven by the axle in the simulation; the front pair is passive.
        const wheelAngle = (unitsPerSecond / .36) * dt * (reverse ? -1 : 1);
        for (const partId of assembly) {
          const model = this.graph.modules.get(partId);
          const object = this.objects.get(partId);
          if (!model || !object || model.type !== 'wheel') continue;
          object.traverse(child => {
            if (!child.userData.rotor) return;
            child.rotation.z += wheelAngle;
          });
        }
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const width = innerWidth;
    const height = innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
