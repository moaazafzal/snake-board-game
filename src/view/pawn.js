// The two heroes: Aqua (a glossy water droplet) and Leorus (a golden horned lion cub).
// Both share one rig: body (squash pivot at the feet), arms, legs, eyes, mouth.
import * as THREE from 'three';
import { heroMaterial } from './toon.js';

const UP = new THREE.Vector3(0, 1, 0);
const HERO_SCALE = 1.12; // heroes read clearly from the follow camera

/* ----------------------------------------------------------- helpers */
const ellipsoid = (rx, ry, rz, mat, seg = 20) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.75)), mat);
  m.scale.set(rx, ry, rz);
  return m;
};

/** A soft, pointed hair lock (flame shape) along +z, slightly curled upward. */
const LOCK_GEO = (() => {
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    prof.push(new THREE.Vector2(Math.max(0.002, Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.75) * (1 - t) ** 0.35), t));
  }
  const g = new THREE.LatheGeometry(prof, 12);
  g.rotateX(Math.PI / 2); // length along +z
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setY(i, pos.getY(i) + z * z * 0.35); // curl
  }
  g.computeVertexNormals();
  return g;
})();
function hairLock(len, width, mat) {
  const m = new THREE.Mesh(LOCK_GEO, mat);
  m.scale.set(width, width * 0.8, len);
  m.castShadow = true;
  return m;
}

/** A tapered, smooth tube along points (for horns, tails, arms). */
function taperTube(points, r0, r1, mat, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  const seg = 16;
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = geo.attributes.position;
  const centre = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, centre);
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(centre).multiplyScalar(r).add(centre);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  // round cap at the thin end
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r1, 10, 8), mat);
  cap.position.copy(points[points.length - 1]);
  m.add(cap);
  return m;
}

/** Big glossy cartoon eye: white, two-tone iris with a dark ring, pupil and highlights. */
function cartoonEye(iris, size = 1) {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.12, clearcoat: 1 });
  const sclera = ellipsoid(0.17 * size, 0.19 * size, 0.12 * size, white, 18);
  const ring = ellipsoid(0.127 * size, 0.142 * size, 0.055 * size, new THREE.MeshStandardMaterial({ color: iris.ring, roughness: 0.4 }), 16);
  ring.position.z = 0.08 * size;
  // anime-style iris: dark at the top, glowing lighter toward the bottom
  const irisM = ellipsoid(0.112 * size, 0.127 * size, 0.06 * size, heroMaterial({ stops: iris.stops, range: [-1, 1], rim: iris.stops[0], rimStrength: 0.15, roughness: 0.25 }), 18);
  irisM.position.z = 0.088 * size;
  const pupil = ellipsoid(0.06 * size, 0.07 * size, 0.04 * size, new THREE.MeshBasicMaterial({ color: '#0b0b12' }), 12);
  pupil.position.set(0, 0.012 * size, 0.118 * size);
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const g1 = ellipsoid(0.04 * size, 0.045 * size, 0.02 * size, glintMat, 8);
  g1.position.set(0.04 * size, 0.05 * size, 0.142 * size);
  const g2 = ellipsoid(0.02 * size, 0.02 * size, 0.01 * size, glintMat, 6);
  g2.position.set(-0.04 * size, -0.045 * size, 0.142 * size);
  const look = new THREE.Group(); // iris + pupil + glints move together
  look.add(ring, irisM, pupil, g1, g2);
  // dark upper lash line hugging the top of the eye
  const lash = new THREE.Mesh(new THREE.TorusGeometry(0.168 * size, 0.022 * size, 6, 20, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: '#1a1420' }));
  lash.rotation.z = Math.PI * 0.05;
  lash.scale.set(1, 1.12, 1);
  lash.position.z = 0.035 * size;
  g.add(sclera, look, lash);
  return { eye: g, pupil: look };
}

