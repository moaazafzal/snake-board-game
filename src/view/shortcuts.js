// Rope bridges, swinging vines and zip lines. Each exposes `ride(pawn, anim)`.
import * as THREE from 'three';
import { tilePos, pawnSpot } from './layout.js';
import { ease, span, lerp } from '../anim.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const WOOD = lambert('#9a6a3c');
const WOOD_DARK = lambert('#6b4424');
const ROPE = lambert('#d8c08a');
const UP = new THREE.Vector3(0, 1, 0);

function tube(points, radius, mat, seg = 40) {
  const curve = points instanceof THREE.Curve ? points : new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 5, false), mat);
  m.castShadow = true;
  return m;
}

function post(h, r = 0.14, mat = WOOD_DARK) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 6).translate(0, h / 2, 0), mat);
  m.castShadow = true;
  return m;
}

/** a cylinder from a to b (unit cylinder stretched each frame, used for the vine) */
function segmentMesh(mat, r = 0.07) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6).translate(0, 0.5, 0), mat);
  m.castShadow = true;
  m.setEnds = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length() || 0.001;
    m.position.copy(a);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  };
  return m;
}

export function buildShortcut(scene, sc) {
  if (sc.kind === 'bridge') return new Bridge(scene, sc);
  if (sc.kind === 'vine') return new Vine(scene, sc);
  return new Zip(scene, sc);
}

class Bridge {
  constructor(scene, sc) {
    this.sc = sc;
    const A = tilePos(sc.from);
    const B = tilePos(sc.to);
    const len = A.distanceTo(B);
    const dir = B.clone().sub(A).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const arch = 1.4 + len * 0.07;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(A.clone().lerp(B, t).setY(0.25 + Math.sin(Math.PI * t) * arch));
    }
    this.curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.Group();
    const planks = Math.floor(len / 0.5);
    const plankMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.12, 0.38), WOOD, planks);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tint = new THREE.Color();
    for (let i = 0; i < planks; i++) {
      const t = (i + 0.5) / planks;
      const p = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      q.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), tan, UP));
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      plankMesh.setMatrixAt(i, m);
      plankMesh.setColorAt(i, tint.set('#ffffff').offsetHSL(0, 0, (Math.sin(i * 7.1) - 0.5) * 0.08));
    }
    plankMesh.castShadow = true;
    plankMesh.receiveShadow = true;
    g.add(plankMesh);
    for (const s of [-1, 1]) {
      const rail = this.curve.getSpacedPoints(24).map((p) => p.clone().addScaledVector(side, s * 0.95).add(new THREE.Vector3(0, 0.95, 0)));
      g.add(tube(rail, 0.05, ROPE, 48));
      const low = this.curve.getSpacedPoints(24).map((p) => p.clone().addScaledVector(side, s * 0.85).add(new THREE.Vector3(0, 0.05, 0)));
      g.add(tube(low, 0.035, ROPE, 48));
      for (const [P, d] of [[A, 1], [B, -1]]) {
        const pst = post(1.6);
        pst.position.copy(P).addScaledVector(side, s * 0.95).addScaledVector(dir, d * 0.25);
        g.add(pst);
      }
      // hangers
      for (let i = 1; i < 12; i++) {
        const p = this.curve.getPointAt(i / 12).addScaledVector(side, s * 0.92);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 4).translate(0, 0.47, 0), ROPE);
        h.position.copy(p);
        g.add(h);
      }
    }
    scene.add(g);
    this.len = this.curve.getLength();
  }

  async ride(pawn, anim, player) {
    const start = pawn.root.position.clone();
    const end = pawnSpot(this.sc.to, player);
    const first = this.curve.getPointAt(0);
    const dur = Math.max(1.6, this.len / 3.4);
    await anim.tween(0.35, (k) => {
      pawn.root.position.lerpVectors(start, first, k).y += Math.sin(Math.PI * k) * 0.6;
    }, ease.outQuad);
    let lastStep = 0;
    await anim.tween(dur, (k) => {
      const p = this.curve.getPointAt(k);
      const tan = this.curve.getTangentAt(Math.min(0.999, k));
      pawn.root.position.copy(p);
      pawn.root.position.y += Math.abs(Math.sin(k * this.len * 2.2)) * 0.12;
      pawn.faceDir(tan);
      pawn.walkCycle(k * this.len * 2.2);
      if (k - lastStep > 0.08) { lastStep = k; pawn.onStep?.(); }
    }, ease.inOutSine);
    const last = pawn.root.position.clone();
    await anim.tween(0.35, (k) => {
      pawn.root.position.lerpVectors(last, end, k).y += Math.sin(Math.PI * k) * 0.5;
    }, ease.outQuad);
    pawn.walkCycle(0);
  }
}

