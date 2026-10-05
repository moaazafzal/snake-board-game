// Procedural snake: a tapered tube whose spine is recomputed every frame
// (cheap: ~1.2k vertices) so it can idle, rear up, lunge, gulp and slither.
import * as THREE from 'three';
import { tilePos } from './layout.js';

const RINGS = 150;
const SIDES = 9;
const UP = new THREE.Vector3(0, 1, 0);

/** Spine points for a snake lying from head tile to tail tile. */
export function spineFor(head, tail, seed = 0) {
  const H = tilePos(head).add(new THREE.Vector3(0.9, 0, -0.9));
  const T = tilePos(tail).add(new THREE.Vector3(-0.8, 0, 0.8));
  const len = H.distanceTo(T);
  const dir = T.clone().sub(H).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const waves = Math.max(1, Math.round(len / 10));
  const amp = Math.min(2.4, 0.8 + len * 0.07);
  const ctrl = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const env = Math.pow(Math.sin(Math.PI * t), 0.6);
    const off = Math.sin(t * Math.PI * (waves + 0.5) * 2 + seed) * amp * env;
    ctrl.push(H.clone().lerp(T, t).addScaledVector(perp, off));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  return curve.getSpacedPoints(RINGS);
}

function patternColor(pattern, t, a, len, cols, out) {
  const [base, accent, belly] = cols;
  const down = Math.cos(a) < -0.35; // ring angle 0 points up
  if (down) return out.copy(belly);
  const u = t * len;
  let k = 0;
  if (pattern === 'bands') k = (u * 0.75) % 1 < 0.32 ? 1 : 0;
  else if (pattern === 'diamonds') {
    const f = Math.abs(((u * 0.55) % 1) - 0.5) * 2;
    k = f + Math.abs(Math.sin(a)) * 0.9 < 0.75 ? 1 : 0;
  } else {
    const s = Math.sin(u * 3.1) * Math.sin(a * 3 + u * 1.3);
    k = s > 0.55 ? 1 : 0;
  }
  return out.copy(k ? accent : base);
}

