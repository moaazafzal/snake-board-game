import { describe, it, expect } from 'vitest';
import { validateBoard, SHORTCUTS, SNAKES, SPECIALS, MANGOES, LAST, tileRowCol } from '../src/game/board.js';
import { createGame, resolveRoll, resolveSkip, walk, snakeAt, preview, movableSnakes, clone, SNAKE_MOVE_EVERY } from '../src/game/rules.js';

const at = (pos, mode = 'pvp') => {
  const s = createGame(mode);
  s.players[0].pos = pos;
  s.players[1].pos = 0;
  return s;
};
const types = (r) => r.events.map((e) => e.type);
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('board layout', () => {
  it('is valid', () => expect(validateBoard()).toEqual([]));
  it('maps tiles boustrophedon', () => {
    expect(tileRowCol(1)).toEqual({ row: 0, col: 0 });
    expect(tileRowCol(10)).toEqual({ row: 0, col: 9 });
    expect(tileRowCol(11)).toEqual({ row: 1, col: 9 });
    expect(tileRowCol(20)).toEqual({ row: 1, col: 0 });
    expect(tileRowCol(100)).toEqual({ row: 9, col: 0 });
  });
  it('has all three shortcut kinds and 7 snakes', () => {
    expect(new Set(SHORTCUTS.map((s) => s.kind))).toEqual(new Set(['bridge', 'vine', 'zip']));
    expect(SNAKES.length).toBe(7);
  });
});

describe('walking', () => {
  it('moves forward', () => expect(walk(10, 3)).toEqual({ path: [11, 12, 13], landing: 13, bounced: false }));
  it('lands exactly on 100', () => expect(walk(97, 3).landing).toBe(100));
  it('bounces back from 100', () => expect(walk(98, 5)).toEqual({ path: [99, 100, 99, 98, 97], landing: 97, bounced: true }));
});

describe('resolveRoll', () => {
  it('plain move passes the turn', () => {
    const r = resolveRoll(at(1), 1); // 2 is plain
    expect(r.state.players[0].pos).toBe(2);
    expect(r.state.current).toBe(1);
    expect(types(r)).toEqual(['roll', 'walk', 'next']);
  });
  it('six gives another roll', () => {
    const r = resolveRoll(at(1), 6); // 7 plain
    expect(r.state.players[0].pos).toBe(7);
    expect(r.state.current).toBe(0);
    expect(r.events.find((e) => e.type === 'extra').reason).toBe('six');
  });
  it('every shortcut carries forward', () => {
    for (const sc of SHORTCUTS) {
      const r = resolveRoll(at(sc.from - 1), 1);
      expect(r.state.players[0].pos).toBe(sc.to);
      expect(r.events.find((e) => e.type === 'shortcut')).toMatchObject({ kind: sc.kind, from: sc.from, to: sc.to });
      expect(r.state.players[0].shortcuts).toBe(1);
    }
  });
  it('every snake (both routes) sends back', () => {
    for (let i = 0; i < SNAKES.length; i++) {
      for (const ri of [0, 1]) {
        const s = at(SNAKES[i].routes[ri].head - 1);
        s.snakeRoute[i] = ri;
        const r = resolveRoll(s, 1);
        expect(r.state.players[0].pos).toBe(SNAKES[i].routes[ri].tail);
        expect(r.state.players[0].snakes).toBe(1);
      }
    }
  });
  it('a snake on its other route does not bite at the old head', () => {
    const s = at(SNAKES[0].routes[0].head - 1);
    s.snakeRoute[0] = 1;
    const r = resolveRoll(s, 1);
    expect(r.state.players[0].pos).toBe(SNAKES[0].routes[0].head);
  });
  it('shield is picked up once and blocks one snake', () => {
    const sh = Object.keys(SPECIALS).map(Number).find((t) => SPECIALS[t] === 'shield');
    let r = resolveRoll(at(sh - 1), 1);
    expect(r.state.players[0].shield).toBe(true);
    expect(r.state.shields).not.toContain(sh);
    const s = clone(r.state);
    s.current = 0;
    s.players[0].pos = SNAKES[1].routes[0].head - 2;
    r = resolveRoll(s, 2);
    expect(types(r)).toContain('block');
    expect(r.state.players[0].pos).toBe(SNAKES[1].routes[0].head);
    expect(r.state.players[0].shield).toBe(false);
    expect(r.state.players[0].snakes).toBe(0);
  });
  it('second shield is left on the board while shielded', () => {
    const shields = Object.keys(SPECIALS).map(Number).filter((t) => SPECIALS[t] === 'shield');
    const s = at(shields[1] - 1);
    s.players[0].shield = true;
    const r = resolveRoll(s, 1);
    expect(r.state.shields).toContain(shields[1]);
    expect(types(r)).not.toContain('shield');
  });
  it('quicksand skips next turn and cancels a six bonus', () => {
    const sand = Object.keys(SPECIALS).map(Number).find((t) => SPECIALS[t] === 'sand');
    const r = resolveRoll(at(sand - 6), 6);
    expect(r.state.players[0].skip).toBe(true);
    expect(types(r)).toContain('bonusLost');
    expect(types(r)).not.toContain('extra');
    expect(r.state.current).toBe(1);
    // player 2 plays, then player 1 must skip
    const r2 = resolveRoll(r.state, 1);
    expect(r2.state.current).toBe(0);
    expect(() => resolveRoll(r2.state, 3)).toThrow();
    const r3 = resolveSkip(r2.state);
    expect(r3.state.players[0].skip).toBe(false);
    expect(r3.state.current).toBe(1);
    expect(r3.state.players[0].pos).toBe(sand);
  });
  it('river washes back to a calm tile', () => {
    for (const t of Object.keys(SPECIALS).map(Number).filter((t) => SPECIALS[t] === 'river')) {
      const r = resolveRoll(at(t - 1), 1);
      expect(r.state.players[0].pos).toBe(t - 3);
      expect(r.events.find((e) => e.type === 'river')).toMatchObject({ from: t, to: t - 3 });
    }
  });
  it('mango gives a bonus roll once', () => {
    const m = MANGOES[0];
    const r = resolveRoll(at(m - 1), 1);
    expect(r.state.current).toBe(0);
    expect(r.state.mangoes).not.toContain(m);
    expect(r.events.find((e) => e.type === 'extra').reason).toBe('mango');
    const s = clone(r.state);
    s.players[0].pos = m - 1;
    const r2 = resolveRoll(s, 1);
    expect(types(r2)).not.toContain('mango');
  });
  it('exact landing wins and stops the game', () => {
    const r = resolveRoll(at(96), 4);
    expect(r.state.winner).toBe(0);
    expect(types(r).at(-1)).toBe('win');
    expect(() => resolveRoll(r.state, 1)).toThrow();
  });
  it('overshoot bounces and can still trigger snakes', () => {
    const s = at(97); // 97 -> 98 99 100 99 98 => lands 98 (snake head on route 0)
    const r = resolveRoll(s, 5);
    expect(r.events[1].bounced).toBe(true);
    expect(r.state.players[0].pos).toBe(SNAKES[6].routes[0].tail);
  });
  it('rejects invalid rolls', () => {
    expect(() => resolveRoll(at(1), 0)).toThrow();
    expect(() => resolveRoll(at(1), 7)).toThrow();
    expect(() => resolveRoll(at(1), 2.5)).toThrow();
  });
});

