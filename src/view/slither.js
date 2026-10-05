// Snake locomotion: real "follow-the-leader" crawling.
// The body is always a window [sHead - L, sHead] of one fixed track, so every
// part of the body passes exactly where the head went (lateral undulation),
// instead of morphing or sliding sideways.
import * as THREE from 'three';

export class Track {
  /** @param {THREE.Vector3[]} pts polyline in travel order (y ignored) */
  constructor(pts) {
    this.p = [];
    for (const v of pts) {
      const last = this.p[this.p.length - 1];
      if (!last || Math.hypot(v.x - last.x, v.z - last.z) > 1e-4) this.p.push(new THREE.Vector3(v.x, 0, v.z));
    }
    this.cum = new Float64Array(this.p.length);
    for (let i = 1; i < this.p.length; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(this.p[i].x - this.p[i - 1].x, this.p[i].z - this.p[i - 1].z);
    this.length = this.cum[this.p.length - 1];
  }

  at(s, out = new THREE.Vector3()) {
    const { p, cum } = this;
    if (s <= 0) return out.copy(p[0]);
    if (s >= this.length) return out.copy(p[p.length - 1]);
    let lo = 0;
    let hi = p.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const k = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return out.lerpVectors(p[lo], p[hi], k);
  }

  /** Fills `out` (head first) with the body window ending at sHead. */
  sampleBody(sHead, L, out) {
    const n = out.length - 1;
    for (let i = 0; i <= n; i++) this.at(sHead - (L * i) / n, out[i]);
    return out;
  }
}

export const polyLength = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return L;
};

/* ------------------------------------------------------------------ Dubins paths
 * Shortest route between two poses using only arcs of radius R and straights.
 * Gives the snake smooth turns with a believable minimum turning radius.
 * Poses are (x, z, heading) with heading = atan2(dz, dx).
 */
const TAU = Math.PI * 2;
const mod2pi = (a) => ((a % TAU) + TAU) % TAU;

function dubinsWords(alpha, beta, d) {
  const sa = Math.sin(alpha), sb = Math.sin(beta), ca = Math.cos(alpha), cb = Math.cos(beta);
  const cab = Math.cos(alpha - beta);
  const out = [];
  let p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
  if (p2 >= 0) {
    const t1 = Math.atan2(cb - ca, d + sa - sb);
    out.push(['LSL', mod2pi(-alpha + t1), Math.sqrt(p2), mod2pi(beta - t1)]);
  }
  p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
  if (p2 >= 0) {
    const t1 = Math.atan2(ca - cb, d - sa + sb);
    out.push(['RSR', mod2pi(alpha - t1), Math.sqrt(p2), mod2pi(-beta + t1)]);
  }
  p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
  if (p2 >= 0) {
    const p = Math.sqrt(p2);
    const t2 = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
    out.push(['LSR', mod2pi(-alpha + t2), p, mod2pi(-mod2pi(beta) + t2)]);
  }
  p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb);
  if (p2 >= 0) {
    const p = Math.sqrt(p2);
    const t2 = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
    out.push(['RSL', mod2pi(alpha - t2), p, mod2pi(beta - t2)]);
  }
  let tmp = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8;
  if (Math.abs(tmp) <= 1) {
    const p = mod2pi(TAU - Math.acos(tmp));
    const t = mod2pi(alpha - Math.atan2(ca - cb, d - sa + sb) + p / 2);
    out.push(['RLR', t, p, mod2pi(alpha - beta - t + p)]);
  }
  tmp = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8;
  if (Math.abs(tmp) <= 1) {
    const p = mod2pi(TAU - Math.acos(tmp));
    const t = mod2pi(-alpha - Math.atan2(ca - cb, d + sa - sb) + p / 2);
    out.push(['LRL', t, p, mod2pi(mod2pi(beta) - alpha - t + p)]);
  }
  return out;
}

/** All valid Dubins paths from pose a to pose b, each sampled every `step` units. */
export function dubinsPaths(a, b, R, step = 0.1) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const D = Math.hypot(dx, dz);
  const d = D / R;
  const theta = mod2pi(Math.atan2(dz, dx));
  const alpha = mod2pi(a.h - theta);
  const beta = mod2pi(b.h - theta);
  const paths = [];
  for (const [word, ...lens] of dubinsWords(alpha, beta, d)) {
    let x = a.x, z = a.z, h = a.h;
    const pts = [new THREE.Vector3(x, 0, z)];
    const segs = [];
    for (let k = 0; k < 3; k++) {
      const type = word[k];
      const L = lens[k] * R;
      const start = pts.length - 1;
      const n = Math.max(1, Math.ceil(L / step));
      for (let i = 1; i <= n; i++) {
        const l = L / n;
        if (type === 'S') {
          x += Math.cos(h) * l;
          z += Math.sin(h) * l;
        } else {
          const dir = type === 'L' ? 1 : -1;
          const dh = (l / R) * dir;
          x += R * dir * (Math.sin(h + dh) - Math.sin(h));
          z += R * dir * (-Math.cos(h + dh) + Math.cos(h));
          h += dh;
        }
        pts.push(new THREE.Vector3(x, 0, z));
      }
      segs.push({ type, from: start, to: pts.length - 1, length: L });
    }
    const err = Math.hypot(x - b.x, z - b.z);
    if (err < 1e-3 * Math.max(1, D)) paths.push({ word, pts, segs, length: lens.reduce((s, v) => s + v, 0) * R });
  }
  return paths;
}

