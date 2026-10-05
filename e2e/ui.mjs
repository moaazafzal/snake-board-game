// UI, input, pause/abort, persistence, responsive layout, fallback and performance checks.
import { open, shot, sleep, st, waitIdle, checkSync, BASE } from './lib.mjs';
import { chromium } from 'playwright-core';
import { guidedRoll } from './planner.mjs';

const results = [];
const ok = (name, pass, extra = '') => {
  results.push({ name, pass: !!pass, extra });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? '  · ' + extra : ''}`);
};
const attr = (page, id, a) => page.$eval('#' + id, (e, a) => e.getAttribute(a), a);
const force = (page, list) => page.evaluate((l) => window.__game.force(l), list);
const rolls = (page) => page.evaluate(() => window.__game.state.players.reduce((a, p) => a + p.rolls, 0));
const sync = async (page, name) => {
  const p = await checkSync(page);
  ok(`${name}: scene in sync`, p.length === 0, p.join('; '));
};

/* ===================================================== desktop suite */
{
  const { browser, page, logs } = await open();
  ok('menu shown on load', !(await page.$eval('#menu', (e) => e.classList.contains('hidden'))));
  const brand = await page.evaluate(() => {
    const a = document.querySelector('.credit');
    const imgs = [...document.querySelectorAll('#menu img')];
    return { text: a && a.textContent.replace(/\s+/g, ' ').trim(), href: a && a.href, loaded: imgs.every((i) => i.complete && i.naturalWidth > 0), n: imgs.length };
  });
  ok('menu credit: Made by Moaaz, Aqua Games (logo + mascots load)', /Made by Moaaz/.test(brand.text) && /Aqua Games/.test(brand.text) && /aquagames/.test(brand.href) && brand.loaded && brand.n === 3, JSON.stringify(brand));
  const lairHeads = await page.evaluate(() => window.__game.view.snakes.map((s) => s.def.routes[0]).map((r, i) => [window.__game.view.snakes[i].spineOf(r)[0].x, window.__game.view.snakes[i].spineOf(r)[0].z]));
  await sleep(4500);
  const roam = await page.evaluate((lairs) => window.__game.view.snakes.map((s, i) => ({ d: Math.hypot(s.base[0].x - lairs[i][0], s.base[0].z - lairs[i][1]), edge: Math.max(Math.abs(s.base[0].x), Math.abs(s.base[0].z)) })), lairHeads);
  ok('main menu: snakes roam the board', roam.filter((r) => r.d > 1.5).length >= 5 && roam.every((r) => r.edge < 19.8), roam.map((r) => r.d.toFixed(1)).join(' '));
  ok('HUD hidden behind menu', await page.evaluate(() => document.body.classList.contains('in-menu')));
  await page.keyboard.press('Space');
  await sleep(300);
  ok('Space on menu does not start a game', !(await st(page)).started);

  await page.click('#helpBtn');
  await sleep(450);
  ok('help opens', !(await page.$eval('#help', (e) => e.classList.contains('hidden'))));
  await shot(page, 'ui_help');
  await page.keyboard.press('Escape');
  await sleep(450);
  ok('Escape closes help', await page.$eval('#help', (e) => e.classList.contains('hidden')));

  await page.click('#playAI');
  await sleep(900);
  let s = await st(page);
  ok('vs computer starts (Aqua vs Leorus)', s.started && s.mode === 'ai' && s.p[0].name === 'Aqua' && s.p[1].name === 'Leorus');
  ok('HUD roles + avatars', (await page.textContent('#role0')) === 'YOU' && (await page.textContent('#role1')) === 'CPU' && (await page.$$eval('.card img.avatar', (im) => im.every((i) => i.complete && i.naturalWidth > 0))));
  ok('turn label', (await page.textContent('#turn')) === 'Your turn, Aqua', await page.textContent('#turn'));
  ok('roll enabled on your turn', !(await page.$eval('#rollBtn', (e) => e.disabled)));
  ok('follow camera by default', (await attr(page, 'followBtn', 'aria-pressed')) === 'true');
  ok('reach preview shown', (await page.$eval('#reach', (e) => e.style.width)) !== '0px' && (await page.evaluate(() => window.__game.view.reach.items.filter((i) => i.g.visible).length)) === 6);
  const dots = await page.$$eval('#dots i', (es) => es.map((e) => e.className));
  ok('track shows every feature', dots.length === 31 && dots.filter((d) => d === 'snake').length === 7, `${dots.length} dots`);
  await sync(page, 'fresh game');

  // ---- focus regression: mouse-clicking a toolbar button must not steal Space
  for (const id of ['followBtn', 'mapBtn', 'speedBtn', 'soundBtn']) {
    await waitIdle(page);
    const before = await attr(page, id, 'aria-pressed');
    await page.click('#' + id);
    await sleep(150);
    const after = await attr(page, id, 'aria-pressed');
    await force(page, [1]);
    await page.keyboard.press('Space');
    await sleep(300);
    const started = await page.evaluate(() => window.__game.game.forced.length === 0 && window.__game.busy);
    ok(`Space rolls right after clicking ${id}`, started && (await attr(page, id, 'aria-pressed')) === after, `pressed ${before}->${after}, focus=${await page.evaluate(() => document.activeElement.id || document.activeElement.tagName)}`);
    await waitIdle(page);
    if (id !== 'followBtn') await page.click('#' + id); // restore
    if (id === 'mapBtn') await page.click('#followBtn');
  }
  // keyboard users: Tab onto a button and Space activates it (no roll)
  await waitIdle(page);
  await page.focus('#soundBtn');
  const r2 = await rolls(page);
  await page.keyboard.press('Space');
  await sleep(300);
  ok('keyboard focus + Space toggles that button (accessible)', (await attr(page, 'soundBtn', 'aria-pressed')) === 'true' && (await rolls(page)) === r2);
  await page.keyboard.press('Space');
  await page.evaluate(() => document.activeElement.blur());
  ok('sound back on', (await attr(page, 'soundBtn', 'aria-pressed')) === 'false' && (await attr(page, 'soundBtn', 'aria-label')) === 'Mute sound');

  // ---- camera modes
  await page.click('#mapBtn');
  await sleep(1800);
  ok('map view on', (await attr(page, 'mapBtn', 'aria-pressed')) === 'true' && (await attr(page, 'followBtn', 'aria-pressed')) === 'false');
  await shot(page, 'ui_map');
  await force(page, [2]);
  await page.keyboard.press('Space');
  await sleep(700);
  ok('map view stays while rolling', (await attr(page, 'mapBtn', 'aria-pressed')) === 'true');
  await waitIdle(page);
  await page.click('#followBtn');
  await sleep(1200);
  ok('follow restores', (await attr(page, 'followBtn', 'aria-pressed')) === 'true');
  await page.mouse.move(640, 380);
  await page.mouse.down();
  await page.mouse.move(420, 300, { steps: 10 });
  await page.mouse.up();
  await sleep(300);
  ok('dragging switches to free look', (await page.evaluate(() => window.__game.view.world.rig.mode)) === 'free' && (await attr(page, 'followBtn', 'aria-pressed')) === 'false');
  await page.mouse.wheel(0, 900);
  await sleep(600);
  await shot(page, 'ui_freelook');
  await waitIdle(page);
  await force(page, [1]);
  await page.keyboard.press('Space');
  await sleep(300);
  ok('rolling snaps back to follow', (await attr(page, 'followBtn', 'aria-pressed')) === 'true');
  await waitIdle(page);

  // ---- spam input
  await force(page, [2, 2, 2, 2]);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Space');
    await page.click('#rollBtn', { force: true }).catch(() => {});
    await page.keyboard.press('Enter');
  }
  await sleep(200);
  const left = await page.evaluate(() => window.__game.game.forced.length);
  ok('hammering inputs rolls exactly once', left === 3, `${4 - left} rolls started`);
  await force(page, []);
  // computer turn: roll disabled, Space ignored
  await page.waitForFunction(() => window.__game.state.current === 1, null, { timeout: 30000 }).catch(() => {});
  ok('roll disabled on computer turn', await page.$eval('#rollBtn', (e) => e.disabled), await page.textContent('#turn'));
  const r4 = await page.evaluate(() => window.__game.state.players[0].rolls);
  await page.keyboard.press('Space');
  await sleep(200);
  ok('Space ignored on computer turn', (await page.evaluate(() => window.__game.state.players[0].rolls)) === r4);
  await waitIdle(page);
  await sync(page, 'after camera/input tests');

  // ---- pause mid-animation and resume
  await force(page, [5]);
  await page.keyboard.press('Space');
  await sleep(1500);
  const midPos = await page.evaluate(() => window.__game.view.pawns[0].root.position.toArray());
  await page.click('#menuBtn');
  await sleep(1500);
  const pausedPos = await page.evaluate(() => window.__game.view.pawns[0].root.position.toArray());
  ok('menu pauses mid-move', !(await page.$eval('#resumeBtn', (e) => e.hidden)) && Math.hypot(...midPos.map((v, i) => v - pausedPos[i])) < 2.5 && (await st(page)).paused);
  await shot(page, 'ui_paused');
  await sleep(1000);
  const pausedPos2 = await page.evaluate(() => window.__game.view.pawns[0].root.position.toArray());
  ok('nothing moves while paused', Math.hypot(...pausedPos.map((v, i) => v - pausedPos2[i])) < 0.01);
  await page.keyboard.press('Escape');
  await sleep(300);
  ok('Escape resumes', !(await st(page)).paused && (await page.$eval('#menu', (e) => e.classList.contains('hidden'))));
  await waitIdle(page);
  await sync(page, 'after pause/resume');

  // ---- pause between turns: snakes roam behind the menu, then snap back on resume
  await waitIdle(page);
  const beforePause = await page.evaluate(() => window.__game.view.snakes.map((s) => [s.base[0].x, s.base[0].z]));
  await page.click('#menuBtn');
  await sleep(3500);
  const pausedMoved = await page.evaluate((b) => window.__game.view.snakes.filter((s, i) => Math.hypot(s.base[0].x - b[i][0], s.base[0].z - b[i][1]) > 1).length, beforePause);
  ok('paused menu: snakes roam', pausedMoved >= 4, `${pausedMoved} moving`);
  await page.click('#resumeBtn');
  await sleep(300);
  await sync(page, 'resume after roaming (snakes back in lairs)');

  // ---- fuzz: interrupt turns at random moments, then resume or restart
  let fuzzBad = 0;
  for (let i = 0; i < 24; i++) {
    const s0 = await st(page);
    if (s0.winner !== null || !s0.started) {
      await page.evaluate(() => window.__game.game.newGame('pvp'));
      await sleep(400);
    }
    // roll a few random dice to reach varied situations (snake moves happen every 6 turns)
    const n = 1 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const s1 = await st(page);
      if (s1.winner !== null) break;
      if (s1.p[s1.cur].skip || (s1.mode === 'ai' && s1.cur === 1)) { await waitIdle(page).catch(() => {}); continue; }
      await force(page, [1 + Math.floor(Math.random() * 6)]);
      await page.keyboard.press('Space');
      await waitIdle(page).catch(() => {});
    }
    const s2 = await st(page);
    if (s2.winner === null && !(s2.mode === 'ai' && s2.cur === 1) && !s2.p[s2.cur].skip) {
      await force(page, [1 + Math.floor(Math.random() * 6)]);
      await page.keyboard.press('Space');
    }
    await sleep(Math.random() * 4000);
    await page.click('#menuBtn', { force: true });
    await sleep(200 + Math.random() * 500);
    const choice = Math.random();
    if (choice < 0.45 && !(await page.$eval('#resumeBtn', (e) => e.hidden))) await page.click('#resumeBtn');
    else await page.click(choice < 0.75 ? '#play2' : '#playAI');
    const settled = await page.waitForFunction(() => {
      const g = window.__game;
      return !g.busy && (g.state.winner !== null || !document.getElementById('rollBtn').disabled || g.state.players[g.state.current].isAI || g.state.players[g.state.current].skip);
    }, null, { timeout: 60000, polling: 100 }).then(() => true, () => false);
    await sleep(80);
    const probs = settled ? (await st(page)).winner === null ? await checkSync(page) : [] : ['stalled'];
    if (probs.length) { fuzzBad++; console.log('   fuzz', i, probs.join('; ')); await shot(page, 'ui_fuzz_' + i); }
  }
  ok('24 random interrupts (resume / restart mid-animation) leave a consistent game', fuzzBad === 0, `${fuzzBad} bad`);

  // ---- quick win, win panel, menu during celebration, play again
  await page.evaluate(() => window.__game.game.newGame('pvp'));
  await sleep(500);
  const tourA = ['win'];
  for (let k = 0; k < 80; k++) {
    const s = await page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
    if (s.winner !== null) break;
    if (!s.players[s.current].skip) {
      await force(page, [s.current === 0 ? guidedRoll(s, 0, tourA, new Set()) : 1]);
      await page.keyboard.press('Space');
    }
    await page.waitForFunction(() => !window.__game.busy, null, { timeout: 60000, polling: 100 });
    await sleep(150);
  }
  await page.waitForFunction(() => !document.getElementById('win').classList.contains('hidden'), null, { timeout: 30000 });
  await sleep(500);
  await shot(page, 'ui_win');
  const wt = await page.evaluate(() => [document.getElementById('winTitle').textContent, document.getElementById('winText').textContent, document.getElementById('stats').innerText]);
  ok('win panel text', wt[0] === 'Aqua wins!' && /reached tile 100 in \d+ rolls?\./.test(wt[1]) && /shortcut/.test(wt[2]), wt.slice(0, 2).join(' | '));
  ok('roll disabled after win', await page.$eval('#rollBtn', (e) => e.disabled));
  await page.keyboard.press('Space');
  await sleep(300);
  ok('Space on win panel does nothing', !(await page.$eval('#win', (e) => e.classList.contains('hidden'))));
  await page.click('#againBtn');
  await sleep(800);
  const fresh = await page.evaluate(() => {
    const g = window.__game;
    const s = g.state;
    return s.players.every((p) => p.pos === 0 && p.rolls === 0 && !p.shield && !p.skip) && s.snakeRoute.every((r) => r === 0) && s.mangoes.length === 8 && s.shields.length === 3;
  });
  ok('Play again resets board, snakes, mangoes and shields', fresh);
  await sync(page, 'after play again');
  // leave during a victory dance: the win panel must not pop over the menu
  for (let k = 0; k < 80; k++) {
    const s = await page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
    if (s.winner !== null) break;
    if (!s.players[s.current].skip) {
      await force(page, [s.current === 0 ? guidedRoll(s, 0, ['win'], new Set()) : 1]);
      await page.keyboard.press('Space');
    }
    await page.waitForFunction(() => !window.__game.busy || window.__game.state.winner !== null, null, { timeout: 60000, polling: 50 });
    await sleep(100);
  }
  await sleep(600);
  await page.click('#menuBtn', { force: true });
  await sleep(4000);
  ok('menu during victory dance stays on menu', (await page.$eval('#win', (e) => e.classList.contains('hidden'))) && !(await page.$eval('#menu', (e) => e.classList.contains('hidden'))) && (await page.$eval('#resumeBtn', (e) => e.hidden)));
  await page.click('#playAI');
  await sleep(600);
  await sync(page, 'new game after leaving a won match');

  ok('desktop console clean', logs.length === 0, logs.join(' | '));
  await browser.close();
}

/* ============================================= persistence after reload */
{
  const { browser, page } = await open();
  await page.click('#speedBtn', { force: true }).catch(() => {});
  await page.evaluate(() => { localStorage.setItem('snakejungle.fast', '1'); localStorage.setItem('snakejungle.muted', '1'); });
  await page.reload();
  await page.waitForFunction(() => document.body.classList.contains('ready'));
  ok('speed setting persists', (await attr(page, 'speedBtn', 'aria-pressed')) === 'true');
  ok('mute setting persists', (await attr(page, 'soundBtn', 'aria-pressed')) === 'true' && (await attr(page, 'soundBtn', 'aria-label')) === 'Turn sound on');
  await page.evaluate(() => localStorage.clear());
  await browser.close();
}

/* ========================================================= responsive */
const sizes = [[320, 640, true], [360, 780, true], [375, 667, true], [390, 844, true], [414, 896, true], [768, 1024, true], [667, 375, true], [844, 390, true], [1024, 768, false], [1920, 1080, false]];
for (const [w, h, mobile] of sizes) {
  const { browser, page, logs } = await open({ width: w, height: h, mobile });
  if (w === 390) await shot(page, `m_menu_${w}x${h}`);
  const menuFits = await page.evaluate(() => [...document.querySelectorAll('#menu button:not([hidden])')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; }));
  await page.click('#playAI', { force: true });
  await sleep(1300);
  const lay = await page.evaluate(() => {
    const ids = ['menuBtn', 'followBtn', 'mapBtn', 'speedBtn', 'soundBtn', 'rollBtn', 'card0', 'card1', 'turn', 'track'];
    const R = Object.fromEntries(ids.map((id) => [id, document.getElementById(id).getBoundingClientRect()]));
    const inside = ids.filter((id) => !(R[id].left >= -0.5 && R[id].right <= innerWidth + 0.5 && R[id].top >= -0.5 && R[id].bottom <= innerHeight + 0.5));
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const overlaps = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (hit(R[ids[i]], R[ids[j]])) overlaps.push(ids[i] + '/' + ids[j]);
    return { inside, overlaps, scrollW: document.documentElement.scrollWidth, w: innerWidth };
  });
  ok(`${w}x${h}: menu buttons fit`, menuFits);
  ok(`${w}x${h}: HUD fully on screen`, lay.inside.length === 0, lay.inside.join(','));
  ok(`${w}x${h}: HUD elements don't overlap`, lay.overlaps.length === 0, lay.overlaps.join(','));
  if (mobile) await page.tap('#rollBtn', { force: true });
  else await page.keyboard.press('Space');
  await sleep(1600);
  await shot(page, `m_game_${w}x${h}`);
  await page.waitForFunction(() => window.__game.state.players[0].rolls >= 1, null, { timeout: 30000, polling: 100 }).catch(() => {});
  ok(`${w}x${h}: roll works`, (await page.evaluate(() => window.__game.state.players[0].rolls)) >= 1);
  await waitIdle(page).catch(() => {});
  if (mobile) await page.tap('#mapBtn', { force: true });
  else await page.click('#mapBtn', { force: true });
  await sleep(2000);
  await shot(page, `m_map_${w}x${h}`);
  ok(`${w}x${h}: console clean`, logs.length === 0, logs.join(' | '));
  await browser.close();
}

