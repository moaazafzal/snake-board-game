// Frames of the main menu while snakes roam (tiled with ffmpeg) + movement stats.
import { open, sleep, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const { browser, page, logs } = await open({ width: 1280, height: 760 });
const dir = OUT + 'menu/';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const lairs = await page.evaluate(() => window.__game.view.snakes.map((s) => [s.base[0].x, s.base[0].z]));
const files = [];
for (let i = 0; i < 12; i++) {
  await sleep(900);
  const f = `${dir}${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
const heads = await page.evaluate(() => window.__game.view.snakes.map((s) => [s.base[0].x, s.base[0].z]));
const moved = heads.map((h, i) => Math.hypot(h[0] - lairs[i][0], h[1] - lairs[i][1]));
console.log('head distance from lair after ~11s:', moved.map((m) => m.toFixed(1)).join(' '));
console.log('max |x|,|z| of any head:', Math.max(...heads.flat().map(Math.abs)).toFixed(2));
fs.writeFileSync(dir + 'l.txt', files.map((f) => `file '${f}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', dir + 'l.txt', '-vf', 'scale=640:380,tile=3x4', '-frames:v', '1', `${OUT}menu_roam.png`]);
console.log(logs.join('\n') || 'console clean');
await browser.close();
