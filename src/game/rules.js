// Pure game rules. No DOM, no three.js: every function takes a state and
// returns a new state plus a list of events for the presentation layer.
import { LAST, SHORTCUTS, SNAKES, SPECIALS, MANGOES, RIVER_PUSH } from './board.js';

export const SNAKE_MOVE_EVERY = 6; // completed turns between snake relocations

const shortcutByStart = new Map(SHORTCUTS.map((s) => [s.from, s]));

export function createGame(mode = 'ai') {
  const vsAI = mode === 'ai';
  return {
    mode,
    players: [0, 1].map((i) => ({
      index: i,
      name: i === 0 ? 'Aqua' : 'Leorus',
      isAI: vsAI && i === 1,
      pos: 0,
      rolls: 0,
      sixes: 0,
      shortcuts: 0,
      snakes: 0,
      mangoes: 0,
      shield: false,
      skip: false,
    })),
    current: 0,
    snakeRoute: SNAKES.map(() => 0),
    mangoes: [...MANGOES],
    shields: Object.keys(SPECIALS).filter((t) => SPECIALS[t] === 'shield').map(Number),
    turns: 0,
    winner: null,
  };
}

export const clone = (s) => ({
  ...s,
  players: s.players.map((p) => ({ ...p })),
  snakeRoute: [...s.snakeRoute],
  mangoes: [...s.mangoes],
  shields: [...s.shields],
});

export function snakeRouteOf(state, i) {
  return SNAKES[i].routes[state.snakeRoute[i]];
}

/** index of the snake whose head is on `tile`, or -1 */
export function snakeAt(state, tile) {
  for (let i = 0; i < SNAKES.length; i++) if (snakeRouteOf(state, i).head === tile) return i;
  return -1;
}

export function shortcutAt(tile) {
  return shortcutByStart.get(tile) || null;
}

/** Tiles visited while walking `roll` steps, bouncing back off the last tile. */
export function walk(from, roll) {
  const path = [];
  let pos = from;
  let dir = 1;
  let bounced = false;
  for (let i = 0; i < roll; i++) {
    if (pos === LAST) { dir = -1; bounced = true; }
    pos += dir;
    path.push(pos);
  }
  return { path, landing: pos, bounced };
}

/** What would happen for each roll 1..6 (used for the reach preview). */
export function preview(state, playerIndex = state.current) {
  const p = state.players[playerIndex];
  const out = [];
  for (let r = 1; r <= 6; r++) {
    const { landing } = walk(p.pos, r);
    let kind = 'plain';
    const special = SPECIALS[landing];
    if (shortcutAt(landing) || state.mangoes.includes(landing) || (special === 'shield' && state.shields.includes(landing))) kind = 'good';
    else if (special === 'sand' || special === 'river' || (snakeAt(state, landing) >= 0 && !p.shield)) kind = 'bad';
    if (landing === LAST) kind = 'win';
    out.push({ roll: r, tile: landing, kind });
  }
  return out;
}

/**
 * Resolve one die roll for the current player.
 * @returns {{state, events}} events are ordered for animation.
 */