/** Open smile: dark mouth with a pink tongue (scaled per mood). */
function smile(width = 0.16) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-width, 0);
  shape.quadraticCurveTo(0, -width * 1.6, width, 0);
  shape.quadraticCurveTo(0, width * 0.18, -width, 0);
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), new THREE.MeshBasicMaterial({ color: '#6d1426' }));
  const tShape = new THREE.Shape();
  tShape.moveTo(-width * 0.55, -width * 0.55);
  tShape.quadraticCurveTo(0, -width * 1.45, width * 0.55, -width * 0.55);
  tShape.quadraticCurveTo(0, -width * 0.35, -width * 0.55, -width * 0.55);
  const tongue = new THREE.Mesh(new THREE.ShapeGeometry(tShape, 12), new THREE.MeshBasicMaterial({ color: '#ff7a8a' }));
  tongue.position.z = 0.002;
  g.add(mouth, tongue);
  return g;
}

function blush(mat) {
  const m = ellipsoid(0.085, 0.05, 0.02, mat, 10);
  return m;
}

function brow(color, w = 0.11) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(w, 0.018, 6, 12, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color }));
  m.rotation.z = Math.PI * 0.15;
  return m;
}

/* ----------------------------------------------------------- Aqua */
function buildAqua(p) {
  // sampled from the Aqua artwork: airy sky blue, lighter top, deeper base, bright rim
  const bodyMat = heroMaterial({ stops: ['#2a86df', '#57b2f1', '#a4dcfb'], range: [0.25, 1.9], rim: '#dff7ff', rimStrength: 0.6, rimPower: 2.1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const water = heroMaterial({ stops: ['#3191e4', '#56b1f0', '#8fd2fa'], range: [-1, 1], rim: '#dff7ff', rimStrength: 0.5, rimPower: 2.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
  p.skin = water;
  // teardrop body (lathe), tip curling back and to one side
  const prof = [];
  const yb = 0.24;
  const yc = 0.8;
  const R = 0.58;
  const yt = 1.92;
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.sin(a) * R, yc - Math.cos(a) * (yc - yb)));
  }
  for (let i = 1; i <= 22; i++) {
    const t = i / 22;
    const r = R * Math.pow(Math.cos((t * Math.PI) / 2), 1.15) * (1 + 0.18 * Math.sin(t * Math.PI));
    prof.push(new THREE.Vector2(Math.max(0.004, r), yc + t * (yt - yc)));
  }
  const geo = new THREE.LatheGeometry(prof, 36);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 1.25) {
      const k = (y - 1.25) ** 2;
      pos.setZ(i, pos.getZ(i) - k * 0.45);
      pos.setX(i, pos.getX(i) + k * 0.28);
    }
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, bodyMat);
  body.castShadow = true;
  p.body.add(body);
  // glossy highlight streak + a forehead droplet
  const shine = ellipsoid(0.05, 0.2, 0.03, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }), 12);
  shine.position.set(-0.3, 1.18, 0.4);
  shine.rotation.set(-0.4, 0, 0.45);
  const drop = ellipsoid(0.05, 0.07, 0.04, heroMaterial({ stops: ['#7cc8f7', '#b8e6fd', '#ffffff'], rim: '#ffffff', rimStrength: 0.5, roughness: 0.05, clearcoat: 1 }), 10);
  drop.position.set(0.24, 1.28, 0.41);
  p.body.add(shine, drop);

  // face
  for (const s of [-1, 1]) {
    const e = cartoonEye({ stops: ['#5fb4ff', '#2463cf', '#0f2c6e'], ring: '#0d2350' }, 1);
    e.eye.position.set(s * 0.2, 1.0, 0.53);
    e.eye.rotation.y = s * 0.28;
    p.body.add(e.eye);
    p.eyes.push(e);
    const b = brow('#2b5f9f');
    b.position.set(s * 0.21, 1.24, 0.535);
    b.rotation.z = s > 0 ? Math.PI * 0.12 : Math.PI * 0.18;
    p.body.add(b);
    const c = blush(new THREE.MeshBasicMaterial({ color: '#ff9cc2', transparent: true, opacity: 0.7 }));
    c.position.set(s * 0.36, 0.84, 0.48);
    c.rotation.y = s * 0.6;
    p.body.add(c);
  }
  p.mouth = smile(0.18);
  p.mouth.position.set(0, 0.79, 0.59);
  p.mouth.rotation.x = -0.12;
  p.body.add(p.mouth);

  // arms with mitten hands, built hanging down (-y) from the shoulder; the rig raises/swings them
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.52, 0.98, 0.04);
    const arm = taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.03, -0.2, 0.005), new THREE.Vector3(s * 0.02, -0.4, 0.015)], 0.1, 0.085, water);
    const wrist = new THREE.Group();
    wrist.position.set(s * 0.02, -0.43, 0.02);
    const hand = ellipsoid(0.135, 0.145, 0.095, water, 14);
    hand.position.y = -0.08;
    for (let f = 0; f < 3; f++) {
      const finger = ellipsoid(0.038, 0.08, 0.038, water, 8);
      finger.position.set(s * (0.07 - f * 0.055), -0.1 - (f === 1 ? 0.025 : 0), 0);
      finger.rotation.z = s * (0.45 - f * 0.4);
      hand.add(finger);
    }
    const thumb = ellipsoid(0.04, 0.065, 0.04, water, 8);
    thumb.position.set(-s * 0.1, 0.0, 0.03);
    thumb.rotation.z = -s * 0.9;
    hand.add(thumb);
    wrist.add(hand);
    pivot.add(arm, wrist);
    p.body.add(pivot);
    p.arms.push({ pivot, s, wrist });
  }
  p.armBase = 0.95; // resting raise: arms held out, clear of the round body
  p.armMin = 0.72;
  p.armUp = 2.55; // "hands up" angle (V shape, clear of the head)
  // legs with rounded boots
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.2, 0.32, 0);
    const leg = taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, 0.01), new THREE.Vector3(0, -0.18, 0.02)], 0.08, 0.075, water);
    const boot = ellipsoid(0.18, 0.11, 0.24, water, 14);
    boot.position.set(0, -0.22, 0.08);
    boot.castShadow = true;
    pivot.add(leg, boot);
    p.body.add(pivot);
    p.legs.push(pivot);
  }
  // little splash droplets that bob around Aqua
  const splashMat = heroMaterial({ stops: ['#3d9be6', '#6cc1f5', '#c3ebfe'], rim: '#ffffff', rimStrength: 0.6, roughness: 0.06, clearcoat: 1 });
  for (const [x, y, z, sc] of [[-0.78, 1.45, 0.1, 1], [-0.62, 1.7, 0.05, 0.7], [0.82, 1.1, 0.12, 0.8]]) {
    const d = ellipsoid(0.055 * sc, 0.08 * sc, 0.055 * sc, splashMat, 10);
    d.position.set(x, y, z);
    d.rotation.z = x < 0 ? 0.5 : -0.5;
    p.body.add(d);
    p.floaters.push({ m: d, y, phase: x * 3 });
  }
  p.particleColors = ['#7fd0ff', '#d6f1ff', '#45b2ff'];
  p.height = 1.95;
}

