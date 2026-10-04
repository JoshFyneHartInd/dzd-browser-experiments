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


// ---- Leaving a screen must not lose a pending change: the progress bar must read the same after coming back ----
// Mirrors a player's steps: open the screen, make the change, watch the bar move, leave, return.
{
  const targets = await page.evaluate(async () => {
    const { CONFIG } = await import('/js/config.js');
    return CONFIG.systems.filter((sd) => sd.id !== 'instruments').flatMap((sd) => sd.controls.map((c) => [sd.id, c.id, c.type]));
  });
  const barOf = async (ctl) => {
    const bar = page.locator(`.ctl[data-ctl="${ctl}"] .pbar i, .ctl[data-ctl="${ctl}"] .job-bar`).first();
    if (!(await bar.count())) return -1; // screen is gone (for example the station was lost while fast-forwarding)
    return parseFloat(await bar.evaluate((el) => el.style.width || '0')) || 0;
  };
  const openScreen = async (sys) => { await page.locator(`.tile[data-sys="${sys}"]`).click({ timeout: 5000 }); await page.waitForSelector('.detail .detail-grid', { timeout: 5000 }); await page.waitForTimeout(250); };
  let checked = 0;
  for (const [sys, ctl, type] of targets) {
    await openScreen(sys);
    const started = await page.evaluate(async ([sys, ctl, type]) => {
      const m = await import('/js/sim.js'), { SYSTEM_BY_ID } = await import('/js/config.js'), sim = window.deepwatch.sim;
      const spec = SYSTEM_BY_ID[sys].controls.find((c) => c.id === ctl);
      if (type === 'fader') return m.setControl(sim, sys, ctl, sim.ctl[`${sys}.${ctl}`].set < (spec.min + spec.max) / 2 ? spec.max : spec.min);
      if (type === 'toggle') return m.setControl(sim, sys, ctl, sim.ctl[`${sys}.${ctl}`].set ? 0 : 1);
      return m.startJob(sim, `${sys}.${ctl}`);
    }, [sys, ctl, type]);
    if (!started) { await page.locator('[data-k="back"]').click(); continue; }
    // Advance in short bursts until the bar shows real progress (slow controls take longer), then freeze time so only the screen can change what we read.
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => { window.deepwatch.speed = 10; });
      await page.waitForTimeout(250);
      await page.evaluate(() => { window.deepwatch.speed = 0.0001; });
      await page.waitForTimeout(220);
      if ((await barOf(ctl)) >= 5) break;
    }
    const before = await barOf(ctl);
    if (before < 0) { errors.push(`bar persistence: ${sys}.${ctl} screen disappeared (station lost?)`); break; }
    if (before < 0.5) errors.push(`bar persistence: ${sys}.${ctl} (${type}) showed no progress to compare (${before}%), so the check would be meaningless`);
    await page.locator('[data-k="back"]').click();
    await page.waitForTimeout(150);
    await openScreen(sys);
    const after = await barOf(ctl);
    if (Math.abs(after - before) > 4) errors.push(`pending bar for ${sys}.${ctl} (${type}) was ${before}% then ${after}% after leaving and returning`);
    await page.locator('[data-k="back"]').click();
    checked++;
  }
  await page.evaluate(() => { window.deepwatch.speed = 1; });
  console.log(`  checked ${checked} controls for bar persistence`);
}


// ---- The two reported cases, driven through the real controls (click / keyboard), not the sim API ----
{
  const barNow = async (ctl) => parseFloat(await page.locator(`.ctl[data-ctl="${ctl}"] .pbar i`).evaluate((el) => el.style.width || '0')) || 0;
  const burst = async (ctl) => {
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => { window.deepwatch.speed = 10; }); await page.waitForTimeout(250);
      await page.evaluate(() => { window.deepwatch.speed = 0.0001; }); await page.waitForTimeout(220);
      if ((await barNow(ctl)) >= 5) break;
    }
  };
  const roundTrip = async (sys, ctl, act) => {
    await page.evaluate(() => { window.deepwatch.speed = 1; });
    await page.locator(`.tile[data-sys="${sys}"]`).click({ timeout: 5000 }); await page.waitForSelector('.detail .detail-grid'); await page.waitForTimeout(250);
    await act(); await burst(ctl);
    const before = await barNow(ctl);
    await page.locator('[data-k="back"]').click(); await page.waitForTimeout(150);
    await page.locator(`.tile[data-sys="${sys}"]`).click(); await page.waitForSelector('.detail .detail-grid'); await page.waitForTimeout(250);
    const after = await barNow(ctl);
    if (before < 5) errors.push(`real-control bar check for ${sys}.${ctl}: no progress shown (${before}%)`);
    if (Math.abs(after - before) > 4) errors.push(`real-control bar check for ${sys}.${ctl}: ${before}% before leaving, ${after}% after returning`);
    await page.locator('[data-k="back"]').click();
  };
  await roundTrip('hull', 'pump', async () => { await page.locator('.ctl[data-ctl="pump"] .step', { hasText: 'High' }).click(); });
  await roundTrip('comms', 'gain', async () => { const r = page.locator('.ctl[data-ctl="gain"] input'); await r.focus(); await page.keyboard.press('End'); });
  await page.evaluate(() => { window.deepwatch.speed = 1; });
}


