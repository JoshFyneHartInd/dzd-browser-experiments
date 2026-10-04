// Browser smoke test: node tests/ui.smoke.mjs   (needs Playwright + Chromium, and the game served on :8080)
// Starts a run, opens every system's detail view while the sim runs, and fails on any JS error.
import { createRequire } from 'node:module';
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { try { ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright')); } catch { console.log('skipped: Playwright not installed'); process.exit(0); } }

const url = process.env.DEEPWATCH_URL || 'http://localhost:8080/index.html?debug=1';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => localStorage.setItem('deepwatch.global', JSON.stringify({ tutorialSeen: true })));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try { await page.goto(url); } catch { console.log('skipped: game is not being served at ' + url); await browser.close(); process.exit(0); }
await page.locator('[data-k="start"]').click();
await page.waitForSelector('.tile[data-sys]');
const ids = await page.evaluate(() => [...document.querySelectorAll('.tile[data-sys]')].map((t) => t.dataset.sys));
for (const id of ids) {
  await page.locator(`.tile[data-sys="${id}"]`).click();
  await page.evaluate(() => { window.deepwatch.speed = 20; });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.deepwatch.speed = 1; });
  const built = await page.evaluate(() => document.querySelectorAll('.detail .detail-grid').length);
  if (!built) errors.push(`${id}: detail view did not render`);
  await page.locator('[data-k="back"]').click();
}
await browser.close();
if (errors.length) { console.log(`${errors.length} FAILURE(S):`); errors.forEach((e) => console.log('  x ' + e)); process.exit(1); }
console.log(`UI smoke test: opened ${ids.length} detail views with no errors.`);
