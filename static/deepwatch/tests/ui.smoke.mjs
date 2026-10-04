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

// ---- Every control type does its job (each one feeds the same set-point model as the old slider) ----
const get = (k) => page.evaluate((k) => window.deepwatch.sim.ctl[k].set, k);
const open = async (id) => { await page.locator(`.tile[data-sys="${id}"]`).click(); await page.waitForSelector('.detail .detail-grid'); };
const back = () => page.locator('[data-k="back"]').click();
const expect = (name, ok, info = '') => { if (!ok) errors.push(`control: ${name} ${info}`); };

await open('power');                                            // knob, guarded switch, lever
let before = await get('power.throttle');
const knob = page.locator('.ctl[data-ctl="throttle"] svg.knob');
const kb = await knob.boundingBox();
await page.mouse.click(kb.x + kb.width * 0.9, kb.y + kb.height / 2); // right edge of the dial = high end
expect('knob drag/click raises the value', (await get('power.throttle')) > before + 20, `(was ${before})`);
await knob.focus(); await page.keyboard.press('Home');
expect('knob Home key sets the minimum', (await get('power.throttle')) === 0);
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
expect('knob arrow keys step by 1', (await get('power.throttle')) === 2);
const labs = page.locator('.ctl[data-ctl="shedLabs"]');
expect('guarded switch starts covered', await labs.locator('.guard-cover').isVisible());
await labs.locator('.switch').click({ force: true });
expect('covered switch ignores clicks', (await get('power.shedLabs')) === 0);
await labs.locator('.guard-cover').click();
await labs.locator('.switch').click();
expect('uncovered switch turns on', (await get('power.shedLabs')) === 1);
await page.waitForTimeout(300);
expect('cover is not needed to switch off', !(await labs.locator('.guard-cover').isVisible()));
await labs.locator('.switch').click();
expect('guarded switch turns off without the cover', (await get('power.shedLabs')) === 0);
await page.locator('.ctl[data-ctl="shedComms"] .lever').click();
expect('lever turns on', (await get('power.shedComms')) === 1);
await back();

await open('air');                                              // vertical fader
const v = page.locator('.ctl[data-ctl="o2feed"] input');
await v.focus(); await page.keyboard.press('End');
expect('vertical fader End key sets the maximum', (await get('air.o2feed')) === 100);
await back();

await open('hull');                                             // step selector + radio keyboard behaviour
await page.locator('.ctl[data-ctl="pump"] .step', { hasText: 'High' }).click();
expect('step selector sets its detent value', (await get('hull.pump')) === 100);
await page.locator('.ctl[data-ctl="pump"] .step[aria-checked="true"]').focus();
await page.keyboard.press('ArrowLeft');
expect('step selector arrow key moves one detent', (await get('hull.pump')) === 50);
await back();

await open('fuel');                                             // valve wheel
const val = page.locator('.ctl[data-ctl="valve"] svg.knob');
await val.focus(); await page.keyboard.press('End');
expect('valve wheel End key sets the maximum', (await get('fuel.valve')) === 100);
await back();

await open('airlock');                                          // two-step button
const cyc = page.locator('.ctl[data-ctl="cycle"] button.job');
const busy = () => page.evaluate(() => window.deepwatch.sim.jobs['airlock.cycle'].active);
await cyc.click();
expect('first press only arms the button', (await cyc.getAttribute('class')).includes('is-armed') && !(await busy()));
await cyc.click();
expect('second press starts the job', await busy());
await back();

await browser.close();
if (errors.length) { console.log(`${errors.length} FAILURE(S):`); errors.forEach((e) => console.log('  x ' + e)); process.exit(1); }
console.log(`UI smoke test: opened ${ids.length} detail views with no errors.`);
