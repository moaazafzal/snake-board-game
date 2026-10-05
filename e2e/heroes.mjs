// Close-up renders of Aqua and Leorus (moods), plus menu and HUD shots.
import { open, sleep, shot, OUT } from './lib.mjs';
import { execFileSync } from 'node:child_process';
const { browser, page, logs } = await open({ width: 900, height: 700 });
await shot(page, 'hero_menu');
await page.click('#playAI', { force: true });
await sleep(1500);
await shot(page, 'hero_hud');
const shots = [];
for (const [mood, yaw] of [['normal', 0], ['happy', 0.5], ['wow', -0.5], ['scared', 0.9]]) {
  await page.evaluate(([mood, yaw]) => {
    const v = window.__game.view;
    const rig = v.world.rig;
    rig.setMode('free');
    const [a, b] = v.pawns;
    a.root.position.set(-19.1, 0.05, 23.4); b.root.position.set(-16.9, 0.05, 23.4);
    a.faceInstant(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))); b.faceInstant(new THREE.Vector3(Math.sin(-yaw), 0, Math.cos(-yaw)));
    a.setMood(mood, 99); b.setMood(mood, 99);
    const cam = v.world.camera;
    cam.position.set(-18, 1.9, 28.4);
    v.world.controls.target.set(-18, 1.05, 23.4);
    v.hideReach();
    v.hideTurnRing();
  }, [mood, yaw]).catch(async () => {
    // THREE isn't global in the page: use the pawn's own vector type
    await page.evaluate(([mood, yaw]) => {
      const v = window.__game.view;
      v.world.rig.setMode('free');
      const [a, b] = v.pawns;
      const V = a.root.position.constructor;
      a.root.position.set(-19.1, 0.05, 23.4); b.root.position.set(-16.9, 0.05, 23.4);
      a.faceInstant(new V(Math.sin(yaw), 0, Math.cos(yaw))); b.faceInstant(new V(Math.sin(-yaw), 0, Math.cos(-yaw)));
      a.setMood(mood, 99); b.setMood(mood, 99);
      v.world.camera.position.set(-18, 1.9, 28.4);
      v.world.controls.target.set(-18, 1.05, 23.4);
      v.hideReach();
      v.hideTurnRing();
    }, [mood, yaw]);
  });
  await sleep(700);
  const f = `${OUT}hero_${mood}.png`;
  await page.screenshot({ path: f });
  shots.push(f);
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...shots.flatMap((f) => ['-i', f]), '-filter_complex', `${shots.map((_, i) => `[${i}]scale=450:350[s${i}]`).join(';')};[s0][s1][s2][s3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0`, '-frames:v', '1', `${OUT}heroes.png`]);
console.log(logs.join('\n') || 'console clean');
await browser.close();
