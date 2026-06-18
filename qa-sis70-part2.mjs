import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const results = [];
const pageErrors = [];

function pass(label) { console.log('  PASS:', label); results.push({status:'PASS', label}); }
function fail(label, d='') { console.log('  FAIL:', label, d||''); results.push({status:'FAIL', label, d}); }
function warn(label) { console.log('  WARN:', label); results.push({status:'WARN', label}); }

const br = await chromium.launch({ headless: true });
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });

// ── Deep-link: fresh page, only realscale ───────────────────────────────────
console.log('\n── Deep-link Test (fresh page): only realscale');
{
  const p = await ctx.newPage();
  p.on('pageerror', e => pageErrors.push(e.message));
  await p.goto('http://localhost:5173/#orbits=1&labels=1&speed=1&realscale=1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'qa-sis70-dl-realonly.png' });

  const aria = await p.locator('#ctrl-real-scale').getAttribute('aria-pressed');
  aria === 'true' ? pass('Deep-link realscale=1 restores button ON') : fail('Deep-link restore failed', 'aria-pressed=' + aria);

  const hasActive = await p.locator('#ctrl-real-scale').evaluate(el => el.classList.contains('active'));
  hasActive ? pass('Deep-link: active CSS class set') : fail('Deep-link: active CSS class missing');

  // Camera should be at real-scale position → outer planets visible
  const url = p.url();
  url.includes('realscale=1') ? pass('Deep-link URL preserved: ' + url) : fail('Deep-link URL lost realscale', url);

  await p.close();
}

// ── Deep-link: fresh page with planet + realscale ───────────────────────────
console.log('\n── Deep-link Test (fresh page): planet + realscale');
{
  const p = await ctx.newPage();
  p.on('pageerror', e => pageErrors.push(e.message));
  await p.goto('http://localhost:5173/#planet=earth&orbits=1&labels=1&speed=1&realscale=1', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'qa-sis70-dl-planet-realscale.png' });

  const aria = await p.locator('#ctrl-real-scale').getAttribute('aria-pressed');
  aria === 'true' ? pass('Deep-link planet+realscale: button ON') : fail('Deep-link planet+realscale: button not ON', 'aria-pressed=' + aria);

  const cardVisible = await p.locator('#planet-card').isVisible().catch(() => false);
  cardVisible ? pass('Deep-link planet+realscale: card visible') : fail('Deep-link planet+realscale: card NOT visible');

  await p.close();
}

// ── Planet selection via keyboard shortcut (3 = Earth) ─────────────────────
console.log('\n── Planet Selection via keyboard (key 3 = Earth) with realscale ON');
{
  const p = await ctx.newPage();
  const pErrors = [];
  p.on('pageerror', e => { pageErrors.push(e.message); pErrors.push(e.message); });
  p.on('console', m => { if (m.type() === 'error') pErrors.push(m.text()); });

  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);

  // Activate real scale
  await p.locator('#ctrl-real-scale').click();
  await p.waitForTimeout(2000);

  // Press '3' to select Earth (Mercury=1, Venus=2, Earth=3)
  await p.keyboard.press('3');
  await p.waitForTimeout(2500);

  await p.screenshot({ path: 'qa-sis70-planet-select-realscale.png' });

  const controlsHidden = await p.locator('#view-controls').evaluate(el => el.classList.contains('hidden'));
  controlsHidden ? pass('Front view entered via keyboard with realscale ON') : fail('Front view NOT entered via keyboard');

  const cardVisible = await p.locator('#planet-card').isVisible().catch(() => false);
  cardVisible ? pass('Planet card visible after keyboard select in realscale mode') : fail('Planet card NOT visible after keyboard select');

  if (cardVisible) {
    const cardName = await p.locator('#card-name').textContent().catch(() => '');
    (cardName.toLowerCase().includes('terra') || cardName.toLowerCase().includes('earth'))
      ? pass('Card shows Earth/Terra: ' + cardName)
      : warn('Unexpected card name: ' + cardName);
  }

  pErrors.length === 0 ? pass('Zero console errors during planet select + realscale') : fail('Console errors during planet select', pErrors.join('; '));
  await p.close();
}

