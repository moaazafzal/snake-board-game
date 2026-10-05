import { open, sleep } from './lib.mjs';
const { browser, page } = await open({ width: 1400, height: 820 });
await page.click('#playAI', { force: true });
await sleep(800);
await page.evaluate(() => { window.__game.view.setSpeed(true); window.__game.force([6, 6, 3, 2, 4, 5]); });
for (let i = 0; i < 4; i++) {
  await page.waitForFunction(() => !window.__game.busy && !document.getElementById('rollBtn').disabled, null, { timeout: 60000 });
  await page.keyboard.press('Space');
  await sleep(500);
}
await page.waitForFunction(() => !window.__game.busy && !document.getElementById('rollBtn').disabled, null, { timeout: 60000 });
await page.click('#mapBtn', { force: true });
await sleep(2500);
await page.screenshot({ path: 'docs/screenshot.png' });
await browser.close();
