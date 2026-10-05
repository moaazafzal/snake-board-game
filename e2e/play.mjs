// Plays complete matches in a real browser and checks scene/state sync after every turn.
// usage: node e2e/play.mjs mode=ai|pvp games=2 guided=0|1 fast=1 tag=name
import { open, shot, sleep, st, checkSync } from './lib.mjs';
import { tours, guidedRoll } from './planner.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const MODE = args.mode || 'ai';
const GAMES = +(args.games || 1);
const GUIDED = args.guided === '1';
const FAST = args.fast !== '0';
const TAG = args.tag || `${MODE}${GUIDED ? '_guided' : ''}`;
const MAXTURNS = +(args.maxturns || 400);

const { browser, page, logs } = await open({ init: FAST ? () => localStorage.setItem('snakejungle.fast', '1') : undefined });

/* ------------------------------------------------------------------------ run */
const issues = [];
const seen = new Map();
let totalTurns = 0;
for (let g = 0; g < GAMES; g++) {
  await page.click(g === 0 ? (MODE === 'ai' ? '#playAI' : '#play2') : '#againBtn', { force: true });
  await sleep(800);
  const custom = args.tours ? JSON.parse(args.tours) : null;
  const tour = custom ? JSON.parse(JSON.stringify(custom[g % custom.length])) : tours(g);
  const visited = [new Set(), new Set()];
  let lastTurns = -1;
  let n = 0;
  const t0 = Date.now();
  // capture toasts
  await page.evaluate(() => {
    window.__toasts = [];
    const el = document.getElementById('toast');
    new MutationObserver(() => el.textContent && window.__toasts.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
  while (true) {
    const ready = await page.waitForFunction(() => {
      const g = window.__game;
      return g.state.winner !== null || (!g.busy && (!document.getElementById('rollBtn').disabled || g.state.players[g.state.current].isAI || g.state.players[g.state.current].skip));
    }, null, { timeout: 120000, polling: 100 }).then(() => true, () => false);
    if (!ready) { issues.push({ g, n, msg: 'STALL: game did not become ready in 120s', state: await st(page) }); await shot(page, `${TAG}_stall`); break; }
    const s = await page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
    if (s.turns !== lastTurns) {
      lastTurns = s.turns;
      if (s.winner === null) {
        // let the HUD settle a frame, then verify the scene matches the state
        await sleep(60);
        const probs = await checkSync(page);
        if (probs.length) { issues.push({ g, n, probs }); console.log(`  !! turn ${n}:`, probs.join('; ')); await shot(page, `${TAG}_desync_${g}_${n}`); }
      }
      const toasts = await page.evaluate(() => window.__toasts.splice(0));
      for (const t of toasts) {
        const key = t.replace(/\d+/g, '#').replace(/(You|Aqua|Leorus)/g, 'X').replace(/(Mossback|Ember|Violet|Lagoon|Tiger|Sunny|Rosa)/, 'S');
        if (!seen.has(key)) { seen.set(key, t); await shot(page, `${TAG}_ev_${seen.size}`); }
      }
    }
    if (s.winner !== null) break;
    const cur = s.players[s.current];
    if (!cur.isAI && !cur.skip) {
      if (++n > MAXTURNS) { issues.push({ g, msg: 'too many turns' }); break; }
      if (GUIDED) await page.evaluate((r) => window.__game.force([r]), guidedRoll(s, s.current, tour[s.current], visited[s.current]));
      // alternate input methods: keyboard, click, Enter
      const how = n % 3;
      if (how === 0) await page.keyboard.press('Space');
      else if (how === 1) await page.click('#rollBtn', { force: true });
      else await page.keyboard.press('Enter');
    } else if (GUIDED && cur.isAI) {
      await page.evaluate((r) => window.__game.force([r]), guidedRoll(s, s.current, tour[s.current], visited[s.current]));
    }
    await sleep(120);
  }
  await page.waitForFunction(() => !document.getElementById('win').classList.contains('hidden'), null, { timeout: 30000 }).catch(() => issues.push({ g, msg: 'win panel missing' }));
  await sleep(500);
  await shot(page, `${TAG}_win_${g}`);
  const final = await st(page);
  totalTurns += final.turns;
  const winText = await page.evaluate(() => [document.getElementById('winTitle').textContent, document.getElementById('winText').textContent, document.getElementById('stats').innerText.replace(/\n/g, ' | ')]);
  console.log(`game ${g}: ${winText[0]} ${winText[1]} [${((Date.now() - t0) / 1000) | 0}s, ${final.turns} turns]`);
  console.log('   ', winText[2]);
  if (GUIDED) console.log('    visited:', [...visited[0]].join(','), '|', [...visited[1]].join(','));
}
console.log('\nevent messages seen:');
for (const t of seen.values()) console.log('  -', t);
const fps = await page.evaluate(() => window.__game.fps);
console.log(`\n${TAG}: ${GAMES} games, ${totalTurns} turns, ${issues.length} issues, fps ${fps.toFixed(0)}, quality level ${await page.evaluate(() => window.__game.quality)}`);
for (const i of issues) console.log('ISSUE', JSON.stringify(i).slice(0, 600));
console.log(logs.length ? 'CONSOLE:\n' + logs.join('\n') : 'console clean');
await browser.close();
process.exit(issues.length || logs.some((l) => /error|failed|http [45]/.test(l)) ? 1 : 0);