describe('snake relocation', () => {
  it(`relocates a snake every ${SNAKE_MOVE_EVERY} turns`, () => {
    let s = createGame('pvp');
    const rng = seeded(7);
    let moves = 0;
    for (let i = 0; i < SNAKE_MOVE_EVERY; i++) {
      const r = resolveRoll(s, 1, rng);
      moves += r.events.filter((e) => e.type === 'snakeMove').length;
      s = r.state;
    }
    expect(moves).toBe(1);
    expect(s.snakeRoute.filter((x) => x === 1).length).toBe(1);
  });
  it('never relocates a snake onto or next to a pawn', () => {
    const s = createGame('pvp');
    for (let i = 0; i < SNAKES.length; i++) {
      const alt = SNAKES[i].routes[1];
      s.players[0].pos = alt.head;
      expect(movableSnakes(s)).not.toContain(i);
    }
  });
});

describe('preview', () => {
  it('flags good, bad and win tiles', () => {
    const p = preview(at(SHORTCUTS[0].from - 1));
    expect(p[0]).toMatchObject({ tile: SHORTCUTS[0].from, kind: 'good' });
    const q = preview(at(SNAKES[0].routes[0].head - 1));
    expect(q[0].kind).toBe('bad');
    expect(preview(at(94))[5]).toMatchObject({ tile: LAST, kind: 'win' });
  });
});

describe('simulation', () => {
  it('20k random games always finish with consistent state', () => {
    const rng = seeded(42);
    let totalRolls = 0;
    const seen = new Set();
    for (let g = 0; g < 20000; g++) {
      let s = createGame(g % 2 ? 'ai' : 'pvp');
      let guard = 0;
      while (s.winner === null) {
        if (++guard > 5000) throw new Error('game did not finish');
        const r = s.players[s.current].skip ? resolveSkip(s, rng) : resolveRoll(s, 1 + Math.floor(rng() * 6), rng);
        for (const e of r.events) seen.add(e.type === 'shortcut' ? e.kind : e.type);
        s = r.state;
        for (const p of s.players) if (!(p.pos >= 0 && p.pos <= LAST)) throw new Error('pos out of range');
        // no two snakes ever share a head
        const heads = s.snakeRoute.map((ri, i) => SNAKES[i].routes[ri].head);
        if (new Set(heads).size !== heads.length) throw new Error('snakes overlap');
      }
      totalRolls += s.players[s.winner].rolls;
    }
    for (const t of ['roll', 'walk', 'mango', 'shield', 'sand', 'river', 'bridge', 'vine', 'zip', 'block', 'snake', 'win', 'extra', 'bonusLost', 'skip', 'snakeMove', 'next']) expect(seen.has(t), t).toBe(true);
    const avg = totalRolls / 20000;
    expect(avg).toBeGreaterThan(10);
    expect(avg).toBeLessThan(60);
    console.log('average rolls by the winner:', avg.toFixed(1));
  }, 120000);
});
