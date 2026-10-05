// DOM HUD: turn label, player cards, progress track, toasts, overlays.
import { SHORTCUTS, SPECIALS, SNAKES } from './game/board.js';

const $ = (id) => document.getElementById(id);

const PIPS = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 27], [70, 27], [30, 50], [70, 50], [30, 73], [70, 73]],
};
export const dieSvg = (v) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="6" y="6" width="88" height="88" rx="24" fill="#fffaf0"/>${PIPS[v]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="${v === 1 ? '#d8352c' : '#1b2a29'}"/>`)
    .join('')}</svg>`;

export class UI {
  constructor() {
    this.el = {
      turn: $('turn'),
      roll: $('rollBtn'),
      toast: $('toast'),
      big: $('bignum'),
      dots: $('dots'),
      reach: $('reach'),
      menu: $('menu'),
      win: $('win'),
      help: $('help'),
      fatal: $('fatal'),
      resume: $('resumeBtn'),
    };
    this.el.roll.innerHTML = dieSvg(5);
    this.toastTimer = 0;
  }

  where(pos) {
    return pos <= 0 ? 'At the start' : `Tile ${pos}`;
  }

  /** @param {object} s game state, display = animated positions, ctl = {started, busy, canRoll} */
  render(s, display, ctl) {
    s.players.forEach((p, i) => {
      $('name' + i).textContent = p.name;
      $('role' + i).textContent = s.mode === 'ai' ? (p.isAI ? 'CPU' : 'YOU') : `P${i + 1}`;
      $('where' + i).textContent = p.skip ? 'Stuck in quicksand' : this.where(display[i]);
      $('badge' + i).textContent = p.shield ? '🛡️' : '';
      $('badge' + i).title = p.shield ? 'Shield charm ready' : '';
      $('card' + i).classList.toggle('active', ctl.started && s.winner === null && s.current === i);
      $('mk' + i).style.left = this.pct(display[i]);
    });
    const cur = s.players[s.current];
    let label = '';
    if (ctl.started && s.winner === null) {
      if (cur.skip) label = `${cur.name} is stuck in quicksand`;
      else if (s.mode === 'ai') label = cur.isAI ? (ctl.busy ? `${cur.name} is rolling` : `${cur.name}'s turn`) : `Your turn, ${cur.name}`;
      else label = `${cur.name}'s turn`;
    }
    this.el.turn.textContent = label;
    this.el.roll.disabled = !ctl.canRoll;
    this.el.roll.classList.toggle('ready', ctl.canRoll);
  }

  pct(pos) {
    return `${Math.max(0, pos) === 0 ? 0 : pos - 0.5}%`;
  }

  setDie(v) {
    this.el.roll.innerHTML = dieSvg(v);
  }

  setReach(list) {
    if (!list) {
      this.el.reach.style.width = '0';
      return;
    }
    const tiles = list.map((o) => o.tile);
    const lo = Math.min(...tiles);
    const hi = Math.max(...tiles);
    this.el.reach.style.left = `${lo - 1}%`;
    this.el.reach.style.width = `${hi - lo + 1}%`;
  }

  /** Feature dots on the progress track; snakes are rebuilt when they move. */
  renderTrack(s) {
    const html = [];
    const dot = (cls, t) => html.push(`<i class="${cls}" style="left:${t - 0.5}%"></i>`);
    for (const sc of SHORTCUTS) dot('up', sc.from);
    for (const [t, k] of Object.entries(SPECIALS)) if (k !== 'shield' || s.shields.includes(+t)) dot(k, +t);
    for (const m of s.mangoes) dot('mango', m);
    SNAKES.forEach((sn, i) => dot('snake', sn.routes[s.snakeRoute[i]].head));
    this.el.dots.innerHTML = html.join('');
  }

  toast(text, kind = '') {
    const t = this.el.toast;
    t.className = 'toast';
    void t.offsetWidth; // restart animation
    t.textContent = text;
    t.className = `toast show ${kind}`;
  }

  clearToast() {
    this.el.toast.className = 'toast';
    this.el.toast.textContent = '';
  }

  bigNumber(n) {
    const b = this.el.big;
    b.className = 'bignum';
    void b.offsetWidth;
    b.textContent = n;
    b.className = 'bignum show';
  }

  show(name, on) {
    this.el[name].classList.toggle('hidden', !on);
    if (name === 'menu') document.body.classList.toggle('in-menu', on);
  }

  setResumable(on) {
    this.el.resume.hidden = !on;
  }

  showWin(s, vsAI) {
    const w = s.players[s.winner];
    const human = vsAI && !w.isAI;
    $('winTitle').textContent = `${w.name} wins!`;
    $('winText').textContent = `${human ? 'You' : w.name} reached tile 100 in ${w.rolls} ${w.rolls === 1 ? 'roll' : 'rolls'}.`;
    $('winAvatar').src = s.winner === 0 ? './avatars/aqua.png' : './avatars/leorus.png';
    $('winAvatar').alt = w.name;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    $('stats').innerHTML = s.players
      .map(
        (p, i) => `<div class="stat" style="--c:${i === 0 ? '#3c9cf0' : '#f0943c'}"><b><img src="./avatars/${i === 0 ? 'aqua' : 'leorus'}.png" alt="">${p.name}</b>` +
          `<span>${plural(p.rolls, 'roll', 'rolls')} · ${plural(p.sixes, 'six', 'sixes')}</span>` +
          `<span>${plural(p.shortcuts, 'shortcut', 'shortcuts')} taken</span>` +
          `<span>${plural(p.snakes, 'snake', 'snakes')} met</span>` +
          `<span>${plural(p.mangoes, 'mango', 'mangoes')} eaten</span></div>`,
      )
      .join('');
    this.show('win', true);
  }
}