export class SnakeView {
  constructor(scene, def, route, index) {
    this.def = def;
    this.index = index;
    this.scene = scene;
    this.seed = index * 1.7;
    this.time = Math.random() * 10;
    this.base = spineFor(route.head, route.tail, this.seed);
    this.pts = this.base.map((p) => p.clone());
    this.len = this.lengthOf(this.base);

    // animation channels (driven by the presentation layer)
    this.rear = 0; // 0..1 head raised
    this.lunge = 0; // 0..1 head pushed toward lungeTarget
    this.lungeTarget = new THREE.Vector3();
    this.bulge = -1; // position (0..1) of a gulp bulge along the body
    this.jaw = 0; // 0..1 mouth open
    this.wiggle = 1; // idle wiggle strength
    this.slither = 0; // extra travelling wave during relocation
    this.look = null; // optional point to look at

    const cols = def.colors.map((c) => new THREE.Color(c));
    const vCount = (RINGS + 1) * SIDES;
    this.positions = new Float32Array(vCount * 3);
    this.normals = new Float32Array(vCount * 3);
    const colors = new Float32Array(vCount * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i <= RINGS; i++) {
      for (let j = 0; j < SIDES; j++) {
        const a = (j / SIDES) * Math.PI * 2;
        patternColor(def.pattern, i / RINGS, a, 40, cols, tmp);
        colors.set([tmp.r, tmp.g, tmp.b], (i * SIDES + j) * 3);
      }
    }
    const idx = [];
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SIDES; j++) {
        const a = i * SIDES + j;
        const b = i * SIDES + ((j + 1) % SIDES);
        const c = (i + 1) * SIDES + j;
        const d = (i + 1) * SIDES + ((j + 1) % SIDES);
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(idx);
    this.geo = geo;
    this.body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.body.castShadow = true;
    this.body.frustumCulled = false;
    scene.add(this.body);

    // head
    this.head = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: cols[0] });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin);
    skull.scale.set(0.58, 0.4, 0.78);
    skull.position.z = 0.25;
    skull.castShadow = true;
    this.upperJaw = new THREE.Group();
    this.upperJaw.add(skull);
    const jawMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: cols[2] }));
    jawMesh.scale.set(0.5, 0.25, 0.68);
    jawMesh.position.set(0, -0.05, 0.25);
    this.lowerJaw = new THREE.Group();
    this.lowerJaw.add(jawMesh);
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const black = new THREE.MeshBasicMaterial({ color: '#141414' });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), white);
      eye.position.set(s * 0.3, 0.24, 0.42);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), black);
      pupil.position.set(s * 0.04, 0.03, 0.1);
      pupil.scale.set(0.6, 1.3, 0.6);
      eye.add(pupil);
      this.upperJaw.add(eye);
      this.eyes.push(eye);
    }
    const tongueMat = new THREE.MeshLambertMaterial({ color: '#e0284a' });
    this.tongue = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.5).translate(0, 0, 0.25), tongueMat);
    this.tongue.add(stem);
    for (const s of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.2).translate(0, 0, 0.1), tongueMat);
      fork.position.set(0, 0, 0.48);
      fork.rotation.y = s * 0.4;
      this.tongue.add(fork);
    }
    this.tongue.position.set(0, -0.05, 0.8);
    this.tongue.scale.z = 0.01;
    this.head.add(this.upperJaw, this.lowerJaw, this.tongue);
    scene.add(this.head);

    this.F = Array.from({ length: RINGS + 1 }, () => ({ t: new THREE.Vector3(), b: new THREE.Vector3(), n: new THREE.Vector3() }));
    this.flick = 0;
    this.nextFlick = 1 + Math.random() * 3;
    this.update(0);
  }

  lengthOf(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    return L;
  }

  /** Instantly place on a route (used on reset). */
  setRoute(route) {
    this.base = spineFor(route.head, route.tail, this.seed);
    this.len = this.lengthOf(this.base);
    this.rear = this.lunge = this.jaw = this.slither = 0;
    this.bulge = -1;
    this.wiggle = 1;
    this.look = null;
  }

  /** Blend the resting spine between two routes (k = 0..1). */
  blendRoutes(fromPts, toPts, k) {
    for (let i = 0; i <= RINGS; i++) this.base[i].lerpVectors(fromPts[i], toPts[i], k);
    this.len = this.lengthOf(this.base);
  }

  headPosition(out = new THREE.Vector3()) {
    return out.copy(this.head.position);
  }

  pointAt(t, out = new THREE.Vector3()) {
    const i = Math.round(THREE.MathUtils.clamp(t, 0, 1) * RINGS);
    return out.copy(this.pts[i]);
  }

  radius(t) {
    let r = 0.42 * (1 - Math.pow(t, 1.7) * 0.88);
    if (t < 0.035) r *= 0.82;
    if (this.bulge >= 0) r *= 1 + 0.9 * Math.exp(-Math.pow((t - this.bulge) / 0.035, 2));
    return r;
  }

  update(dt) {
    this.time += dt;
    const time = this.time;
    const pts = this.pts;
    const L = this.len;
    // spine = resting curve + travelling wave, head raise and lunge
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const p = pts[i].copy(this.base[i]);
      const prev = this.base[Math.max(0, i - 1)];
      const next = this.base[Math.min(RINGS, i + 1)];
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz) || 1;
      const side = Math.sin(t * L * 0.85 - time * (2.2 + this.slither * 6)) * (0.08 * this.wiggle + 0.35 * this.slither) * THREE.MathUtils.smoothstep(t, 0.04, 0.2);
      p.x += (-tz / tl) * side;
      p.z += (tx / tl) * side;
      const r = this.radius(t);
      p.y = r * 0.92 + 0.02;
      const neck = Math.max(0, 1 - t / 0.09);
      p.y += neck * neck * (0.35 + this.rear * 1.6) + Math.sin(time * 1.3 + this.seed) * 0.05 * neck;
      if (this.lunge > 0 && neck > 0) {
        const w = neck * neck * this.lunge;
        p.x += (this.lungeTarget.x - this.base[0].x) * w;
        p.z += (this.lungeTarget.z - this.base[0].z) * w;
        p.y += (this.lungeTarget.y + 0.6 - p.y) * w * 0.7;
      }
    }
    // frames
    for (let i = 0; i <= RINGS; i++) {
      const f = this.F[i];
      f.t.subVectors(pts[Math.min(RINGS, i + 1)], pts[Math.max(0, i - 1)]);
      if (f.t.lengthSq() < 1e-9) f.t.set(0, 0, 1);
      f.t.normalize();
      f.b.crossVectors(f.t, UP);
      if (f.b.lengthSq() < 1e-9) f.b.set(1, 0, 0);
      f.b.normalize();
      f.n.crossVectors(f.b, f.t).normalize();
    }
    const P = this.positions;
    const Nn = this.normals;
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const r = this.radius(t);
      const f = this.F[i];
      const p = pts[i];
      for (let j = 0; j < SIDES; j++) {
        const a = (j / SIDES) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = f.n.x * ca + f.b.x * sa;
        const ny = f.n.y * ca + f.b.y * sa * 0.8;
        const nz = f.n.z * ca + f.b.z * sa;
        const k = (i * SIDES + j) * 3;
        const flat = ca < 0 ? 0.55 : 1; // flatter belly
        P[k] = p.x + nx * r;
        P[k + 1] = p.y + ny * r * flat;
        P[k + 2] = p.z + nz * r;
        Nn[k] = nx;
        Nn[k + 1] = ny;
        Nn[k + 2] = nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;

    // head follows the first ring
    const h0 = pts[0];
    const dir = new THREE.Vector3().subVectors(pts[0], pts[4]);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    this.head.position.copy(h0).addScaledVector(dir, 0.05);
    const look = this.look ? this.look.clone().sub(this.head.position).normalize().lerp(dir, 0.35) : dir;
    this.head.lookAt(this.head.position.clone().add(look));
    this.upperJaw.rotation.x = -this.jaw * 0.55;
    this.lowerJaw.rotation.x = this.jaw * 0.45;

    // tongue flicks
    this.nextFlick -= dt;
    if (this.nextFlick <= 0) {
      this.flick = 1;
      this.nextFlick = 2 + Math.random() * 4;
    }
    if (this.flick > 0) {
      this.flick = Math.max(0, this.flick - dt * 2.2);
      this.tongue.scale.z = Math.sin(this.flick * Math.PI) + 0.01;
      this.tongue.rotation.y = Math.sin(this.flick * 30) * 0.15;
    }
  }
}
