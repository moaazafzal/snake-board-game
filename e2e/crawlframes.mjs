// Frame strip of a snake relocation (follow cam) and a swallow, tiled with ffmpeg.
import { open, sleep, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [si = '4', from = '0', to = '1', name = 'crawl', every = '230', count = '24'] = process.argv.slice(2);
const { browser, page } = await open({ width: 960, height: 600 });
await page.click('#play2', { force: true });
await sleep(1500);
const dir = OUT + 'crawl/';
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
await page.evaluate(([si, from, to]) => {
  const v = window.__game.view;
  const def = v.snakes[si].def;
  v.reset({ ...window.__game.state, snakeRoute: window.__game.state.snakeRoute.map((x, i) => (i === si ? from : x)) });
  window.__done = false;
  setTimeout(() => v.moveSnake(si, def.routes[from], def.routes[to]).then(() => (window.__done = true)), 600);
}, [+si, +from, +to]);
await sleep(700);
const files = [];
for (let i = 0; i < +count; i++) {
  const f = `${dir}${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: f });
  files.push(f);
  await sleep(+every);
}
fs.writeFileSync(dir + 'l.txt', files.map((f) => `file '${f}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', dir + 'l.txt', '-vf', 'scale=480:300,tile=4x6', '-frames:v', '1', `${OUT}${name}.png`]);
console.log('done', await page.evaluate(() => window.__done));
await browser.close();
