import { walk, resolveRoll, clone } from '../src/game/rules.js';
import { SHORTCUTS, SPECIALS, MANGOES, SNAKES } from '../src/game/board.js';

/* ---------- guided dice: steer each player onto a tour of feature tiles ---------- */
export function planRoll(s, who, target) {
  // BFS over positions using the real rules; returns first roll of the shortest path whose landing tile == target
  const base = clone(s);
  base.players.forEach((p) => (p.skip = false));
  const start = base.players[who].pos;
  const prev = new Map([[start, null]]);
  const q = [start];
  while (q.length) {
    const pos = q.shift();
    for (let r = 1; r <= 6; r++) {
      if (walk(pos, r).landing === target) {
        let cur = pos, first = r;
        while (prev.get(cur)) { first = prev.get(cur).r; cur = prev.get(cur).p; }
        return first;
      }
      const t = clone(base);
      t.current = who;
      t.players[who].pos = pos;
      let nx;
      try { nx = resolveRoll(t, r, () => 0.99).state.players[who].pos; } catch { continue; }
      if (!prev.has(nx)) { prev.set(nx, { p: pos, r }); q.push(nx); }
    }
  }
  return null;
}
const allFeatures = () => [...new Set([...SHORTCUTS.map((s) => s.from), ...Object.keys(SPECIALS).map(Number), ...MANGOES])].sort((a, b) => a - b);
export const tours = (g) => {
  const A = [...allFeatures(), 'bounce', 'win'];
  const B = ['snakes', 'win'];
  return g % 2 === 0 ? [A, B] : [B, A];
};
export function guidedRoll(s, who, tour, visited) {
  const p = s.players[who];
  while (tour.length) {
    const spec = tour[0];
    let target = null;
    if (spec === 'snakes') {
      const heads = s.snakeRoute.map((ri, i) => SNAKES[i].routes[ri].head).filter((h) => h > p.pos && !visited.has('snake' + h)).sort((a, b) => a - b);
      target = heads[0] ?? null;
    } else if (spec === 'bounce') {
      if (p.pos >= 95) { tour.shift(); visited.add('bounce'); return 6; }
      target = 95 + (p.pos % 3);
      const r = planRoll(s, who, target);
      return r ?? 1 + Math.floor(Math.random() * 6);
    } else target = spec === 'win' ? 100 : spec;
    if (target == null || (target <= p.pos && spec !== 'win')) { tour.shift(); continue; }
    const r = planRoll(s, who, target);
    if (r == null) { tour.shift(); continue; }
    if (walk(p.pos, r).landing === target) {
      if (spec === 'snakes') visited.add('snake' + target);
      else { tour.shift(); visited.add(String(spec)); }
    }
    return r;
  }
  return 1 + Math.floor(Math.random() * 6);
}

