// Frame-driven tweening with cooperative cancellation.
// Every awaited animation rejects with Cancelled when the match is reset,
// so a half-played turn can never leave the game in a broken state.

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
/** maps t from [a,b] to [0,1] */
export const span = (t, a, b) => clamp01((t - a) / (b - a));

export class Animator {
  constructor() {
    this.tasks = new Set();
    this.speed = 1;
    this.time = 0;
    this.paused = false;
  }

  /** Calls fn(k) with k going 0..1 over `dur` seconds (scaled by speed). */
  tween(dur, fn = () => {}, easing = ease.linear) {
    return new Promise((resolve, reject) => {
      const task = { t: 0, dur: Math.max(0, dur), fn, easing, resolve, reject };
      try {
        fn(easing(0));
      } catch (e) {
        reject(e);
        return;
      }
      if (task.dur === 0) {
        try { fn(easing(1)); } catch (e) { reject(e); return; }
        resolve();
        return;
      }
      this.tasks.add(task);
    });
  }

  wait(dur) {
    return this.tween(dur);
  }

  /** Fire-and-forget tween: errors and cancellation are swallowed. */
  fx(dur, fn, easing) {
    this.tween(dur, fn, easing).catch(() => {});
  }

  update(dt) {
    if (this.paused) return;
    const d = dt * this.speed;
    this.time += d;
    for (const task of [...this.tasks]) {
      if (!this.tasks.has(task)) continue;
      task.t += d;
      const k = Math.min(1, task.t / task.dur);
      try {
        task.fn(task.easing(k));
      } catch (e) {
        this.tasks.delete(task);
        task.reject(e);
        continue;
      }
      if (k >= 1) {
        this.tasks.delete(task);
        task.resolve();
      }
    }
  }

  cancelAll() {
    const tasks = [...this.tasks];
    this.tasks.clear();
    for (const t of tasks) t.reject(new Cancelled());
  }
}
