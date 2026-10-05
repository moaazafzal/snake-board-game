// Tiny synthesized sound kit (no audio files to download).
const KEY = 'snakejungle.muted';

class Sfx {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.noiseBuf = null;
    try {
      this.muted = localStorage.getItem(KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Must be called from a user gesture (browsers block audio before that). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem(KEY, m ? '1' : '0');
    } catch {}
  }

  get ready() {
    return this.ctx && !this.muted && this.ctx.state === 'running';
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0, attack = 0.01 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, f = 1500, f2 = null, q = 1, delay = 0, type = 'bandpass' } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  click() { this.tone(660, 0.07, { type: 'triangle', vol: 0.08 }); }
  roll() {
    for (let i = 0; i < 6; i++) {
      this.noise(0.05, { vol: 0.22, f: 2200 + Math.random() * 1800, q: 3, delay: i * 0.09 + Math.random() * 0.03 });
      this.tone(240 + Math.random() * 160, 0.04, { type: 'square', vol: 0.025, delay: i * 0.09 });
    }
  }
  diceLand() { this.tone(320, 0.09, { vol: 0.14, to: 210 }); this.noise(0.06, { vol: 0.12, f: 900 }); }
  hop(i) { this.tone(440 * Math.pow(2, Math.min(i, 10) / 12), 0.13, { type: 'triangle', vol: 0.1, to: 600 * Math.pow(2, Math.min(i, 10) / 12) }); }
  land() { this.noise(0.07, { vol: 0.08, f: 500, q: 1.2 }); }
  step() { this.noise(0.04, { vol: 0.05, f: 700 + Math.random() * 200, q: 1.5 }); }
  good() { [0, 4, 7, 12].forEach((s, i) => this.tone(587 * Math.pow(2, s / 12), 0.22, { type: 'triangle', vol: 0.1, delay: i * 0.07 })); }
  six() { [0, 7, 12].forEach((s, i) => this.tone(784 * Math.pow(2, s / 12), 0.18, { type: 'triangle', vol: 0.09, delay: i * 0.06 })); }
  mango() { [0, 4, 7, 11, 14].forEach((s, i) => this.tone(880 * Math.pow(2, s / 12), 0.2, { vol: 0.08, delay: i * 0.05 })); }
  shield() { this.tone(520, 0.5, { vol: 0.1, to: 1040 }); this.tone(780, 0.5, { type: 'triangle', vol: 0.05, to: 1560, delay: 0.05 }); }
  block() { this.tone(300, 0.25, { type: 'square', vol: 0.06, to: 900 }); this.noise(0.3, { vol: 0.15, f: 3000, q: 0.7 }); }
  hiss() { this.noise(0.7, { vol: 0.18, f: 5200, f2: 3800, q: 0.9, type: 'highpass' }); }
  gulp() { this.tone(240, 0.3, { vol: 0.28, to: 80 }); this.noise(0.18, { vol: 0.15, f: 300, q: 2, delay: 0.06 }); }
  slide(d) { this.tone(500, d, { type: 'triangle', vol: 0.07, to: 120 }); }
  pop() { this.tone(400, 0.14, { vol: 0.16, to: 1100 }); }
  creak() { this.tone(170, 0.2, { type: 'sawtooth', vol: 0.03, to: 130 }); }
  whoosh(d = 0.6) { this.noise(d, { vol: 0.16, f: 400, f2: 2400, q: 0.6 }); }
  zip(d) { this.tone(900, d, { type: 'sawtooth', vol: 0.02, to: 1600 }); this.noise(d, { vol: 0.07, f: 3200, q: 2 }); }
  sand() { this.noise(0.9, { vol: 0.18, f: 260, f2: 120, q: 0.8, type: 'lowpass' }); this.tone(200, 0.6, { vol: 0.08, to: 90 }); }
  splash() { this.noise(0.5, { vol: 0.25, f: 1800, f2: 600, q: 0.7 }); this.noise(0.25, { vol: 0.12, f: 4000, q: 1, delay: 0.1 }); }
  bounce() { this.tone(560, 0.3, { type: 'square', vol: 0.04, to: 260 }); }
  slither(d) {
    // soft scales-on-wood rustle
    for (let t = 0; t < d; t += 0.45) this.noise(0.5, { vol: 0.07, f: 2600 + Math.random() * 800, f2: 1500, q: 0.7, delay: t });
  }
  rumble() { this.noise(1.2, { vol: 0.12, f: 180, q: 0.8, type: 'lowpass' }); }
  win() {
    [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => {
      const f = 523 * Math.pow(2, s / 12);
      this.tone(f, 0.3, { type: 'triangle', vol: 0.12, delay: i * 0.11 });
      this.tone(f / 2, 0.28, { vol: 0.05, delay: i * 0.11 });
    });
  }
  lose() { [7, 4, 0, -5].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.3, { type: 'triangle', vol: 0.09, delay: i * 0.16 })); }
}

export const sfx = new Sfx();

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
