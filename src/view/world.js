// Renderer, scene, lights, camera rig and adaptive quality.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PALETTE } from './layout.js';

const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function canUseWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 1.5);
    this.renderer.setPixelRatio(this.maxRatio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.skyLow, 140, 330);

    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 600);
    this.camera.position.set(0, 50, 60);

    this.addSky();
    this.addLights();

    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.09,
      minDistance: 6,
      maxDistance: 120,
      maxPolarAngle: 1.38,
      screenSpacePanning: true,
      rotateSpeed: 0.7,
      zoomSpeed: 0.9,
    });
    this.controls.target.set(0, 0, 0);
    this.rig = new CameraRig(this);

    this.updaters = new Set();
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.quality = { level: 0, acc: 0, frames: 0, cooldown: 3 };
    this.fps = 60;

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  addSky() {
    const geo = new THREE.SphereGeometry(450, 24, 12);
    const col = [];
    const top = new THREE.Color(PALETTE.sky);
    const low = new THREE.Color(PALETTE.skyLow);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = THREE.MathUtils.clamp(pos.getY(i) / 450, 0, 1);
      const c = low.clone().lerp(top, Math.pow(h, 0.55));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    this.scene.add(sky);
  }

  addLights() {
    this.hemi = new THREE.HemisphereLight('#f4fbff', '#6f8f4a', 1.55);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    sun.position.set(22, 38, 16);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    const s = isTouch ? 1024 : 2048;
    sun.shadow.mapSize.set(s, s);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 90 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  onUpdate(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  start() {
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  frame(ts) {
    this.timer.update(ts);
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 1 / 20); // keep animations stable through hiccups
    for (const fn of this.updaters) fn(dt);
    this.rig.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.adapt(raw);
  }

  /** Drops resolution, then shadows, if the device cannot hold ~45 fps. */
  adapt(raw) {
    const q = this.quality;
    if (document.hidden || raw > 0.5) return;
    q.acc += raw;
    q.frames++;
    if (q.acc < 2) return;
    const avg = q.acc / q.frames;
    this.fps = 1 / avg;
    q.acc = 0;
    q.frames = 0;
    if (q.cooldown > 0) { q.cooldown--; return; }
    if (avg > 1 / 45 && q.level < 3) {
      q.level++;
      if (q.level === 1) this.renderer.setPixelRatio(Math.max(1, this.maxRatio * 0.75));
      else if (q.level === 2) this.renderer.setPixelRatio(1);
      else if (q.level === 3) {
        this.renderer.shadowMap.enabled = false;
        this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
      }
      this.resize();
      q.cooldown = 1;
    }
  }
}

/** Smooth camera director: menu orbit, follow, whole-board map, free look and cinematic focus. */
class CameraRig {
  constructor(world) {
    this.world = world;
    this.mode = 'menu';
    this.focus = null; // { target: Vector3, pos?: Vector3, dist?: number }
    this.followTarget = new THREE.Vector3();
    this.t = 0;
    this.shake = 0;
    this.goalPos = new THREE.Vector3();
    this.goalTarget = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.onModeChange = () => {};
    world.controls.addEventListener('start', () => {
      if (this.mode === 'follow' || this.mode === 'map') this.setMode('free');
    });
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.onModeChange(mode);
  }

  /** distance that fits the whole board for the current aspect */
  fitDistance(extent = 23) {
    const cam = this.world.camera;
    const vf = THREE.MathUtils.degToRad(cam.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * cam.aspect);
    return Math.max(extent / Math.tan(vf) * 0.98, (extent * 1.04) / Math.tan(hf));
  }

  update(dt) {
    this.t += dt;
    const { camera, controls } = this.world;
    const aspect = camera.aspect;
    let lockOn = true;
    if (this.mode === 'menu') {
      const a = this.t * 0.045 + 0.6;
      const d = this.fitDistance(22) * 0.9;
      this.goalTarget.set(0, 0, 0);
      this.goalPos.set(Math.sin(a) * d * 0.75, d * 0.62, Math.cos(a) * d * 0.75);
    } else if (this.mode === 'map') {
      const d = this.fitDistance(23);
      const el = THREE.MathUtils.degToRad(aspect < 1 ? 72 : 60);
      this.goalTarget.set(0, 0, aspect < 1 ? -1 : 0.5);
      this.goalPos.set(0, Math.sin(el) * d, Math.cos(el) * d + this.goalTarget.z);
    } else if (this.mode === 'follow') {
      if (this.focus) {
        this.goalTarget.copy(this.focus.target);
        const dist = this.focus.dist || 14;
        const k = THREE.MathUtils.clamp(1.2 / aspect, 1, 1.9);
        this.goalPos.copy(this.focus.target).add(this.tmp.set(0, 0.75, 0.85).normalize().multiplyScalar(dist * k));
      } else {
        const k = THREE.MathUtils.clamp(1.2 / aspect, 1, 1.9);
        this.goalTarget.copy(this.followTarget).y += 0.8;
        this.goalPos.copy(this.goalTarget).add(this.tmp.set(0, 10.5 * k, 12.5 * k));
      }
    } else {
      lockOn = false; // free look: user owns the camera
    }
    if (lockOn) {
      const k = 1 - Math.exp(-dt * (this.focus ? 2.6 : 3.2));
      camera.position.lerp(this.goalPos, k);
      controls.target.lerp(this.goalTarget, k);
      camera.lookAt(controls.target);
    }
    controls.update();
    if (this.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this.shake;
      camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 8);
    }
  }
}