/* ----------------------------------------------------------- Leorus */
function buildLeorus(p) {
  // sampled from the Leorus artwork: warm gold-orange fur, cream muzzle/belly, two-tone mane
  const furOpts = { rim: '#ffe0a0', rimStrength: 0.32, rimPower: 2.6, roughness: 0.5, sheen: 0.3, sheenColor: '#ffd890', sheenRoughness: 0.6 };
  const fur = heroMaterial({ stops: ['#cf6f1d', '#ec9a3c', '#f9c05e'], range: [-1, 1], ...furOpts });
  const cream = heroMaterial({ stops: ['#e6bb78', '#f5d6a0', '#fff1d4'], range: [-1, 1], rim: '#fff4dc', rimStrength: 0.25, roughness: 0.6 });
  const mane = heroMaterial({ stops: ['#bd5a12', '#e2821f', '#f7ab42'], range: [-1, 1], ...furOpts });
  const maneLight = heroMaterial({ stops: ['#d9852e', '#f0a948', '#ffd481'], range: [-1, 1], ...furOpts });
  const hoof = heroMaterial({ stops: ['#2f190a', '#4e2c14', '#7a4a26'], range: [-0.07, 0.07], rim: '#a8703f', rimStrength: 0.25, roughness: 0.35, clearcoat: 0.5 });
  const horn = heroMaterial({ stops: ['#dcc7a0', '#f2e3c4', '#fffaf0'], range: [0.4, 0.78], rim: '#ffffff', rimStrength: 0.25, roughness: 0.3, clearcoat: 0.7 });
  const band = new THREE.MeshStandardMaterial({ color: '#6e4122', roughness: 0.5 });
  p.skin = fur;

  // body + belly
  const torso = ellipsoid(0.39, 0.4, 0.36, fur, 22);
  torso.position.y = 0.6;
  torso.castShadow = true;
  const belly = ellipsoid(0.27, 0.29, 0.14, cream, 16);
  belly.position.set(0, 0.6, 0.27);
  p.body.add(torso, belly);

  // head
  const head = new THREE.Group();
  head.position.y = 1.36;
  head.scale.setScalar(1.12); // chibi proportions: big head
  p.body.add(head);
  const skull = ellipsoid(0.53, 0.49, 0.48, fur, 26);
  skull.castShadow = true;
  head.add(skull);
  const muzzle = ellipsoid(0.27, 0.19, 0.17, cream, 18);
  muzzle.position.set(0, -0.17, 0.38);
  const nose = ellipsoid(0.085, 0.06, 0.06, heroMaterial({ stops: ['#2e1407', '#4a2512', '#7a4424'], rim: '#a86a40', rimStrength: 0.3, roughness: 0.2, clearcoat: 1 }), 12);
  nose.position.set(0, -0.08, 0.54);
  head.add(muzzle, nose);
  // mane: soft pointed locks fanning out behind and around the face, plus a fringe on top
  const maneG = new THREE.Group();
  const out = new THREE.Vector3();
  const place = (lock, from, dir) => {
    lock.position.copy(from);
    lock.lookAt(out.copy(from).add(dir));
    maneG.add(lock);
  };
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a) * 0.7, Math.sin(a) * 0.8, -0.9).normalize();
    place(hairLock(0.38, 0.27, i % 2 ? mane : maneLight), dir.clone().multiplyScalar(0.34), dir);
  }
  // fluffy ruff around the face, open at the chin and beside the ears
  for (let i = 0; i < 7; i++) {
    const a = 0.05 + (i / 6) * (Math.PI - 0.1);
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), -0.35).normalize();
    place(hairLock(0.26, 0.24, i % 2 ? maneLight : mane), new THREE.Vector3(Math.cos(a) * 0.4, Math.sin(a) * 0.38, 0.1), dir);
  }
  for (const s of [-1, 1]) {
    const dir = new THREE.Vector3(s * 0.8, -0.5, -0.3).normalize();
    place(hairLock(0.24, 0.24, mane), new THREE.Vector3(s * 0.38, -0.3, 0.05), dir);
  }
  // fringe swooping forward over the forehead
  for (const [x, y, z, sz, ang] of [[0, 0.42, 0.18, 1, 0], [-0.14, 0.4, 0.2, 0.85, -0.5], [0.15, 0.41, 0.19, 0.9, 0.5], [0.04, 0.47, 0.02, 1.1, 0.2]]) {
    const lock = hairLock(0.36 * sz, 0.2 * sz, x === 0 ? maneLight : mane);
    place(lock, new THREE.Vector3(x, y, z), new THREE.Vector3(Math.sin(ang) * 0.6, 0.55, 0.8).normalize());
  }
  head.add(maneG);
  p.hat = maneG;
  // ears
  for (const s of [-1, 1]) {
    const ear = ellipsoid(0.17, 0.12, 0.08, fur, 12);
    ear.position.set(s * 0.6, 0.08, 0.16);
    ear.rotation.set(0, s * 0.3, -s * 0.45);
    const inner = ellipsoid(0.11, 0.075, 0.03, heroMaterial({ stops: ['#e98a86', '#f4a6a0', '#ffc9c0'], rimStrength: 0.1, roughness: 0.6 }), 10);
    inner.position.z = 0.045;
    ear.add(inner);
    head.add(ear);
  }
  // horns: tapered, curving outward and up, with a brown band
  for (const s of [-1, 1]) {
    // crescent horns: out to the side, then curling up
    const pts = [new THREE.Vector3(s * 0.33, 0.4, 0.04), new THREE.Vector3(s * 0.56, 0.47, 0.04), new THREE.Vector3(s * 0.69, 0.6, 0.02), new THREE.Vector3(s * 0.68, 0.76, 0)];
    head.add(taperTube(pts, 0.13, 0.045, horn, 12));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.04, 8, 18), band);
    ring.position.set(s * 0.4, 0.42, 0.04);
    ring.rotation.set(0, Math.PI / 2, s * 0.6);
    head.add(ring);
  }
  // face
  for (const s of [-1, 1]) {
    const e = cartoonEye({ stops: ['#c27a36', '#7a421c', '#3c1d0a'], ring: '#2a1205' }, 1.12);
    e.eye.position.set(s * 0.2, 0.03, 0.41);
    e.eye.rotation.y = s * 0.3;
    head.add(e.eye);
    p.eyes.push(e);
    const b = brow('#8a4f22', 0.1);
    b.position.set(s * 0.2, 0.25, 0.42);
    head.add(b);
    const c = blush(new THREE.MeshBasicMaterial({ color: '#ff8c8c', transparent: true, opacity: 0.65 }));
    c.position.set(s * 0.33, -0.12, 0.36);
    c.rotation.y = s * 0.6;
    head.add(c);
  }
  p.mouth = smile(0.135);
  p.mouth.position.set(0, -0.22, 0.553);
  p.mouth.rotation.x = -0.3;
  head.add(p.mouth);
  p.headGroup = head;

  // arms ending in hooves, built hanging down from the shoulder
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.38, 0.9, 0.04);
    const arm = taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.02, -0.17, 0.01), new THREE.Vector3(s * 0.015, -0.34, 0.02)], 0.1, 0.085, fur);
    const wrist = new THREE.Group();
    wrist.position.set(s * 0.015, -0.37, 0.02);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.098, 0.11, 14), hoof);
    h.position.y = -0.04;
    h.castShadow = true;
    wrist.add(h);
    pivot.add(arm, wrist);
    p.body.add(pivot);
    p.arms.push({ pivot, s, wrist });
  }
  p.armBase = 0.42;
  p.armMin = 0.24;
  p.armUp = 2.2; // big head: hands go up and out so they stay visible
  // legs
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.19, 0.3, 0.02);
    const leg = taperTube([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, -0.08, 0.01), new THREE.Vector3(0, -0.17, 0.02)], 0.12, 0.11, fur);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.12, 16), hoof);
    h.position.set(0, -0.24, 0.02);
    h.castShadow = true;
    pivot.add(leg, h);
    p.body.add(pivot);
    p.legs.push(pivot);
  }
  // tail with a tuft
  const tail = new THREE.Group();
  tail.position.set(0, 0.48, -0.34);
  tail.add(taperTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, 0.08, -0.22), new THREE.Vector3(0.2, 0.3, -0.36), new THREE.Vector3(0.28, 0.48, -0.36)], 0.045, 0.035, fur, 8));
  const tuft = ellipsoid(0.12, 0.15, 0.12, maneLight, 12);
  tuft.position.set(0.29, 0.56, -0.36);
  tail.add(tuft);
  p.body.add(tail);
  p.tail = tail;
  p.particleColors = ['#e9c88a', '#c9a46e', '#8fd16a'];
  p.height = 2.1;
}