// ---- Supply orders: one button per item, only one delivery at a time ----
{
  await page.evaluate(() => { // clear orders left in flight by the checks above
    const sim = window.deepwatch.sim;
    for (const k in sim.jobs) if (k.startsWith('consumables.order')) Object.assign(sim.jobs[k], { active: false, cdUntil: 0 });
    sim.v.fuel.level = Math.min(sim.v.fuel.level, 60); window.deepwatch.speed = 1;
  });
  await page.locator('.tile[data-sys="consumables"]').click(); await page.waitForSelector('.detail .detail-grid'); await page.waitForTimeout(300);
  const btn = (c) => page.locator(`.ctl[data-ctl="${c}"] button.job`);
  const sub = (c) => btn(c).locator('.job-sub').textContent();
  for (const [c, text] of [['orderFood', 'Order food'], ['orderFilters', 'Order filters'], ['orderSpares', 'Order spares'], ['orderFuel', 'Order fuel']]) {
    expect(`${c} has its own button`, (await btn(c).count()) === 1 && (await btn(c).locator('.job-label').textContent()) === text);
  }
  expect('idle order button says what it delivers', /Delivers \+40/.test(await sub('orderFuel')) || /Delivers \+/.test(await sub('orderFuel')), await sub('orderFuel'));
  await btn('orderFuel').click();
  await page.waitForTimeout(350);
  expect('ordering fuel starts only the fuel delivery', await page.evaluate(() => window.deepwatch.sim.jobs['consumables.orderFuel'].active && !window.deepwatch.sim.jobs['consumables.orderFood'].active));
  expect('other order buttons are blocked while one is on its way', (await btn('orderFood').getAttribute('aria-disabled')) === 'true' && /Another delivery/.test(await sub('orderFood')), await sub('orderFood'));
  await btn('orderFood').click({ force: true });
  expect('clicking a blocked order does nothing', await page.evaluate(() => !window.deepwatch.sim.jobs['consumables.orderFood'].active));
  await page.screenshot({ path: process.env.DEEPWATCH_SHOT || '/tmp/supplies-orders.png' });
  await back();
}


// ---- Wear is only shown for systems you can service ----
{
  await page.evaluate(() => { window.deepwatch.speed = 1; });
  for (const [sys, shows] of [['fuel', false], ['consumables', false], ['power', true], ['hull', true]]) {
    await page.locator(`.tile[data-sys="${sys}"]`).click(); await page.waitForSelector('.detail .detail-grid'); await page.waitForTimeout(250);
    const has = (await page.locator('.detail section.wear').count()) > 0;
    expect(`${sys} ${shows ? 'shows' : 'hides'} its Wear section`, has === shows);
    // Linked systems and Wear sit in the left column, under the charts; Recent events is in the right column
    const where = await page.evaluate(() => ({
      links: !!document.querySelector('.col-left section.links'),
      wear: !!document.querySelector('.col-left section.wear'),
      recent: !!document.querySelector('.col-right details.recent'),
      order: [...document.querySelectorAll('.col-left > *')].map((e) => e.className.split(' ')[0]),
    }));
    expect(`${sys}: Linked systems is in the left column`, where.links);
    expect(`${sys}: Wear is in the left column when present`, where.wear === shows);
    expect(`${sys}: Recent events is in the right column`, where.recent);
    expect(`${sys}: left column ends with links${shows ? ', wear' : ''}`, where.order.slice(-(shows ? 2 : 1)).join() === (shows ? 'links,wear' : 'links'), where.order.join());
    const chartsBottom = await page.evaluate(() => document.querySelector('.col-left .charts')?.getBoundingClientRect().bottom ?? 0);
    const linksTop = await page.evaluate(() => document.querySelector('.col-left section.links').getBoundingClientRect().top);
    expect(`${sys}: Linked systems is below the charts`, linksTop >= chartsBottom - 1, `${linksTop} vs ${chartsBottom}`);
    await back();
  }

  // Recent events: collapsed by default, opens and closes, and remembers its state while you stay in the run
  await page.locator('.tile[data-sys="power"]').click(); await page.waitForSelector('.detail .detail-grid');
  const rec = page.locator('details.recent');
  expect('Recent events starts collapsed', !(await rec.evaluate((e) => e.open)));
  expect('collapsed Recent events hides its list', !(await page.locator('.recent-list').isVisible()));
  await page.evaluate(() => { const s = window.deepwatch.sim; s.log?.push?.({ t: s.t, sys: 'power', text: 'Test entry', level: 'info' }); });
  await rec.locator('summary').click();
  expect('clicking the header opens Recent events', await rec.evaluate((e) => e.open));
  expect('opened Recent events shows its list', await page.locator('.recent-list').isVisible());
  await back();
  await page.locator('.tile[data-sys="power"]').click(); await page.waitForSelector('.detail .detail-grid');
  expect('Recent events stays open after leaving and returning', await page.locator('details.recent').evaluate((e) => e.open));
  await page.locator('details.recent summary').click();
  expect('clicking again collapses it', !(await page.locator('details.recent').evaluate((e) => e.open)));
  await page.screenshot({ path: process.env.DEEPWATCH_SHOT2 || '/tmp/detail-layout.png' });
  await back();
}

