// Dice, collectible mangoes and shield charms, reach markers and particles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { tilePos } from './layout.js';
import { ease } from '../anim.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/* ---------------------------------------------------------------- dice */
const FACE_NORMALS = {
  1: new THREE.Vector3(0, 1, 0),
  6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(0, 0, 1),
  5: new THREE.Vector3(0, 0, -1),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(-1, 0, 0),
};
const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export class Dice {
  constructor(scene) {
    this.mesh = new THREE.Group();
    const cube = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.16), lambert('#fffaf0'));
    cube.castShadow = true;
    this.mesh.add(cube);
    const pipGeo = new THREE.CircleGeometry(0.085, 14);
    const dark = new THREE.MeshBasicMaterial({ color: '#23302e' });
    const red = new THREE.MeshBasicMaterial({ color: '#d8352c' });
    for (const [v, n] of Object.entries(FACE_NORMALS)) {
      for (const [a, b] of PIPS[v]) {
        const pip = new THREE.Mesh(pipGeo, v === '1' ? red : dark);
        if (v === '1') pip.scale.setScalar(1.6);
        pip.position.copy(n).multiplyScalar(0.502);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        pip.quaternion.copy(q);
        const u = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        const w = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        pip.position.addScaledVector(u, a * 0.26).addScaledVector(w, b * 0.26);
        this.mesh.add(pip);
      }
    }
    this.mesh.scale.setScalar(0.9);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Throws the die from `from` to land at `to` showing `value` on top. */
  async throw(anim, from, to, value) {
    const m = this.mesh;
    this.tok = (this.tok || 0) + 1;
    m.visible = true;
    m.scale.setScalar(0.9);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    const final = yaw.multiply(new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[value], new THREE.Vector3(0, 1, 0)));
    const axis = new THREE.Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize();
    const spins = 3 + Math.random() * 2;
    const tmp = new THREE.Quaternion();
    const rest = to.clone().setY(0.45);
    await anim.tween(0.95, (k) => {
      const e = ease.outCubic(k);
      m.position.lerpVectors(from, rest, e);
      // two bounces
      const h = k < 0.55 ? Math.sin((k / 0.55) * Math.PI) * 2.4 : Math.sin(((k - 0.55) / 0.45) * Math.PI) * 0.55;
      m.position.y = rest.y + h * (1 - e * 0.2);
      tmp.setFromAxisAngle(axis, (1 - e) * spins * Math.PI * 2);
      m.quaternion.copy(final).premultiply(tmp);
    });
    m.quaternion.copy(final);
    m.position.copy(rest);
  }

  hide(anim) {
    const m = this.mesh;
    if (!m.visible) return;
    const tok = (this.tok = (this.tok || 0) + 1);
    anim.fx(0.25, (k) => tok === this.tok && m.scale.setScalar(Math.max(0.001, 0.9 * (1 - k))), ease.inQuad);
    setTimeout(() => tok === this.tok && (m.visible = false), 300);
  }

  reset() {
    this.tok = (this.tok || 0) + 1;
    this.mesh.visible = false;
  }
}

/* ------------------------------------------------------- collectibles */
export class Collectible {
  constructor(scene, tile, kind) {
    this.tile = tile;
    this.kind = kind;
    this.g = new THREE.Group();
    if (kind === 'mango') {
      const fruit = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 16, 12),
        new THREE.MeshPhongMaterial({ color: '#ffbf2e', emissive: '#ff8a00', emissiveIntensity: 0.35, shininess: 80 }),
      );
      fruit.scale.set(0.85, 1, 0.78);
      fruit.castShadow = true;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lambert('#3fa047'));
      leaf.scale.set(0.5, 0.18, 1.3);
      leaf.position.set(0.1, 0.42, 0);
      leaf.rotation.z = -0.5;
      this.g.add(fruit, leaf);
    } else {
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshPhongMaterial({ color: '#5cc4ff', emissive: '#1f6fb5', emissiveIntensity: 0.45, shininess: 100, flatShading: true }),
      );
      gem.scale.set(0.8, 1.15, 0.8);
      gem.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 28), lambert('#ffffff', { emissive: '#7fd0ff', emissiveIntensity: 0.6 }));
      ring.rotation.x = Math.PI / 2;
      this.g.add(gem, ring);
      this.ring = ring;
    }
    this.home = tilePos(tile).add(new THREE.Vector3(0, 1.25, 0));
    this.g.position.copy(this.home);
    this.phase = tile * 0.7;
    this.taken = false;
    scene.add(this.g);
  }

  update(dt) {
    if (this.taken) return;
    this.phase += dt;
    this.g.position.y = this.home.y + Math.sin(this.phase * 2) * 0.15;
    this.g.rotation.y += dt * 1.2;
    if (this.ring) this.ring.rotation.z += dt;
  }

  async collect(anim, target) {
    this.taken = true;
    const from = this.g.position.clone();
    await anim.tween(0.45, (k) => {
      this.g.position.lerpVectors(from, target, k);
      this.g.position.y += Math.sin(Math.PI * k) * 0.8;
      this.g.scale.setScalar(1 - k * 0.85);
    }, ease.inOutQuad);
    this.g.visible = false;
  }

  reset() {
    this.taken = false;
    this.g.visible = true;
    this.g.scale.setScalar(1);
    this.g.position.copy(this.home);
  }
}

