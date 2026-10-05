import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Track, planCrawl, cruise, polyLength } from '../src/view/slither.js';
import { spineFor, bodyLengthFor } from '../src/view/snake.js';
import { SNAKES } from '../src/game/board.js';

const RINGS = 150;
const body = () => Array.from({ length: RINGS + 1 }, () => new THREE.Vector3());

describe('Track', () => {
  it('interpolates by arc length', () => {
    const t = new Track([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 0, 10)]);
    expect(t.length).toBeCloseTo(20);
    expect(t.at(5).x).toBeCloseTo(5);
    expect(t.at(15).z).toBeCloseTo(5);
    expect(t.at(-3).x).toBe(0);
    expect(t.at(99).z).toBe(10);
  });
  it('samples an evenly spaced body window', () => {
    const t = new Track([new THREE.Vector3(0, 0, 0), new THREE.Vector3(30, 0, 0)]);
    const b = t.sampleBody(20, 10, body());
    expect(b[0].x).toBeCloseTo(20);
    expect(b[RINGS].x).toBeCloseTo(10);
    expect(b[75].x).toBeCloseTo(15);
  });
});

describe('cruise profile', () => {
  it('is monotonic from 0 to 1 with no jumps', () => {
    let prev = 0;
    for (let i = 1; i <= 1000; i++) {
      const v = cruise(i / 1000);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v - prev).toBeLessThan(0.002);
      prev = v;
    }
    expect(cruise(0)).toBe(0);
    expect(cruise(1)).toBe(1);
  });
});

describe('snake crawl between lairs', () => {
  const cases = [];
  SNAKES.forEach((s, i) => {
    cases.push([s.name, i, 0, 1]);
    cases.push([s.name, i, 1, 0]);
  });
  it.each(cases)('%s (snake %i) route %i -> %i crawls head-first without sliding', (_n, i, from, to) => {
    const seed = i * 1.7;
    const BL = bodyLengthFor(SNAKES[i], seed);
    const A = spineFor(SNAKES[i].routes[from].head, SNAKES[i].routes[from].tail, seed, BL);
    const B = spineFor(SNAKES[i].routes[to].head, SNAKES[i].routes[to].tail, seed, BL);
    const plan = planCrawl(A, B, { avoid: [new THREE.Vector3(-17.25, 0, 23.95)] });
    const travel = plan.s1 - plan.s0;
    const frames = 300;
    let prev = null;
    let maxStep = 0;
    let worstSlip = 0;
    for (let f = 0; f <= frames; f++) {
      const k = cruise(f / frames);
      const b = plan.track.sampleBody(plan.s0 + travel * k, THREE.MathUtils.lerp(plan.L0, plan.L1, k), body());
      if (f === 0) for (let r = 0; r <= RINGS; r++) expect(b[r].distanceTo(new THREE.Vector3(A[r].x, 0, A[r].z))).toBeLessThan(0.02);
      if (f === frames) for (let r = 0; r <= RINGS; r++) expect(b[r].distanceTo(new THREE.Vector3(B[r].x, 0, B[r].z))).toBeLessThan(0.08);
      for (const p of b) expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(20.6); // stays on the board
      if (prev) {
        maxStep = Math.max(maxStep, b[0].distanceTo(prev[0]));
        // lateral slip: velocity of mid-body rings must point along the body, not sideways
        for (let r = 20; r <= RINGS - 20; r += 10) {
          const v = new THREE.Vector3().subVectors(b[r], prev[r]);
          if (v.length() < 1e-4) continue;
          const tan = new THREE.Vector3().subVectors(b[r - 2], b[r + 2]).normalize();
          const slip = Math.sqrt(Math.max(0, 1 - (v.dot(tan) / v.length()) ** 2));
          worstSlip = Math.max(worstSlip, slip);
        }
      }
      prev = b;
    }
    expect(maxStep).toBeLessThan((travel / frames) * 1.6 + 1e-3);
    expect(worstSlip).toBeLessThan(0.25);
    expect(polyLength(plan.connector)).toBeGreaterThan(0);
    // a snake keeps its length in both lairs
    expect(Math.abs(plan.L0 - plan.L1) / plan.L0).toBeLessThan(0.01);
  });

  it('routes the connector around a pawn standing in the way', () => {
    const i = 0;
    const A = spineFor(SNAKES[i].routes[0].head, SNAKES[i].routes[0].tail, 0);
    const B = spineFor(SNAKES[i].routes[1].head, SNAKES[i].routes[1].tail, 0);
    const free = planCrawl(A, B);
    const mid = free.connector[Math.floor(free.connector.length / 2)].clone();
    const dodged = planCrawl(A, B, { avoid: [mid] });
    const closest = Math.min(...dodged.connector.map((p) => Math.hypot(p.x - mid.x, p.z - mid.z)));
    expect(closest).toBeGreaterThan(1.2);
  });
});