class Vine {
  constructor(scene, sc) {
    this.sc = sc;
    const A = tilePos(sc.from);
    const B = tilePos(sc.to);
    const mid = A.clone().lerp(B, 0.5);
    const dir = B.clone().sub(A).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    this.pivot = mid.clone().setY(10.5);
    // a tall tree beside the midpoint with a branch reaching over it
    const g = new THREE.Group();
    const base = mid.clone().addScaledVector(side, 3.4);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.75, 13.8, 7).translate(0, 6.9, 0), lambert('#7a5232'));
    trunk.position.copy(base).setY(-1.8);
    trunk.castShadow = true;
    g.add(trunk);
    const branchStart = base.clone().setY(10.8);
    g.add(tube([branchStart, branchStart.clone().lerp(this.pivot, 0.5).setY(11.3), this.pivot.clone().setY(10.6)], 0.22, lambert('#6e4a2c'), 12));
    const crownMat = lambert('#3f9a4a');
    for (const [dx, dy, dz, s] of [[0, 12.6, 0, 2.6], [1.6, 11.8, 0.8, 1.8], [-1.4, 12, -0.6, 2], [0, 11.2, -1.8, 1.6]]) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), crownMat);
      c.position.copy(base).add(new THREE.Vector3(dx, dy, dz));
      c.castShadow = true;
      g.add(c);
    }
    const leafy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), lambert('#4fae4f'));
    leafy.position.copy(this.pivot).setY(10.9);
    g.add(leafy);
    scene.add(g);
    this.vine = segmentMesh(lambert('#3e8a33'), 0.07);
    scene.add(this.vine);
    this.leaves = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), lambert('#5cbf48'));
      l.scale.set(1, 0.4, 1.8);
      scene.add(l);
      this.leaves.push(l);
    }
    this.restEnd = this.pivot.clone().setY(2.2);
    this.end = this.restEnd.clone();
    this.sway = Math.random() * 6;
    this.busy = false;
    this.A = A;
    this.B = B;
    this.place();
  }

  reset() {
    this.busy = false;
    this.end.copy(this.restEnd);
    this.place();
  }

  place() {
    this.vine.setEnds(this.pivot, this.end);
    this.leaves.forEach((l, i) => {
      const t = (i + 1) / 6;
      l.position.lerpVectors(this.pivot, this.end, t);
      l.position.x += (i % 2 ? 0.12 : -0.12);
      l.rotation.y = i * 1.3;
    });
  }

  update(dt) {
    if (this.busy) return;
    this.sway += dt;
    this.end.copy(this.restEnd);
    this.end.x += Math.sin(this.sway * 0.9) * 0.35;
    this.end.z += Math.cos(this.sway * 0.7) * 0.25;
    this.place();
  }

  async ride(pawn, anim, player) {
    this.busy = true;
    try {
      const start = pawn.root.position.clone();
      const hangA = this.A.clone().setY(2.3);
      const from = this.end.clone();
      // vine swings over to the pawn
      await anim.tween(0.6, (k) => {
        this.end.lerpVectors(from, hangA, k);
        this.place();
      }, ease.inOutSine);
      // jump up and grab
      await anim.tween(0.35, (k) => {
        pawn.root.position.lerpVectors(start, hangA.clone().setY(1.1), k).y += Math.sin(Math.PI * k) * 0.8;
        pawn.setArms(-2.6 * k);
      }, ease.outQuad);
      // pendulum swing to the destination
      const hangB = this.B.clone().setY(2.3);
      const dir = this.B.clone().sub(this.A).normalize();
      await anim.tween(1.9, (k) => {
        const hand = this.A.clone().lerp(this.B, k);
        hand.y = 2.3 - Math.sin(Math.PI * k) * 0.7;
        this.end.copy(hand);
        this.place();
        pawn.root.position.copy(hand).setY(hand.y - 1.2);
        pawn.faceDir(dir);
        pawn.root.rotation.z = Math.sin(k * Math.PI * 2) * 0.12;
        pawn.legSwing(Math.sin(k * Math.PI * 3) * 0.6);
      }, ease.inOutSine);
      // let go
      const land = pawnSpot(this.sc.to, player);
      const p0 = pawn.root.position.clone();
      anim.fx(0.9, (k) => {
        this.end.lerpVectors(hangB, this.restEnd, k);
        this.end.x += Math.sin(k * Math.PI * 3) * (1 - k) * 0.8;
        this.place();
      }, ease.outQuad);
      await anim.tween(0.4, (k) => {
        pawn.root.position.lerpVectors(p0, land, k).y += Math.sin(Math.PI * k) * 0.5;
        pawn.setArms(-2.6 * (1 - k));
        pawn.root.rotation.z = 0;
      }, ease.outQuad);
      pawn.legSwing(0);
      await anim.wait(0.45);
    } finally {
      this.busy = false;
    }
  }
}

