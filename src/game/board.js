// Board layout for Snake Jungle: a 10x10 boustrophedon board (tile 1 bottom-left).
// All gameplay data lives here so it can be validated by tests.

export const LAST = 100;
export const COLS = 10;

/** Shortcuts carry a pawn forward. kind: bridge | vine | zip */
export const SHORTCUTS = [
  { from: 4, to: 25, kind: 'bridge' },
  { from: 12, to: 31, kind: 'vine' },
  { from: 21, to: 42, kind: 'zip' },
  { from: 36, to: 55, kind: 'bridge' },
  { from: 50, to: 71, kind: 'vine' },
  { from: 63, to: 82, kind: 'zip' },
  { from: 78, to: 97, kind: 'bridge' },
];

/**
 * Snakes send a pawn back. Each snake owns two routes and periodically
 * slithers between them, so the board changes during a match.
 */
export const SNAKES = [
  { name: 'Mossback', colors: ['#5fb04a', '#f2d34f', '#e9f6c9'], pattern: 'bands', routes: [{ head: 27, tail: 8 }, { head: 29, tail: 10 }] },
  { name: 'Ember', colors: ['#d9493a', '#2c1f1b', '#ffdcb4'], pattern: 'diamonds', routes: [{ head: 39, tail: 17 }, { head: 34, tail: 15 }] },
  { name: 'Violet', colors: ['#7a55d6', '#ffd85c', '#efe6ff'], pattern: 'spots', routes: [{ head: 48, tail: 26 }, { head: 46, tail: 24 }] },
  { name: 'Lagoon', colors: ['#2fa6bf', '#0f425a', '#dbf6ff'], pattern: 'bands', routes: [{ head: 61, tail: 43 }, { head: 59, tail: 40 }] },
  { name: 'Tiger', colors: ['#ee8b2c', '#3b2412', '#ffe8c8'], pattern: 'diamonds', routes: [{ head: 76, tail: 53 }, { head: 74, tail: 57 }] },
  { name: 'Sunny', colors: ['#dcb52c', '#2f6c2b', '#fff6d0'], pattern: 'spots', routes: [{ head: 88, tail: 67 }, { head: 86, tail: 65 }] },
  { name: 'Rosa', colors: ['#e0508b', '#4a1638', '#ffe2f0'], pattern: 'bands', routes: [{ head: 98, tail: 79 }, { head: 94, tail: 73 }] },
];

/** Hazard and bonus tiles. */
export const SPECIALS = {
  14: 'shield',
  56: 'shield',
  84: 'shield',
  19: 'sand',
  44: 'sand',
  69: 'sand',
  33: 'river',
  68: 'river',
  92: 'river',
};

export const RIVER_PUSH = 3;

/** Golden mangoes grant a bonus roll (once per match each). */
export const MANGOES = [6, 22, 38, 52, 62, 72, 83, 93];

/** Grid helpers ----------------------------------------------------------- */
export function tileRowCol(n) {
  const i = n - 1;
  const row = Math.floor(i / COLS);
  const k = i % COLS;
  const col = row % 2 === 0 ? k : COLS - 1 - k;
  return { row, col };
}

/** Every tile number any snake can ever occupy as head or tail. */
export function allSnakeTiles() {
  const heads = new Set();
  const tails = new Set();
  for (const s of SNAKES) for (const r of s.routes) { heads.add(r.head); tails.add(r.tail); }
  return { heads, tails };
}

/** Returns a list of human readable layout problems (empty when valid). */
export function validateBoard() {
  const problems = [];
  const owner = new Map(); // tile -> label, for tiles that must be exclusive
  const claim = (tile, label) => {
    if (tile < 1 || tile > LAST) problems.push(`${label} out of range (${tile})`);
    if (owner.has(tile)) problems.push(`tile ${tile} used by both ${owner.get(tile)} and ${label}`);
    else owner.set(tile, label);
  };
  for (const s of SHORTCUTS) {
    if (s.to <= s.from) problems.push(`shortcut ${s.from} must go forward`);
    if (!['bridge', 'vine', 'zip'].includes(s.kind)) problems.push(`shortcut ${s.from} bad kind`);
    claim(s.from, `shortcut ${s.from} start`);
    claim(s.to, `shortcut ${s.from} end`);
  }
  for (const [i, s] of SNAKES.entries()) {
    if (s.routes.length !== 2) problems.push(`snake ${i} needs exactly 2 routes`);
    for (const [j, r] of s.routes.entries()) {
      if (r.tail >= r.head) problems.push(`snake ${i} route ${j} must go backward`);
      if (r.head >= LAST || r.tail < 2) problems.push(`snake ${i} route ${j} touches start/finish`);
      claim(r.head, `snake ${i}.${j} head`);
      claim(r.tail, `snake ${i}.${j} tail`);
    }
  }
  for (const [t, kind] of Object.entries(SPECIALS)) {
    const n = +t;
    if (n <= 1 || n >= LAST) problems.push(`special ${kind} on start/finish`);
    claim(n, `${kind} ${n}`);
  }
  for (const m of MANGOES) claim(m, `mango ${m}`);
  // the river must wash you onto a calm tile: no snake head, shortcut start, hazard or mango
  const { heads } = allSnakeTiles();
  const starts = new Set(SHORTCUTS.map((s) => s.from));
  for (const [t, kind] of Object.entries(SPECIALS)) {
    if (kind !== 'river') continue;
    const back = +t - RIVER_PUSH;
    if (heads.has(back) || starts.has(back) || SPECIALS[back] || MANGOES.includes(back)) problems.push(`river ${t} washes onto an active tile ${back}`);
  }
  return [...new Set(problems)];
}