const poseFrom = (p, dir) => ({ x: p.x, z: p.z, h: Math.atan2(dir.z, dir.x) });

/** Adds a gentle S-wave on long straight stretches (fixed in space, so the body still follows the head). */
function waveStraights(path) {
  const pts = path.pts.map((p) => p.clone());
  for (const seg of path.segs) {
    if (seg.type !== 'S' || seg.length < 3.2) continue;
    const a = path.pts[seg.from];
    const b = path.pts[seg.to];
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const waves = Math.max(1, Math.round(seg.length / 6.5));
    const amp = Math.min(0.5, seg.length * 0.06);
    for (let i = seg.from + 1; i < seg.to; i++) {
      const u = (i - seg.from) / (seg.to - seg.from);
      pts[i].addScaledVector(perp, Math.sin(u * Math.PI * 2 * waves) * amp * Math.sin(Math.PI * u) ** 2);
    }
  }
  return pts;
}

/**
 * Plans a crawl from the snake's current body to a new resting body.
 * Both bodies are given head-first. Returns the track, head start/end
 * arc positions and body lengths at start and end.
 *
 * The connector from the old head to the new tail is a Dubins path (minimum
 * turning radius R), optionally through a detour point, chosen to stay on the
 * board, keep clear of pawns and be as short as possible.
 */
export function planCrawl(oldBody, newBody, { avoid = [], bound = 19.6, R = 1.7 } = {}) {
  const oldRev = oldBody.slice().reverse(); // tail -> head
  const newRev = newBody.slice().reverse(); // tail -> head
  const L0 = polyLength(oldRev);
  const L1 = polyLength(newRev);
  const P0 = oldRev[oldRev.length - 1];
  const P1 = newRev[0];
  const t0 = new THREE.Vector3().subVectors(P0, oldRev[oldRev.length - 4]).setY(0).normalize();
  const t1 = new THREE.Vector3().subVectors(newRev[3], P1).setY(0).normalize();
  const A = poseFrom(P0, t0);
  const B = poseFrom(P1, t1);

  const cost = (pts, length) => {
    let c = length;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const p = pts[i];
      for (const q of avoid) {
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        if (d < 1.9) c += (1.9 - d) * 12;
      }
      const ex = Math.max(0, Math.abs(p.x) - bound) + Math.max(0, Math.abs(p.z) - bound);
      c += ex * 40;
    }
    return c;
  };

  let best = null;
  const consider = (pts, length, segs) => {
    const c = cost(pts, length);
    if (!best || c < best.cost) best = { cost: c, pts, segs, length };
  };
  for (const p of dubinsPaths(A, B, R)) consider(p.pts, p.length, p.segs);
  // detours through a waypoint beside the direct line (for pawns or board edges)
  const chord = new THREE.Vector3(P1.x - P0.x, 0, P1.z - P0.z);
  const len = chord.length();
  if (len > 1e-3) {
    chord.normalize();
    const side = new THREE.Vector3(-chord.z, 0, chord.x);
    const mid = new THREE.Vector3((P0.x + P1.x) / 2, 0, (P0.z + P1.z) / 2);
    for (const off of [-6, -3.5, 3.5, 6]) {
      for (const along of [-0.25, 0.25]) {
        const W = mid.clone().addScaledVector(side, off).addScaledVector(chord, along * len);
        if (Math.abs(W.x) > bound || Math.abs(W.z) > bound) continue;
        for (const wdir of [chord, side.clone().multiplyScalar(Math.sign(off))]) {
          const Wp = poseFrom(W, wdir);
          const first = dubinsPaths(A, Wp, R);
          const second = dubinsPaths(Wp, B, R);
          if (!first.length || !second.length) continue;
          const f = first.reduce((m, p) => (p.length < m.length ? p : m));
          const g = second.reduce((m, p) => (p.length < m.length ? p : m));
          const offset = f.pts.length - 1;
          const segs = [...f.segs, ...g.segs.map((s) => ({ ...s, from: s.from + offset, to: s.to + offset }))];
          consider([...f.pts, ...g.pts.slice(1)], f.length + g.length, segs);
        }
      }
    }
  }
  const connector = waveStraights(best);
  const track = new Track([...oldRev, ...connector.slice(1, -1), ...newRev]);
  return { track, s0: L0, s1: track.length, L0, L1, connector };
}

/** Distance profile with gentle acceleration, cruise and deceleration (0..1 -> 0..1). */
export function cruise(t, a = 0.18, b = 0.24) {
  const v = 1 / (1 - a / 2 - b / 2);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < a) return (v * t * t) / (2 * a);
  if (t < 1 - b) return v * (a / 2 + (t - a));
  const u = 1 - t;
  return 1 - (v * u * u) / (2 * b);
}