/* ----------------------------------------------------------- shared rig */
export class Pawn {
  /** @param kind 'aqua' | 'leorus' */
  constructor(scene, kind) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // squash & stretch pivot at the feet
    this.root.add(this.body);
    this.arms = [];
    this.legs = [];
    this.eyes = [];
    this.floaters = [];
    this.mouth = null;
    this.hat = null;
    this.tail = null;
    (kind === 'aqua' ? buildAqua : buildLeorus)(this);

    // shield bubble
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.32, 24, 16),
      new THREE.MeshPhysicalMaterial({ color: '#8fd8ff', transparent: true, opacity: 0.26, depthWrite: false, roughness: 0.05, clearcoat: 1, emissive: '#2c7fc0', emissiveIntensity: 0.35 }),
    );
    this.bubble.position.y = 1.1;
    this.bubble.visible = false;
    this.root.add(this.bubble);

    scene.add(this.root);
    this.t = Math.random() * 5;
    this.blinkIn = 2 + Math.random() * 2;
    this.mood = 'normal';
    this.moodTime = 0;
    this.squash = 0;
    this.facing = 0;
    this.targetFacing = 0;
    this.onStep = null;
    this.action = 'idle';
    this.k = 0;
    this.phase = 0;
    this.waveIn = 3 + Math.random() * 5;
    this.waveT = 0;
    this.tgt = { raise: [0, 0], swing: [0, 0], leg: [0, 0], wrist: [0, 0], lean: 0, sway: 0 };
    this.cur = { raise: [0, 0], swing: [0, 0], leg: [0, 0], wrist: [0, 0], lean: 0, sway: 0 };
    this.snapPose();
  }

  faceDir(dir) {
    if (Math.abs(dir.x) + Math.abs(dir.z) < 1e-4) return;
    this.targetFacing = Math.atan2(dir.x, dir.z);
  }

  faceInstant(dir) {
    this.faceDir(dir);
    this.facing = this.targetFacing;
    this.root.rotation.y = this.facing;
  }

  /**
   * Start an animation: idle | hop | walk | climb | hang | swim | sink | stuck | throw | cheer | scared.
   * Callers drive `k` (0..1 progress) and/or `phase` (cycle angle) each frame; limbs blend smoothly.
   */
  act(name) {
    if (this.action !== name) {
      this.action = name;
      this.k = 0;
      this.phase = 0;
    }
  }

  rest() {
    this.act('idle');
  }

  /** Jump limbs straight to the current pose (no blending), e.g. after a reset. */
  snapPose() {
    this.solvePose(0);
    for (let i = 0; i < 2; i++) {
      this.cur.raise[i] = this.tgt.raise[i];
      this.cur.swing[i] = this.tgt.swing[i];
      this.cur.leg[i] = this.tgt.leg[i];
      this.cur.wrist[i] = this.tgt.wrist[i];
    }
    this.cur.lean = this.tgt.lean;
    this.cur.sway = this.tgt.sway;
    this.applyPose();
  }

  /** Target limb angles (radians) for the current action. raise: sideways lift, swing: forward(+)/back. */
  solvePose(dt) {
    const t = this.t;
    const T = this.tgt;
    const base = this.armBase;
    const k = this.k;
    const ph = this.phase;
    const S = Math.sin;
    let raise = [base, base];
    let swing = [0, 0];
    let leg = [0, 0];
    let wrist = [0, 0];
    let lean = 0;
    let sway = 0;
    switch (this.action) {
      case 'hop': {
        const air = S(Math.PI * Math.min(1, k));
        // crouch, fling both hands up at the peak, tuck the legs, land
        raise = [base + (this.armUp - base) * air, base + (this.armUp - base - 0.15) * air];
        swing = [0.45 * air, 0.35 * air];
        leg = [0.8 * air, -0.35 * air];
        lean = 0.16 * air;
        break;
      }
      case 'walk': {
        const w = S(ph);
        leg = [0.85 * w, -0.85 * w];
        swing = [-1.05 * w, 1.05 * w];
        raise = [Math.max(this.armMin, base * 0.8) + 0.12 * Math.abs(w), Math.max(this.armMin, base * 0.8) + 0.12 * Math.abs(w)];
        lean = 0.14;
        sway = 0.09 * w;
        this.bob = Math.abs(Math.sin(ph)) * 0.09;
        break;
      }
      case 'climb': {
        const w = S(ph);
        raise = [this.armUp + 0.25 * w, this.armUp - 0.25 * w];
        swing = [0.5 + 0.35 * w, 0.5 - 0.35 * w];
        leg = [0.55 * w, -0.55 * w];
        lean = -0.04;
        break;
      }
      case 'hang': {
        raise = [this.armUp + 0.12, this.armUp + 0.12];
        swing = [0.1 * S(t * 3), 0.1 * S(t * 3 + 1)];
        leg = [0.5 * S(ph), -0.5 * S(ph)];
        break;
      }
      case 'swim': {
        raise = [this.armUp - 0.6 + 0.6 * S(t * 13), this.armUp - 0.6 + 0.6 * S(t * 13 + Math.PI)];
        swing = [0.5 * S(t * 11), -0.5 * S(t * 11)];
        leg = [0.6 * S(t * 15), -0.6 * S(t * 15)];
        sway = 0.1 * S(t * 9);
        break;
      }
      case 'sink':
      case 'stuck': {
        const r = this.action === 'sink' ? 1 : 0.55;
        raise = [this.armUp - 0.25 + 0.35 * r * S(t * 9), this.armUp - 0.25 + 0.35 * r * S(t * 9 + Math.PI)];
        swing = [0.3, 0.3];
        wrist = [0.5 * S(t * 11), -0.5 * S(t * 11)];
        sway = 0.06 * r * S(t * 12);
        break;
      }
      case 'throw': {
        // right arm winds back, then flings forward
        const wind = Math.min(1, k / 0.45);
        const fling = Math.max(0, Math.min(1, (k - 0.45) / 0.22));
        const settle = Math.max(0, (k - 0.75) / 0.25);
        raise = [base + 0.2, base + 0.55];
        swing = [0.25 * fling, (-1.35 * wind) * (1 - fling) + 1.5 * fling * (1 - settle)];
        lean = -0.08 * wind * (1 - fling) + 0.14 * fling * (1 - settle);
        break;
      }
      case 'cheer': {
        const air = S(Math.PI * Math.min(1, k));
        raise = [this.armUp + 0.25 * S(t * 10), this.armUp + 0.25 * S(t * 10 + Math.PI)];
        swing = [0.2, 0.2];
        wrist = [0.6 * S(t * 14), -0.6 * S(t * 14)];
        leg = [0.5 * air, 0.5 * air];
        break;
      }
      case 'scared': {
        raise = [1.45, 1.45];
        swing = [0.95 + 0.05 * S(t * 40), 0.95 + 0.05 * S(t * 40 + 1)];
        sway = 0.05 * S(t * 32);
        break;
      }
      default: {
        // idle: gentle arm sway, weight shift, and now and then a friendly wave
        const b = S(t * 2.1) * 0.16;
        raise = [base + b, base - b * 0.8];
        swing = [0.2 * S(t * 1.5), 0.2 * S(t * 1.5 + 2)];
        sway = S(t * 1.1) * 0.05;
        leg = [0.08 * S(t * 1.1), -0.08 * S(t * 1.1)];
        if (this.mood === 'happy') {
          raise = [base + 0.9 + 0.2 * S(t * 9), base + 0.9 + 0.2 * S(t * 9 + Math.PI)];
          wrist = [0.4 * S(t * 12), -0.4 * S(t * 12)];
        } else if (this.mood === 'scared') {
          raise = [1.45, 1.45];
          swing = [0.95, 0.95];
          sway = 0.04 * S(t * 30);
        } else if (this.mood === 'wow') {
          raise = [base + 0.8, base + 0.8];
          swing = [0.35, 0.35];
        }
        this.waveIn -= dt;
        if (this.waveIn <= 0 && this.mood === 'normal') {
          this.waveT = 1.7;
          this.waveArm = Math.random() < 0.5 ? 0 : 1;
          this.waveIn = 6 + Math.random() * 6;
        }
        if (this.waveT > 0) {
          this.waveT -= dt;
          const w = this.waveArm;
          const up = Math.min(1, (1.7 - this.waveT) / 0.25, this.waveT / 0.3);
          raise[w] = raise[w] + (this.armUp - 0.05 - raise[w]) * up;
          swing[w] = 0.3 * up;
          raise[w] += 0.22 * S(t * 11) * up; // the whole arm waves, not just the hand
          wrist[w] = 0.6 * S(t * 11) * up;
        }
      }
    }
    for (let i = 0; i < 2; i++) {
      T.raise[i] = raise[i];
      T.swing[i] = swing[i];
      T.leg[i] = leg[i];
      T.wrist[i] = wrist[i];
    }
    T.lean = lean;
    T.sway = sway;
  }

  applyPose() {
    const C = this.cur;
    this.arms.forEach(({ pivot, s, wrist }, i) => {
      pivot.rotation.set(-C.swing[i], 0, s * C.raise[i]); // XYZ order: raise sideways, then swing fore/aft
      if (wrist) wrist.rotation.z = s * C.wrist[i];
    });
    this.legs.forEach((leg, i) => (leg.rotation.x = -C.leg[i]));
    this.body.rotation.x = C.lean;
    this.body.rotation.z = C.sway;
    if (this.action === 'walk') this.body.position.y = this.bob || 0;
    else if (this.bob) { this.body.position.y -= this.bob; this.bob = 0; }
  }

  setMood(mood, seconds = 1.5) {
    this.mood = mood;
    this.moodTime = seconds;
  }

  update(dt) {
    this.t += dt;
    let d = this.targetFacing - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * (1 - Math.exp(-dt * 10));
    this.root.rotation.y = this.facing;
    // breathing + squash & stretch
    const breathe = this.action === 'idle' ? Math.sin(this.t * 2.6) * 0.025 : 0;
    // limbs: solve target pose, then blend toward it (fast enough for cycles, smooth on transitions)
    this.solvePose(dt);
    const a = 1 - Math.exp(-dt * 16);
    const C = this.cur;
    const T = this.tgt;
    for (let i = 0; i < 2; i++) {
      C.raise[i] += (T.raise[i] - C.raise[i]) * a;
      C.swing[i] += (T.swing[i] - C.swing[i]) * a;
      C.leg[i] += (T.leg[i] - C.leg[i]) * a;
      C.wrist[i] += (T.wrist[i] - C.wrist[i]) * a;
    }
    C.lean += (T.lean - C.lean) * a;
    C.sway += (T.sway - C.sway) * a;
    this.applyPose();
    this.squash *= Math.exp(-dt * 9);
    const sy = (1 + breathe - this.squash) * HERO_SCALE;
    const sxz = (1 + this.squash * 0.6 - breathe * 0.5) * HERO_SCALE;
    this.body.scale.set(sxz, sy, sxz);
    if (this.hat) this.hat.rotation.z = Math.sin(this.t * 1.7) * 0.05;
    if (this.tail) this.tail.rotation.set(Math.sin(this.t * 2.2) * 0.12, Math.sin(this.t * 1.6) * 0.35, 0);
    if (this.headGroup) this.headGroup.rotation.z = Math.sin(this.t * 1.3) * 0.05;
    for (const f of this.floaters) {
      f.m.position.y = f.y + Math.sin(this.t * 2.4 + f.phase) * 0.06;
      f.m.rotation.y += dt;
    }
    // blinking & moods
    this.blinkIn -= dt;
    let eyeY = 1;
    if (this.blinkIn < 0) {
      eyeY = 0.12 + 0.88 * Math.abs(Math.cos((this.blinkIn / 0.16) * Math.PI));
      if (this.blinkIn < -0.16) this.blinkIn = 2 + Math.random() * 3;
    }
    if (this.moodTime > 0) {
      this.moodTime -= dt;
      if (this.moodTime <= 0) this.mood = 'normal';
    }
    let pupil = 1;
    let mx = 1;
    let my = 1;
    if (this.mood === 'happy') { eyeY = Math.min(eyeY, 0.45); mx = 1.15; my = 1.3; }
    if (this.mood === 'scared') { pupil = 0.6; mx = 0.55; my = 0.8; }
    if (this.mood === 'wow') { pupil = 1.2; mx = 0.75; my = 1.5; }
    if (this.mood === 'dizzy') { mx = 0.8; my = 0.7; }
    for (const { eye, pupil: p } of this.eyes) {
      eye.scale.set(1, eyeY, 1);
      p.scale.setScalar(pupil);
      if (this.mood === 'dizzy') p.position.set(Math.cos(this.t * 12) * 0.035, Math.sin(this.t * 12) * 0.035, 0);
      else p.position.set(0, 0, 0);
    }
    if (this.mouth) {
      const talk = this.action === 'idle' ? 1 + Math.sin(this.t * 1.8) * 0.04 : 1;
      this.mouth.scale.set(mx, my * talk, 1);
    }
    if (this.bubble.visible) {
      this.bubble.rotation.y += dt;
      this.bubble.scale.setScalar(1 + Math.sin(this.t * 3) * 0.03);
    }
  }
}

export const HERO = {
  aqua: { name: 'Aqua', color: '#3c9cf0' },
  leorus: { name: 'Leorus', color: '#f0943c' },
};