// ---- Depth chart: deeper (bigger) numbers sit at the bottom ----
{
  await page.locator('.tile[data-sys="ballast"]').click(); await page.waitForSelector('.detail .detail-grid'); await page.waitForTimeout(400);
  const ticks = await page.evaluate(() => [...document.querySelectorAll('.detail .chart')[0].querySelectorAll('text.chart-axis')]
    .map((t) => ({ v: parseFloat(t.textContent.replace(/,/g, '')), y: +t.getAttribute('y') })).filter((t) => isFinite(t.v) && t.y < 130));
  const top = ticks.reduce((a, b) => (a.y < b.y ? a : b)), bot = ticks.reduce((a, b) => (a.y > b.y ? a : b));
  expect('Depth chart puts the larger number at the bottom', bot.v > top.v, JSON.stringify(ticks));
  const other = await page.evaluate(() => { const t = [...document.querySelectorAll('.detail .chart')[1].querySelectorAll('text.chart-axis')].map((e) => ({ v: parseFloat(e.textContent), y: +e.getAttribute('y') })).filter((e) => isFinite(e.v) && e.y < 130); return other_ok(t); function other_ok(t) { const a = t.reduce((p, c) => (p.y < c.y ? p : c)), b = t.reduce((p, c) => (p.y > c.y ? p : c)); return b.v < a.v; } });
  expect('Other charts still put the larger number on top', other);
  await back();
}

// ---- Theme picker: folded by default, so moving the mouse past it never previews a theme ----
{
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const start = await theme();
  await page.locator('#game-root [data-k="menu"]').click();
  await page.waitForSelector('.menu-panel');
  expect('theme list is folded when the menu opens', !(await page.locator('.theme-drop').isVisible()));
  expect('no theme options are in the page while folded', (await page.locator('.theme-opt').count()) === 0);
  const cb = await page.locator('.theme-current').boundingBox();
  await page.mouse.move(cb.x + 20, cb.y + cb.height / 2, { steps: 5 });
  await page.mouse.move(cb.x + 20, cb.y + cb.height + 120, { steps: 12 });
  expect('moving the mouse past the picker changes nothing', (await theme()) === start);
  expect('the folded picker names the current theme', (await page.locator('.theme-current .theme-name').textContent()).length > 0);
  await page.locator('.theme-current').click();
  expect('clicking it opens the list', await page.locator('.theme-drop').isVisible());
  const other = page.locator('.theme-opt[aria-selected="false"]').nth(3);
  const otherId = await other.getAttribute('data-id');
  const pickedName = (await other.locator('.theme-name').textContent()).trim();
  await other.hover();
  expect('hovering an option still previews it while open', (await theme()) === otherId);
  await page.mouse.move(cb.x + 20, cb.y - 40);
  await page.locator('.theme-list').dispatchEvent('mouseleave');
  expect('leaving the list restores the saved theme', (await theme()) === start);
  await page.keyboard.press('Escape');
  expect('Escape folds the list first', !(await page.locator('.theme-drop').isVisible()) && (await page.locator('.menu-panel').count()) === 1);
  await page.locator('.theme-current').click();
  await page.locator(`.theme-opt[data-id="${otherId}"]`).click();
  expect('choosing a theme applies it', (await theme()) === otherId);
  expect('choosing a theme folds the list', !(await page.locator('.theme-drop').isVisible()));
  expect('the folded picker now shows the new theme', (await page.locator('.theme-current .theme-name').textContent()).trim() === pickedName, `(picked ${pickedName})`);
  expect('the choice is saved', (await page.evaluate(() => localStorage.getItem('deepwatch.theme'))) === otherId);
  await page.keyboard.press('Escape');
  expect('Escape on a folded picker closes the menu', (await page.locator('.menu-panel').count()) === 0);
}

await browser.close();
if (errors.length) { console.log(`${errors.length} FAILURE(S):`); errors.forEach((e) => console.log('  x ' + e)); process.exit(1); }
console.log(`UI smoke test: opened ${ids.length} detail views with no errors.`);