/* ============================================================ fallback */
{
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : orig.call(this, t, ...a); };
  });
  await page.goto(BASE);
  await sleep(2500);
  const f = await page.evaluate(() => ({ fatal: !document.getElementById('fatal').classList.contains('hidden'), menu: !document.getElementById('menu').classList.contains('hidden'), hudHidden: document.body.classList.contains('in-menu') }));
  ok('no-WebGL fallback message (HUD hidden)', f.fatal && !f.menu && f.hudHidden, JSON.stringify(f));
  await page.screenshot({ path: new URL('./out/ui_fallback.png', import.meta.url).pathname });
  await browser.close();
}

/* ========================================================= performance */
{
  const { browser, page, logs } = await open({ width: 1280, height: 800 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.click('#playAI', { force: true });
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    if (!(await page.$eval('#rollBtn', (e) => e.disabled))) await page.keyboard.press('Space');
    await sleep(500);
  }
  const perf = await page.evaluate(() => ({ fps: window.__game.fps, q: window.__game.quality, rolls: window.__game.state.players[0].rolls }));
  ok('4x CPU throttle: still playable', perf.rolls >= 2 && perf.fps > 25, `fps ${perf.fps.toFixed(0)}, quality level ${perf.q}, rolls ${perf.rolls}`);
  ok('throttled console clean', logs.length === 0, logs.join(' | '));
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\nUI SUMMARY: ${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log('  FAIL', f.name, f.extra);
process.exit(failed.length ? 1 : 0);