class Zip {
  constructor(scene, sc) {
    this.sc = sc;
    const A = tilePos(sc.from);
    const B = tilePos(sc.to);
    const dir = B.clone().sub(A).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    this.towerPos = A.clone().addScaledVector(dir, -1.35);
    const H = 6;
    const g = new THREE.Group();
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = post(H + 2.0, 0.13); // reaches the ground even when the tower overhangs the board edge
      leg.position.copy(this.towerPos).addScaledVector(side, dx * 0.85).addScaledVector(dir, dz * 0.85).setY(-1.8);
      g.add(leg);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 2.3), WOOD);
    deck.position.copy(this.towerPos).setY(H);
    deck.lookAt(deck.position.clone().add(dir));
    deck.castShadow = true;
    g.add(deck);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.2, 4), lambert('#c0583a'));
    roof.position.copy(this.towerPos).setY(H + 2.4);
    roof.rotation.y = Math.PI / 4 + Math.atan2(dir.x, dir.z);
    roof.castShadow = true;
    g.add(roof);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = post(1.8, 0.07);
      p.position.copy(this.towerPos).setY(H).addScaledVector(side, dx * 1.0).addScaledVector(dir, dz * 1.0);
      g.add(p);
    }
    // ladder on the side facing tile A
    const ladderBase = this.towerPos.clone().addScaledVector(dir, 1.05);
    this.ladderBase = ladderBase;
    for (const s of [-1, 1]) {
      const rail = post(H, 0.05, WOOD);
      rail.position.copy(ladderBase).addScaledVector(side, s * 0.4);
      g.add(rail);
    }
    for (let i = 1; i < 12; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.07), WOOD);
      rung.position.copy(ladderBase).setY(i * 0.5);
      rung.lookAt(rung.position.clone().add(dir));
      rung.rotateY(Math.PI / 2);
      g.add(rung);
    }
    // landing pole at B
    this.poleTop = B.clone().addScaledVector(dir, 1.4).setY(3.1);
    const pole = post(3.3, 0.16);
    pole.position.copy(B).addScaledVector(dir, 1.4);
    g.add(pole);
    const cableStart = this.towerPos.clone().setY(H + 1.5);
    const mid = cableStart.clone().lerp(this.poleTop, 0.5);
    mid.y -= 0.8;
    this.cable = new THREE.QuadraticBezierCurve3(cableStart, mid, this.poleTop);
    g.add(tube(this.cable, 0.045, lambert('#3a3a3a'), 40));
    this.pulley = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 6, 12), lambert('#e2b23a'));
    this.pulley.position.copy(cableStart);
    g.add(this.pulley);
    scene.add(g);
    this.H = H;
    this.dir = dir;
  }

  reset() {
    this.pulley.position.copy(this.cable.getPointAt(0));
  }

  async ride(pawn, anim, player) {
    const start = pawn.root.position.clone();
    const foot = this.ladderBase.clone().addScaledVector(this.dir, 0.45).setY(0);
    await anim.tween(0.35, (k) => {
      pawn.root.position.lerpVectors(start, foot, k).y += Math.sin(Math.PI * k) * 0.4;
    }, ease.outQuad);
    pawn.faceDir(this.dir.clone().negate());
    // climb
    await anim.tween(1.1, (k) => {
      pawn.root.position.copy(foot).setY(k * (this.H + 0.1));
      pawn.setArms(-2.4 + Math.sin(k * 26) * 0.5);
      pawn.legSwing(Math.sin(k * 26) * 0.5);
    }, ease.inOutSine);
    const top = this.cable.getPointAt(0);
    const p1 = pawn.root.position.clone();
    await anim.tween(0.4, (k) => {
      pawn.root.position.lerpVectors(p1, top.clone().setY(top.y - 1.5), k);
      pawn.setArms(-2.8);
    }, ease.inOutQuad);
    pawn.faceDir(this.dir);
    // slide down the cable
    let whoosh = 0;
    await anim.tween(1.5, (k) => {
      const p = this.cable.getPointAt(k);
      this.pulley.position.copy(p);
      pawn.root.position.copy(p).setY(p.y - 1.5);
      pawn.root.rotation.x = Math.sin(k * Math.PI) * 0.25;
      pawn.legSwing(Math.sin(k * 20) * 0.3);
      if (k - whoosh > 0.25) { whoosh = k; pawn.onStep?.(); }
    }, ease.inCubic);
    pawn.root.rotation.x = 0;
    const p2 = pawn.root.position.clone();
    const end = pawnSpot(this.sc.to, player);
    anim.fx(1.2, (k) => this.pulley.position.copy(this.cable.getPointAt(1 - ease.inOutSine(k))));
    await anim.tween(0.45, (k) => {
      pawn.root.position.lerpVectors(p2, end, k).y += Math.sin(Math.PI * k) * 0.3;
      pawn.setArms(-2.8 * (1 - k));
    }, ease.outQuad);
    pawn.legSwing(0);
  }
}