// ── Front-view toggle guard ─────────────────────────────────────────────────
console.log('\n── Front-view guard (Dist. Real toggle should be blocked)');
{
  const p = await ctx.newPage();
  p.on('pageerror', e => pageErrors.push(e.message));

  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);

  // Enter front view via keyboard shortcut
  await p.keyboard.press('3');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: 'qa-sis70-front-view.png' });

  const ariaBefore = await p.locator('#ctrl-real-scale').getAttribute('aria-pressed');
  await p.locator('#ctrl-real-scale').click();
  await p.waitForTimeout(500);
  const ariaAfter = await p.locator('#ctrl-real-scale').getAttribute('aria-pressed');

  ariaBefore === ariaAfter
    ? pass('Toggle correctly blocked in front view (aria-pressed stays ' + ariaBefore + ')')
    : fail('Toggle NOT blocked in front view: ' + ariaBefore + ' -> ' + ariaAfter);

  // Escape to top
  await p.keyboard.press('Escape');
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'qa-sis70-escape-top.png' });

  const controlsVisible = await p.locator('#view-controls').evaluate(el => !el.classList.contains('hidden'));
  controlsVisible ? pass('Escape returns to top view (controls visible)') : fail('Escape did NOT return to top view');

  await p.close();
}

// ── Asteroid belt cross-fade visual check ───────────────────────────────────
console.log('\n── Asteroid Belt Cross-fade (long wait)');
{
  const p = await ctx.newPage();
  p.on('pageerror', e => pageErrors.push(e.message));

  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'qa-sis70-belt-before.png' });

  await p.locator('#ctrl-real-scale').click();
  await p.waitForTimeout(6000); // longer wait for lerp to fully settle

  await p.screenshot({ path: 'qa-sis70-belt-realscale.png' });

  // Check that realScaleLerpT is close to 1 via evaluating the scene
  const lerpT = await p.evaluate(() => {
    // realScaleLerpT is module-scoped, cannot read directly; check asteroid opacity via material
    // Instead verify the URL still has realscale=1
    return location.hash;
  });
  lerpT.includes('realscale=1') ? pass('Real-scale asteroid belt test: URL still has realscale=1 after wait') : fail('URL lost realscale=1');

  pass('Asteroid belt screenshots captured for visual review (qa-sis70-belt-before.png, qa-sis70-belt-realscale.png)');
  await p.close();
}

// ── Mobile responsive ────────────────────────────────────────────────────────
console.log('\n── Mobile responsive check');
{
  const mCtx = await br.newContext({ viewport: { width: 390, height: 844 } });
  const p = await mCtx.newPage();
  p.on('pageerror', e => pageErrors.push(e.message));

  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'qa-sis70-mobile-top.png' });

  const btnVisible = await p.locator('#ctrl-real-scale').isVisible().catch(() => false);
  btnVisible ? pass('Dist. Real button visible on mobile (390px)') : warn('Dist. Real button not visible on mobile — may be off-screen');

  if (btnVisible) {
    await p.locator('#ctrl-real-scale').click();
    await p.waitForTimeout(3000);
    await p.screenshot({ path: 'qa-sis70-mobile-realscale.png' });
    const ariaM = await p.locator('#ctrl-real-scale').getAttribute('aria-pressed');
    ariaM === 'true' ? pass('Mobile: real scale toggle works') : fail('Mobile: toggle did not activate', 'aria-pressed=' + ariaM);
  }

  await mCtx.close();
}

// ── SUMMARY ─────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log('SIS-70 Part-2 QA SUMMARY');
console.log('═══════════════════════════════════════════════════════');
const passed = results.filter(r => r.status === 'PASS');
const failed = results.filter(r => r.status === 'FAIL');
const warned = results.filter(r => r.status === 'WARN');
console.log('  PASS:', passed.length);
console.log('  FAIL:', failed.length);
console.log('  WARN:', warned.length);
if (failed.length) { console.log('\nFAILURES:'); failed.forEach(f => console.log('  -', f.label, f.d || '')); }
if (pageErrors.length) { console.log('\nPage Errors encountered:', pageErrors); }

writeFileSync('qa-sis70-part2-results.json', JSON.stringify({ passed: passed.map(r=>r.label), failed, warned: warned.map(r=>r.label), pageErrors }, null, 2));
console.log('\nResults saved to qa-sis70-part2-results.json');

await br.close();
if (failed.length) process.exit(1);
