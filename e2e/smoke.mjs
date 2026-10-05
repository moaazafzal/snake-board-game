import { open, shot, sleep, st, waitIdle } from './lib.mjs';
const { browser, page, logs } = await open();
await sleep(1500);
await shot(page, 'smoke_menu');
await page.click('#playAI', { force: true });
await sleep(2500);
await shot(page, 'smoke_game');
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Space');
  await sleep(1200);
  await shot(page, 'smoke_turn' + i);
  await waitIdle(page);
}
console.log(JSON.stringify(await st(page)));
await page.click('#mapBtn', { force: true });
await sleep(2500);
await shot(page, 'smoke_map');
console.log('fps', await page.evaluate(() => window.__game.fps), 'quality', await page.evaluate(() => window.__game.quality));
console.log(logs.join('\n') || 'no console errors');
await browser.close();
