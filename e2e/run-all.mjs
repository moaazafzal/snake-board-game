// Runs every browser suite in sequence (needs `npm run build && npm run preview` running, or BASE_URL set).
import { spawnSync } from 'node:child_process';

const suites = [
  ['e2e/play.mjs', 'mode=ai', 'games=1'],
  ['e2e/play.mjs', 'mode=pvp', 'games=2', 'guided=1', 'tag=tour'],
  ['e2e/ui.mjs'],
];
let failed = 0;
for (const s of suites) {
  console.log(`\n=== ${s.join(' ')}`);
  const r = spawnSync(process.execPath, s, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nall browser suites passed');
process.exit(failed ? 1 : 0);
