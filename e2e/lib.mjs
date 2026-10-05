// Shared Playwright helpers (uses the locally installed Google Chrome).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const BASE = process.env.BASE_URL || 'http://localhost:4173/';
export const OUT = new URL('./out/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open({ width = 1280, height = 800, mobile = false, query = 'test', init } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  if (init) await page.addInitScript(init);
  await page.goto(BASE + (query ? `?${query}` : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.classList.contains('ready') || !document.getElementById('fatal').classList.contains('hidden'), null, { timeout: 30000 });
  return { browser, page, logs };
}

export const shot = (page, name) => page.screenshot({ path: OUT + name + '.png' });

export const st = (page) => page.evaluate(() => {
  const g = window.__game;
  const s = g.state;
  return { busy: g.busy, started: g.game.started, paused: g.game.paused, cur: s.current, winner: s.winner, turns: s.turns, mode: s.mode,
    p: s.players.map((p) => ({ pos: p.pos, rolls: p.rolls, shield: p.shield, skip: p.skip, snakes: p.snakes, shortcuts: p.shortcuts, mangoes: p.mangoes, name: p.name })),
    routes: s.snakeRoute.slice(), errors: g.errors.length + g.game.errors.length };
});

export async function waitIdle(page, timeout = 90000) {
  await page.waitForFunction(() => {
    const g = window.__game;
    return !g.busy && (g.state.winner !== null || !document.getElementById('rollBtn').disabled);
  }, null, { timeout, polling: 100 });
}

/** Verifies that the 3D scene and HUD match the committed game state. Returns a list of problems. */
export const checkSync = (page) => page.evaluate(() => {
  const g = window.__game;
  const s = g.state;
  const v = g.view;
  const probs = [];
  const tile = (n) => {
    if (n <= 0) return { x: -18, y: 0, z: 23.4 };
    const i = n - 1, row = Math.floor(i / 10), k = i % 10, col = row % 2 === 0 ? k : 9 - k;
    return { x: (col - 4.5) * 4, y: 0, z: (4.5 - row) * 4 };
  };
  const OFF = [{ x: -0.75, z: 0.55 }, { x: 0.75, z: -0.55 }];
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  s.players.forEach((p, i) => {
    const pawn = v.pawns[i];
    const t = tile(p.pos);
    const want = { x: t.x + OFF[i].x, z: t.z + OFF[i].z };
    const dist = d2(pawn.root.position, want);
    if (dist > 0.35) probs.push(`pawn ${i} at wrong place: ${dist.toFixed(2)} from tile ${p.pos}`);
    if (!pawn.root.visible) probs.push(`pawn ${i} invisible`);
    if (Math.abs(pawn.root.scale.x - 1) > 0.05) probs.push(`pawn ${i} scale ${pawn.root.scale.x}`);
    if (Math.abs(pawn.root.position.y) > 0.3) probs.push(`pawn ${i} height ${pawn.root.position.y.toFixed(2)}`);
    if (pawn.bubble.visible !== p.shield) probs.push(`pawn ${i} bubble ${pawn.bubble.visible} vs shield ${p.shield}`);
    if (v.sunk[i] !== p.skip) probs.push(`pawn ${i} sunk ${v.sunk[i]} vs skip ${p.skip}`);
    const where = document.getElementById('where' + i).textContent;
    const wantWhere = p.skip ? 'Stuck in quicksand' : p.pos === 0 ? 'At the start' : `Tile ${p.pos}`;
    if (where !== wantWhere) probs.push(`HUD where${i} "${where}" != "${wantWhere}"`);
  });
  v.snakes.forEach((sn, i) => {
    const r = sn.def.routes[s.snakeRoute[i]];
    const t = tile(r.head);
    const dist = d2(sn.base[0], { x: t.x + 0.9, z: t.z - 0.9 });
    if (dist > 0.6) probs.push(`snake ${i} drawn ${dist.toFixed(2)} away from its head tile ${r.head}`);
    const tt = tile(r.tail);
    const dt = d2(sn.base[sn.base.length - 1], { x: tt.x - 0.8, z: tt.z + 0.8 });
    if (dt > 0.6) probs.push(`snake ${i} tail drawn away from ${r.tail}`);
    if (sn.bulge !== -1 || sn.strike !== 0 || sn.rear !== 0 || sn.crawling || sn.crawlLift !== 0) probs.push(`snake ${i} stuck mid-animation`);
  });
  for (const [t, c] of v.mangoes) if (c.g.visible !== s.mangoes.includes(t)) probs.push(`mango ${t} visible=${c.g.visible} but state=${s.mangoes.includes(t)}`);
  for (const [t, c] of v.shieldItems) if (c.g.visible !== s.shields.includes(t)) probs.push(`shield charm ${t} visible=${c.g.visible} but state=${s.shields.includes(t)}`);
  const heads = [...document.querySelectorAll('#dots i.snake')].map((e) => parseFloat(e.style.left) + 0.5).sort((a, b) => a - b);
  const want = v.snakes.map((sn, i) => sn.def.routes[s.snakeRoute[i]].head).sort((a, b) => a - b);
  if (heads.join() !== want.join()) probs.push(`track snake dots ${heads} != ${want}`);
  const cur = s.players[s.current];
  const canRoll = g.game.started && !g.game.paused && !g.busy && s.winner === null && !cur.isAI && !cur.skip;
  if (document.getElementById('rollBtn').disabled === canRoll) probs.push(`roll button disabled=${document.getElementById('rollBtn').disabled} canRoll=${canRoll}`);
  if (g.errors.length || g.game.errors.length) probs.push(`errors: ${[...g.errors, ...g.game.errors].join(' | ').slice(0, 300)}`);
  return probs;
});
