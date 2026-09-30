import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MODULES } from '../core/moduleRegistry';
import { ConnectionGraph } from '../core/connectionGraph';
import { buildVehicleRoute } from '../core/worldRoutes';
import type { Connection, ModuleInstance } from '../core/types';
import { createModuleObject, setPortVisualsVisible } from './moduleFactory';

export interface WorkbenchHooks {
  onSelect(id: string | null): void;
  onGraphChanged(): void;
  canEdit(): boolean;
  canMove?(id: string): boolean;
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
  private dragOffset = new THREE.Vector3();
  private dragConnections: Connection[] = [];
  private dragging = false;
  private running = false;
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
    gridMaterial.opacity = .32;
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

  setPlayerName(_name: string) {
    // The focused car lab does not render a separate world sign.
  }

  addInstance(instance: ModuleInstance, attachToId: string | null = null) {
    this.graph.addModule(instance);
    if (attachToId) this.graph.attachModuleToTarget(instance.id, attachToId);

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

  snapSelected() {
    if (!this.selectedId || !this.hooks.canEdit()) return false;
    if (this.hooks.canMove?.(this.selectedId) === false) return false;

    const module = this.graph.modules.get(this.selectedId);
    const object = this.objects.get(this.selectedId);
    if (!module || !object) return false;

    const joined = this.graph.snapModule(module.id);
    object.position.set(...module.position);
    object.rotation.y = module.rotationY;
    this.refreshConnectionVisuals();
    this.refreshPorts();

    if (joined) this.hooks.onGraphChanged();
    return joined;
  }

  detachSelected() {
    if (!this.selectedId || !this.hooks.canEdit()) return false;
    if (this.hooks.canMove?.(this.selectedId) === false) return false;

    const count =
      this.graph.incoming(this.selectedId).length +
      this.graph.outgoing(this.selectedId).length;

    if (!count) return false;
    this.graph.disconnectModule(this.selectedId);
    this.refreshConnectionVisuals();
    this.refreshPorts();
    this.hooks.onGraphChanged();
    return true;
  }

  rotateSelected() {
    if (!this.selectedId || !this.hooks.canEdit()) return;
    if (this.hooks.canMove?.(this.selectedId) === false) return;

    const module = this.graph.modules.get(this.selectedId);
    const object = this.objects.get(this.selectedId);
    if (!module || !object) return;

    this.graph.disconnectModule(module.id);
    module.rotationY = (module.rotationY + Math.PI / 2) % (Math.PI * 2);
    object.rotation.y = module.rotationY;
    this.graph.snapModule(module.id);
    object.position.set(...module.position);
    object.rotation.y = module.rotationY;
    this.refreshConnectionVisuals();
    this.refreshPorts();
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
    _legacyFluid: Set<string> = new Set(),
  ) {
    this.finishDrag(true);
    this.running = running;
    this.rpm = rpm;
    this.connectionLayer.visible = !running;

    if (!running) {
      this.vehicleProgress.clear();
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
      position: object.position.toArray() as [number, number, number],
      rotationY: object.rotation.y,
    };
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
      this.camera.position.set(target.x + distance * .66, target.y + distance * .58, target.z + distance * .78);
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

      const color = connection.signal === 'power' ? 0xff5a52 : 0xffbd38;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        a.clone().add(new THREE.Vector3(0,.05,0)),
        b.clone().add(new THREE.Vector3(0,.05,0)),
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: .9 }),
      );
      this.connectionLayer.add(line);
    }
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

      this.dragPlane.constant = -root.position.y;
      const point = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(this.dragPlane, point)) return;

      this.dragPointerId = event.pointerId;
      this.dragModuleId = id;
      this.dragStart.set(event.clientX, event.clientY);
      this.dragOrigin.copy(root.position);
      this.dragOffset.copy(root.position).sub(point);
      this.dragConnections = [];
      this.dragging = false;
      this.controls.enabled = false;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== this.dragPointerId || !this.dragModuleId) return;

      if (
        !this.dragging &&
        this.dragStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 6
      ) return;

      this.updatePointer(event);
      const point = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(this.dragPlane, point)) return;

      if (!this.dragging) {
        this.dragConnections = [
          ...this.graph.incoming(this.dragModuleId),
          ...this.graph.outgoing(this.dragModuleId),
        ];
        this.graph.disconnectModule(this.dragModuleId);
        this.dragging = true;
        this.refreshConnectionVisuals();
      }

      const object = this.objects.get(this.dragModuleId);
      const module = this.graph.modules.get(this.dragModuleId);
      if (!object || !module) return;

      point.add(this.dragOffset);
      const x = Math.round(point.x * 4) / 4;
      const z = Math.round(point.z * 4) / 4;
      object.position.set(x, this.dragOrigin.y, z);
      module.position = [x, this.dragOrigin.y, z];
    });

    this.canvas.addEventListener('pointerup', event => {
      if (event.pointerId !== this.dragPointerId) return;
      this.finishDrag(false);
    });

    this.canvas.addEventListener('pointercancel', event => {
      if (event.pointerId === this.dragPointerId) this.finishDrag(true);
    });

    this.canvas.addEventListener('lostpointercapture', event => {
      if (event.pointerId === this.dragPointerId) this.finishDrag(true);
    });
  }

  private finishDrag(cancelled: boolean) {
    if (this.dragPointerId === null) return;

    const pointerId = this.dragPointerId;
    const id = this.dragModuleId;
    const changed = this.dragging;

    this.dragPointerId = null;
    this.dragModuleId = null;
    this.dragging = false;
    this.controls.enabled = true;

    const module = id ? this.graph.modules.get(id) : undefined;
    const object = id ? this.objects.get(id) : undefined;

    if (changed && module && object) {
      if (cancelled) {
        module.position = this.dragOrigin.toArray() as [number, number, number];
        for (const connection of this.dragConnections) this.graph.connect(connection);
      } else {
        this.graph.snapModule(module.id);
      }

      object.position.set(...module.position);
      object.rotation.y = module.rotationY;
    }

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
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
  }

  private nearestRouteT(curve: THREE.CatmullRomCurve3, position: THREE.Vector3) {
    let bestT = 0;
    let bestDistance = Infinity;
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
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
      for (const [id, speed] of this.rpm) {
        const object = this.objects.get(id);
        if (!object) continue;

        const angle = speed / 60 * Math.PI * 2 * dt;
        object.traverse(child => {
          if (!child.userData.rotor) return;
          const axis = child.userData.rotorAxis;
          if (axis === 'z') child.rotation.z += angle;
          else if (axis === 'y') child.rotation.y += angle;
          else child.rotation.x += angle;
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

        const unitsPerSecond = .8 + Math.abs(speed) / 120 * 1.25;
        progress = (progress + (unitsPerSecond / length) * dt) % 2;
        this.vehicleProgress.set(id, progress);

        const reverse = progress > 1;
        const t = reverse ? 2 - progress : progress;
        const target = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        if (reverse) tangent.multiplyScalar(-1);

        const yaw = Math.atan2(-tangent.z, tangent.x);
        const object = this.objects.get(id);
        if (!object) continue;

        object.position.copy(target);
        object.rotation.y = yaw;
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
