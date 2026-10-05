// Captures mid-animation frames of every event type and tiles them into contact sheets (needs ffmpeg).
import { open, sleep, OUT } from './lib.mjs';
import { tours, guidedRoll } from './planner.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const W = 960, H = 600;
const { browser, page, logs } = await open({ width: W, height: H });
const dir = OUT + 'frames/';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
await page.click('#play2', { force: true });
await sleep(1200);
const tour = tours(0);
const visited = [new Set(), new Set()];
const wanted = /bridge|Vine|Zip|Snake!|mango|Shield|Quicksand|River|move|Bouncing|climbs|climb out|blocked|reached/i;
const done = new Set();
for (let turn = 0; turn < 160; turn++) {
  const s = await page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
  if (s.winner !== null) break;
  const cur = s.players[s.current];
  if (!cur.skip) await page.evaluate((r) => window.__game.force([r]), guidedRoll(s, s.current, tour[s.current], visited[s.current]));
  if (!cur.skip) await page.keyboard.press('Space');
  const frames = [];
  const toasts = new Set();
  const t0 = Date.now();
  await sleep(150);
  while (Date.now() - t0 < 20000) {
    const f = `${dir}t${turn}_${String(frames.length).padStart(2, '0')}.png`;
    await page.screenshot({ path: f });
    frames.push(f);
    toasts.add(await page.evaluate(() => document.getElementById('toast').textContent));
    const idle = await page.evaluate(() => !window.__game.busy && (window.__game.state.winner !== null || !document.getElementById('rollBtn').disabled || window.__game.state.players[window.__game.state.current].skip));
    if (idle && frames.length > 2) break;
    await sleep(380);
  }
  // wait out the win celebration frames too
  const label = [...toasts].filter(Boolean).join(' / ');
  const key = (label.match(wanted) || [''])[0].toLowerCase();
  if (key && !done.has(key)) {
    done.add(key);
    const pick = frames.length > 24 ? frames.filter((_, i) => i % Math.ceil(frames.length / 24) === 0) : frames;
    const list = `${dir}list_${turn}.txt`;
    fs.writeFileSync(list, pick.map((f) => `file '${f}'`).join('\n'));
    const sheet = `${OUT}sheet_${String(done.size).padStart(2, '0')}_${key.replace(/[^a-z]/g, '')}.png`;
    const cols = 6;
    const rows = Math.ceil(pick.length / cols);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=320:200,tile=${cols}x${rows}`, '-frames:v', '1', sheet]);
    console.log(`turn ${turn}: ${label} -> ${sheet.split('/').pop()}`);
  }
  if (turn % 10 === 0) for (const f of fs.readdirSync(dir)) if (f.endsWith('.png') && !f.startsWith(`t${turn}_`)) fs.unlinkSync(dir + f);
}
console.log('covered:', [...done].join(', '));
console.log(logs.join('\n') || 'console clean');
await browser.close();