export function resolveRoll(state0, roll, rng = Math.random) {
  if (state0.winner !== null) throw new Error('game is over');
  if (!(roll >= 1 && roll <= 6 && Number.isInteger(roll))) throw new Error(`bad roll ${roll}`);
  const state = clone(state0);
  const idx = state.current;
  const p = state.players[idx];
  if (p.skip) throw new Error('player must skip this turn');
  const events = [];
  p.rolls++;
  if (roll === 6) p.sixes++;
  events.push({ type: 'roll', player: idx, value: roll });

  const { path, landing, bounced } = walk(p.pos, roll);
  events.push({ type: 'walk', player: idx, from: p.pos, path, bounced });
  p.pos = landing;

  let bonus = false;
  let stuck = false;
  const mi = state.mangoes.indexOf(landing);
  if (mi >= 0) {
    state.mangoes.splice(mi, 1);
    p.mangoes++;
    bonus = true;
    events.push({ type: 'mango', player: idx, tile: landing });
  }

  const special = SPECIALS[landing];
  if (special === 'shield' && state.shields.includes(landing) && !p.shield) {
    state.shields.splice(state.shields.indexOf(landing), 1);
    p.shield = true;
    events.push({ type: 'shield', player: idx, tile: landing });
  } else if (special === 'sand') {
    p.skip = true;
    stuck = true;
    events.push({ type: 'sand', player: idx, tile: landing });
  } else if (special === 'river') {
    const to = Math.max(1, landing - RIVER_PUSH);
    events.push({ type: 'river', player: idx, from: landing, to });
    p.pos = to;
  }

  const sc = shortcutAt(p.pos);
  const si = snakeAt(state, p.pos);
  if (sc) {
    p.shortcuts++;
    events.push({ type: 'shortcut', player: idx, kind: sc.kind, from: sc.from, to: sc.to });
    p.pos = sc.to;
  } else if (si >= 0) {
    const r = snakeRouteOf(state, si);
    if (p.shield) {
      p.shield = false;
      events.push({ type: 'block', player: idx, snake: si, tile: r.head });
    } else {
      p.snakes++;
      events.push({ type: 'snake', player: idx, snake: si, from: r.head, to: r.tail });
      p.pos = r.tail;
    }
  }

  if (p.pos === LAST) {
    state.winner = idx;
    events.push({ type: 'win', player: idx });
    return { state, events };
  }

  if (stuck) {
    if (roll === 6 || bonus) events.push({ type: 'bonusLost', player: idx, reason: roll === 6 ? 'six' : 'mango' });
    endTurn(state, events, rng);
  } else if (roll === 6 || bonus) {
    events.push({ type: 'extra', player: idx, reason: roll === 6 ? 'six' : 'mango' });
    countTurn(state, events, rng);
  } else {
    endTurn(state, events, rng);
  }
  return { state, events };
}

/** The current player is stuck in quicksand: they lose this turn. */
export function resolveSkip(state0, rng = Math.random) {
  const state = clone(state0);
  const idx = state.current;
  const p = state.players[idx];
  if (!p.skip) throw new Error('player is not stuck');
  p.skip = false;
  const events = [{ type: 'skip', player: idx, tile: p.pos }];
  endTurn(state, events, rng);
  return { state, events };
}

function endTurn(state, events, rng) {
  state.current = 1 - state.current;
  events.push({ type: 'next', player: state.current });
  countTurn(state, events, rng);
}

function countTurn(state, events, rng) {
  state.turns++;
  if (state.turns % SNAKE_MOVE_EVERY === 0) {
    const mv = pickSnakeMove(state, rng);
    if (mv) {
      state.snakeRoute[mv.snake] = mv.toRoute;
      events.push({ type: 'snakeMove', ...mv });
    }
  }
}

/** A snake may only relocate when no pawn is standing on or next to its old or new spot. */
export function movableSnakes(state) {
  const near = (t) => state.players.some((p) => Math.abs(p.pos - t) <= 1);
  const out = [];
  for (let i = 0; i < SNAKES.length; i++) {
    const cur = snakeRouteOf(state, i);
    const alt = SNAKES[i].routes[1 - state.snakeRoute[i]];
    if (near(cur.head) || near(alt.head) || near(cur.tail) || near(alt.tail)) continue;
    out.push(i);
  }
  return out;
}

export function pickSnakeMove(state, rng = Math.random) {
  const options = movableSnakes(state);
  if (!options.length) return null;
  const snake = options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
  const fromRoute = state.snakeRoute[snake];
  const toRoute = 1 - fromRoute;
  return {
    snake,
    fromRoute,
    toRoute,
    from: SNAKES[snake].routes[fromRoute],
    to: SNAKES[snake].routes[toRoute],
  };
}
