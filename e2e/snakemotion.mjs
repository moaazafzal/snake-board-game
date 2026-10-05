// Measures snake motion quality in the real renderer: resting stillness, crawl smoothness and sideways slip.
import { open, sleep, checkSync } from './lib.mjs';
const { browser, page, logs } = await open({ width: 960, height: 600 });
await page.click('#play2', { force: true });
await sleep(800);
const idle = await page.evaluate(() => new Promise((res) => {
  const sn = window.__game.view.snakes[0];
  const start = sn.base.map((p) => p.clone());
  let maxDev = 0;
  const t0 = performance.now();
  const tick = () => {
    sn.base.forEach((p, i) => { if (i > 25 && i < 120) maxDev = Math.max(maxDev, Math.hypot(p.x - start[i].x, p.z - start[i].z)); });
    if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res({ maxDev });
  };
  requestAnimationFrame(tick);
}));
console.log(`idle: resting body drift ${idle.maxDev.toFixed(4)} units (should be ~0)`);
let worst = { slip: 0, step: 0, jerk: 0 };
for (const [si, from, to] of [[0, 0, 1], [3, 0, 1], [6, 0, 1], [6, 1, 0], [4, 0, 1]]) {
  const r = await page.evaluate(async ([si, from, to]) => {
    const v = window.__game.view;
    const sn = v.snakes[si];
    const def = sn.def;
    v.reset({ ...window.__game.state, snakeRoute: window.__game.state.snakeRoute.map((x, i) => (i === si ? from : x)) });
    const frames = [];
    let on = true;
    const tick = () => { frames.push(sn.base.filter((_, i) => i % 5 === 0).map((p) => [p.x, p.z])); if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    await v.moveSnake(si, def.routes[from], def.routes[to]);
    on = false;
    // restore the true state for later checks
    v.reset(window.__game.state);
    return frames;
  }, [si, from, to]);
  let slip = 0, step = 0, jerk = 0, prevStep = null;
  for (let f = 1; f < r.length; f++) {
    const a = r[f - 1], b = r[f];
    const hs = Math.hypot(b[0][0] - a[0][0], b[0][1] - a[0][1]);
    step = Math.max(step, hs);
    if (prevStep !== null) jerk = Math.max(jerk, Math.abs(hs - prevStep));
    prevStep = hs;
    for (let k = 4; k < b.length - 4; k++) {
      const vx = b[k][0] - a[k][0], vz = b[k][1] - a[k][1];
      const vl = Math.hypot(vx, vz);
      if (vl < 0.02) continue;
      const tx = b[k - 1][0] - b[k + 1][0], tz = b[k - 1][1] - b[k + 1][1];
      const tl = Math.hypot(tx, tz) || 1;
      slip = Math.max(slip, Math.sqrt(Math.max(0, 1 - ((vx * tx + vz * tz) / (vl * tl)) ** 2)));
    }
  }
  console.log(`snake ${si} ${from}->${to}: ${r.length} frames, max head step ${step.toFixed(3)}, max step change ${jerk.toFixed(3)}, worst sideways slip ${(slip * 100).toFixed(1)}%`);
  worst = { slip: Math.max(worst.slip, slip), step: Math.max(worst.step, step), jerk: Math.max(worst.jerk, jerk) };
}
const probs = await checkSync(page);
console.log('scene sync after moves:', probs.length ? probs.join('; ') : 'ok');
console.log(`WORST slip ${(worst.slip * 100).toFixed(1)}% · head step ${worst.step.toFixed(3)} · step change ${worst.jerk.toFixed(3)}`);
console.log(logs.join('\n') || 'console clean');
await browser.close();
