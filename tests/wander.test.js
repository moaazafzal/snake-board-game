import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GrowTrack, planWanderLeg, polyLength } from '../src/view/slither.js';
import { spineFor, bodyLengthFor } from '../src/view/snake.js';
import { buildShortcut } from '../src/view/shortcuts.js';
import { SNAKES, SHORTCUTS } from '../src/game/board.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('GrowTrack', () => {
  it('keeps absolute arc positions after trimming', () => {
    const t = new GrowTrack([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0)]);
    t.append([new THREE.Vector3(20, 0, 0)]);
    expect(t.end).toBeCloseTo(20);
    t.trim(12);
    expect(t.start).toBeCloseTo(10);
    expect(t.at(15).x).toBeCloseTo(15);
    expect(t.endPose().h).toBeCloseTo(0);
  });
});

describe('menu roaming', () => {
  const scene = new THREE.Scene();
  const obstacles = SHORTCUTS.flatMap((sc) => buildShortcut(scene, sc).obstacles());

  it('7 snakes roam for 3 minutes: on the board, smooth, clear of props, bounded memory', () => {
    const rng = seeded(11);
    const W = SNAKES.map((def, i) => {
      const BL = bodyLengthFor(def, i * 1.7);
      const lair = spineFor(def.routes[0].head, def.routes[0].tail, i * 1.7, BL);
      const track = new GrowTrack(lair.slice().reverse());
      return { track, s: track.end, L: polyLength(lair), speed: 2.2 + rng() * 1.2, body: lair.map((p) => p.clone()) };
    });
    const dt = 1 / 30;
    let propHits = 0;
    let samples = 0;
    let maxPoints = 0;
    for (let f = 0; f < 180 * 30; f++) {
      for (const w of W) {
        w.s += w.speed * dt;
        if (w.track.end - w.s < 6) {
          const others = W.filter((o) => o !== w).flatMap((o) => o.body.filter((_, r) => r % 12 === 0));
          const leg = planWanderLeg(w.track.endPose(), { obstacles, others, rng });
          // legs are smooth: no sharp corners between consecutive points
          for (let i = 2; i < leg.length; i++) {
            const a = new THREE.Vector3().subVectors(leg[i - 1], leg[i - 2]);
            const b = new THREE.Vector3().subVectors(leg[i], leg[i - 1]);
            if (a.length() > 1e-6 && b.length() > 1e-6) expect(a.angleTo(b)).toBeLessThan(0.4);
          }
          w.track.append(leg.slice(1));
        }
        w.track.trim(w.s - w.L - 2);
        maxPoints = Math.max(maxPoints, w.track.p.length);
        w.track.sampleBody(w.s, w.L, w.body);
        const head = w.body[0];
        expect(Number.isFinite(head.x) && Number.isFinite(head.z)).toBe(true);
        expect(Math.max(Math.abs(head.x), Math.abs(head.z))).toBeLessThan(19.75); // lairs on the edge row may brush the wooden rim when turning around
        samples++;
        for (const o of obstacles) if (Math.hypot(head.x - o.x, head.z - o.z) < o.r) propHits++;
      }
    }
    expect(propHits / samples).toBeLessThan(0.002);
    expect(maxPoints).toBeLessThan(800);
  }, 60000);
});