/* ------------------------------------------------------------- menu roaming */

/** A track that keeps growing at the front and is trimmed behind the tail. Arc positions stay absolute. */
export class GrowTrack {
  constructor(pts) {
    this.p = [];
    this.cum = [];
    this.append(pts);
  }

  append(pts) {
    for (const v of pts) {
      const n = this.p.length;
      const last = this.p[n - 1];
      if (last) {
        const d = Math.hypot(v.x - last.x, v.z - last.z);
        if (d < 1e-4) continue;
        this.cum.push(this.cum[n - 1] + d);
      } else this.cum.push(0);
      this.p.push(new THREE.Vector3(v.x, 0, v.z));
    }
  }

  get start() {
    return this.cum[0];
  }

  get end() {
    return this.cum[this.cum.length - 1];
  }

  /** Drops points that lie entirely behind arc position `s`. */
  trim(s) {
    let k = 0;
    while (k < this.p.length - 2 && this.cum[k + 1] < s) k++;
    if (k > 0) {
      this.p.splice(0, k);
      this.cum.splice(0, k);
    }
  }

  at(s, out = new THREE.Vector3()) {
    const { p, cum } = this;
    if (s <= cum[0]) return out.copy(p[0]);
    if (s >= cum[cum.length - 1]) return out.copy(p[p.length - 1]);
    let lo = 0;
    let hi = p.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const k = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return out.lerpVectors(p[lo], p[hi], k);
  }

  sampleBody(sHead, L, out) {
    const n = out.length - 1;
    for (let i = 0; i <= n; i++) this.at(sHead - (L * i) / n, out[i]);
    return out;
  }

  /** Position and heading at the front of the track. */
  endPose() {
    const n = this.p.length;
    const b = this.p[n - 1];
    const a = this.p[Math.max(0, n - 4)];
    return { x: b.x, z: b.z, h: Math.atan2(b.z - a.z, b.x - a.x) };
  }
}

/**
 * Picks the next leg of a roaming snake: a smooth Dubins path to a random spot
 * on the board, preferring legs that stay on the board, steer clear of props
 * (towers, trees, posts) and keep away from the other snakes.
 * @param pose {x, z, h} start pose (front of the current track)
 * @param opts.obstacles [{x, z, r}]  opts.others [{x, z}]  opts.rng () => 0..1
 */
export function planWanderLeg(pose, { obstacles = [], others = [], rng = Math.random, bound = 17.6, R = 1.9 } = {}) {
  let best = null;
  const limit = bound + 1.1;
  for (let c = 0; c < 14; c++) {
    const target = { x: (rng() * 2 - 1) * bound, z: (rng() * 2 - 1) * bound, h: rng() * Math.PI * 2 };
    const d = Math.hypot(target.x - pose.x, target.z - pose.z);
    if (d < 5) continue;
    // normal turning radius, or a tighter turn when hemmed in by the board edge
    const paths = [
      ...dubinsPaths(pose, target, R, 0.12),
      ...dubinsPaths(pose, target, R * 0.68, 0.12).map((p) => ({ ...p, tight: 3 })),
      ...dubinsPaths(pose, target, R * 0.5, 0.12).map((p) => ({ ...p, tight: 7 })),
    ];
    if (!paths.length) continue;
    for (const path of paths) {
    let cost = Math.abs(path.length - 15) * 0.25 + (path.tight || 0);
    // don't end a leg facing the board edge: the next leg would need a hairpin there
    const ahead = { x: target.x + Math.cos(target.h) * 5, z: target.z + Math.sin(target.h) * 5 };
    cost += (Math.max(0, Math.abs(ahead.x) - bound) + Math.max(0, Math.abs(ahead.z) - bound)) * 6;
    const pts = path.pts;
    for (let i = 2; i < pts.length; i += 3) {
      const p = pts[i];
      const ex = Math.max(0, Math.abs(p.x) - limit) + Math.max(0, Math.abs(p.z) - limit);
      cost += ex * 60;
      for (const o of obstacles) {
        const dd = Math.hypot(p.x - o.x, p.z - o.z);
        const clear = o.r + 0.9;
        if (dd < clear) cost += (clear - dd) * 25;
      }
      for (const o of others) {
        const dd = Math.hypot(p.x - o.x, p.z - o.z);
        if (dd < 2.4) cost += (2.4 - dd) * 4;
      }
    }
    if (!best || cost < best.cost) best = { cost, path };
    }
  }
  if (!best) {
    // fallback: a gentle arc back toward the middle of the board
    const back = { x: pose.x * 0.3, z: pose.z * 0.3, h: Math.atan2(-pose.z, -pose.x) };
    const p = dubinsPaths(pose, back, R, 0.12);
    if (!p.length) {
      const pts = [];
      for (let i = 0; i <= 40; i++) pts.push(new THREE.Vector3(pose.x + Math.cos(pose.h) * i * 0.1, 0, pose.z + Math.sin(pose.h) * i * 0.1));
      return pts;
    }
    best = { path: p.reduce((m, q) => (q.length < m.length ? q : m)) };
  }
  return waveStraights(best.path);
}
