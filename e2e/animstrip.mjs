// Frame strips of every hero animation clip, both heroes side by side (studio framing on the start pad).
import { open, sleep, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const SOLO = process.argv[2] || '';
const { browser, page, logs } = await open({ width: 720, height: 560 });
await page.click('#play2', { force: true });
await page.evaluate((s) => (window.__solo = s), SOLO);
await sleep(1200);
await page.evaluate(() => {
  const v = window.__game.view;
  v.world.rig.setMode('free');
  v.hideReach();
  v.hideTurnRing();
  v.idleFacing = false;
  const [a, b] = v.pawns;
  const V = a.root.position.constructor;
  a.root.position.set(-18.4, 0.05, 23.2);
  b.root.position.set(-16.0, 0.05, 23.2);
  a.faceInstant(new V(0.25, 0, 1));
  b.faceInstant(new V(-0.25, 0, 1));
  v.world.camera.position.set(-17.2, 2.0, 28.9);
  v.world.controls.target.set(-17.2, 1.2, 23.2);
  if (window.__solo) {
    const x = window.__solo === 'aqua' ? -18.4 : -16.0;
    v.world.camera.position.set(x, 1.6, 27.4);
    v.world.controls.target.set(x, 1.15, 23.2);
  }
  window.__clip = null;
  // drive k/phase from time for the clip under test
  const tick = (ts) => {
    const c = window.__clip;
    if (c) {
      const t = (performance.now() - c.t0) / 1000;
      for (const p of v.pawns) {
        p.k = Math.min(1, (t % c.period) / c.period);
        p.phase = t * c.rate;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const clips = [
  ['idle', 2.4, 0], ['hop', 0.5, 0], ['walk', 1, 9], ['climb', 1, 9], ['hang', 1, 5], ['swim', 1, 0], ['stuck', 1, 0], ['throw', 0.7, 0], ['cheer', 0.5, 0], ['scared', 1, 0],
];
const sheets = [];
for (const [name, period, rate] of clips) {
  await page.evaluate(([name, period, rate]) => {
    const v = window.__game.view;
    for (const p of v.pawns) { p.act(name); if (name === 'idle') { p.waveIn = 0.4; p.setMood('normal', 0); } }
    window.__clip = { t0: performance.now(), period, rate };
  }, [name, period, rate]);
  await sleep(250);
  const files = [];
  for (let i = 0; i < 6; i++) {
    const f = `${OUT}anim_${name}_${i}.png`;
    await page.screenshot({ path: f });
    files.push(f);
    await sleep(name === 'idle' ? 330 : 110);
  }
  const sheet = `${OUT}anim_${SOLO}${name}.png`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]crop=${SOLO ? '360:440:180:40' : '500:420:110:50'},scale=${SOLO ? '180:220' : '250:210'}[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}hstack=inputs=6`, '-frames:v', '1', sheet]);
  files.forEach((f) => fs.unlinkSync(f));
  sheets.push(sheet);
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...sheets.flatMap((f) => ['-i', f]), '-filter_complex', `vstack=inputs=${sheets.length}`, '-frames:v', '1', `${OUT}anim_${SOLO}all.png`]);
console.log(logs.join('\n') || 'console clean');
await browser.close();