/* ------------------------------------------------------ reach markers */
const KIND_COLORS = { good: '#ffc83a', bad: '#ff6b5e', plain: '#ffffff', win: '#5ee07a' };

export class ReachMarkers {
  constructor(scene, font) {
    this.items = [];
    for (let i = 1; i <= 6; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.7, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
      ring.position.y = 0.04;
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(64, 64, 56, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#3a2a18';
      x.font = `700 76px ${font}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(String(i), 64, 70);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.scale.setScalar(0.9);
      sprite.position.y = 2.1;
      g.add(ring, sprite);
      g.visible = false;
      scene.add(g);
      this.items.push({ g, ring, sprite, t: 0 });
    }
    this.time = 0;
  }

  show(list) {
    list.forEach((o, i) => {
      const it = this.items[i];
      tilePos(o.tile, it.g.position);
      // stacked previews after a bounce share a tile; lift duplicates
      const dup = list.slice(0, i).filter((p) => p.tile === o.tile).length;
      it.sprite.position.y = 2.1 + dup * 0.9;
      it.ring.material.color.set(KIND_COLORS[o.kind]);
      it.sprite.material.color.set(o.kind === 'plain' ? '#ffffff' : KIND_COLORS[o.kind]);
      it.g.visible = true;
      it.t = -i * 0.05;
    });
  }

  hide() {
    for (const it of this.items) it.g.visible = false;
  }

  update(dt) {
    this.time += dt;
    for (const it of this.items) {
      if (!it.g.visible) continue;
      it.t += dt;
      const pop = ease.outBack(Math.min(1, Math.max(0, it.t / 0.3)));
      it.g.scale.setScalar(Math.max(0.001, pop));
      it.sprite.position.y += Math.sin(this.time * 3 + it.g.position.x) * 0.002;
    }
  }
}

/* ------------------------------------------------------------ particles */
export class Particles {
  constructor(scene, max = 360) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshLambertMaterial({ color: '#ffffff' }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.p = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.color = new THREE.Color();
    this.mesh.setColorAt(0, this.color.set('#ffffff'));
    scene.add(this.mesh);
  }

  emit(pos, n, colors, { speed = 3, up = 3, gravity = 9, life = 1, size = 1, flat = false } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.p.push({
        pos: pos.clone(),
        vel: new THREE.Vector3(Math.cos(a) * sp, up * (0.5 + Math.random()), Math.sin(a) * sp),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        spin: (Math.random() - 0.5) * 12,
        life,
        age: 0,
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[Math.floor(Math.random() * colors.length)],
        flat,
        gravity,
      });
    }
  }

  update(dt) {
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const o = this.p[i];
      o.age += dt;
      if (o.age >= o.life) { this.p.splice(i, 1); continue; }
      o.vel.y -= o.gravity * dt;
      if (o.flat) o.vel.multiplyScalar(Math.exp(-dt * 1.5));
      o.pos.addScaledVector(o.vel, dt);
      if (o.pos.y < 0.05 && !o.flat) { o.pos.y = 0.05; o.vel.y *= -0.3; o.vel.x *= 0.7; o.vel.z *= 0.7; }
      o.rot.x += o.spin * dt;
      o.rot.y += o.spin * dt * 0.7;
      const k = 1 - o.age / o.life;
      const sc = o.size * Math.min(1, k * 3);
      this.s.set(sc * (o.flat ? 1.6 : 1), sc * (o.flat ? 0.15 : 1), sc * (o.flat ? 1.1 : 1));
      this.m.compose(o.pos, this.q.setFromEuler(o.rot), this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, this.color.set(o.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.p.length = 0;
    this.mesh.count = 0;
  }
}
