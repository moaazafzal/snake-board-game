// Close-up frame capture: node e2e/closeup.mjs name 5,1,6,6,1,6,4 [frames] [interval]
import { open, sleep, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [name, seq, nFrames = '20', every = '220'] = process.argv.slice(2);
const rolls = seq.split(',').map(Number);
const { browser, page, logs } = await open({ width: 960, height: 600 });
await page.click('#play2', { force: true });
await sleep(1000);
const idle = () => page.waitForFunction(() => !window.__game.busy && (!document.getElementById('rollBtn').disabled || window.__game.state.winner !== null), null, { timeout: 60000, polling: 100 });
await page.evaluate(() => localStorage.setItem('snakejungle.fast', '1'));
await page.evaluate(() => window.__game.view.setSpeed(true));
for (let i = 0; i < rolls.length - 1; i++) { await page.evaluate((r) => window.__game.force([r]), rolls[i]); await page.keyboard.press('Space'); await sleep(200); await idle(); }
await page.evaluate(() => window.__game.view.setSpeed(false));
const dir = OUT + 'close/'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
await page.evaluate((r) => window.__game.force([r]), rolls.at(-1));
await page.keyboard.press('Space');
const files = [];
for (let i = 0; i < +nFrames; i++) { const f = `${dir}${String(i).padStart(2, '0')}.png`; await page.screenshot({ path: f }); files.push(f); await sleep(+every); }
fs.writeFileSync(dir + 'l.txt', files.map((f) => `file '${f}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', dir + 'l.txt', '-vf', 'scale=480:300,tile=4x5', '-frames:v', '1', `${OUT}close_${name}.png`]);
console.log(JSON.stringify(await page.evaluate(() => window.__game.state.players.map((p) => p.pos))), logs.join('\n') || 'clean');
await browser.close();
