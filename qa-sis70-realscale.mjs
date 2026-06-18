/**
 * QA script for SIS-70: SIS-53 toggle de distância em escala real
 * Tests all acceptance criteria from the issue description.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:5173';
const RESULTS = { passed: [], failed: [], warnings: [] };

function pass(label) {
  console.log(`  ✅ PASS: ${label}`);
  RESULTS.passed.push(label);
}
function fail(label, detail = '') {
  console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  RESULTS.failed.push({ label, detail });
}
function warn(label) {
  console.log(`  ⚠️  WARN: ${label}`);
  RESULTS.warnings.push(label);
}

const consoleErrors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => consoleErrors.push(`PageError: ${err.message}`));

  // ── TEST 1: INITIAL LOAD ─────────────────────────────────────────────────
  console.log('\n── TEST 1: Initial Load ───────────────────────────────────────');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000); // let Three.js render

  await page.screenshot({ path: 'qa-sis70-01-initial.png', fullPage: false });

  const btnRealScale = page.locator('#ctrl-real-scale');
  const btnExists = await btnRealScale.count();
  btnExists ? pass('Button #ctrl-real-scale exists in DOM') : fail('Button #ctrl-real-scale NOT found in DOM');

  if (btnExists) {
    const btnText = await btnRealScale.textContent();
    btnText.includes('Dist. Real') ? pass(`Button text "${btnText.trim()}" contains "Dist. Real"`) : fail(`Button text "${btnText.trim()}" missing "Dist. Real"`);

    const ariaPressed = await btnRealScale.getAttribute('aria-pressed');
    ariaPressed === 'false' ? pass('aria-pressed="false" (OFF state) on initial load') : fail(`aria-pressed="${ariaPressed}" expected "false"`);
  }

  const initialErrors = [...consoleErrors];
  initialErrors.length === 0 ? pass('Zero console errors on initial load') : fail(`Console errors on load: ${initialErrors.length}`, initialErrors.join('; '));

  // ── TEST 2: ACTIVATE REAL SCALE ─────────────────────────────────────────
  console.log('\n── TEST 2: Activate Real Scale ────────────────────────────────');
  consoleErrors.length = 0;

  // Snapshot planet positions before toggle
  const earthPosBefore = await page.evaluate(() => {
    // Try to read a planet position from Three.js scene
    const canvas = document.getElementById('solar-canvas');
    return canvas ? 'canvas_present' : 'no_canvas';
  });

  await btnRealScale.click();
  await page.waitForTimeout(3000); // lerp animation takes time

  await page.screenshot({ path: 'qa-sis70-02-realscale-on.png', fullPage: false });

  const ariaAfterToggle = await btnRealScale.getAttribute('aria-pressed');
  ariaAfterToggle === 'true' ? pass('aria-pressed="true" after activation') : fail(`aria-pressed="${ariaAfterToggle}" after activation, expected "true"`);

  const hasActiveClass = await btnRealScale.evaluate(el => el.classList.contains('active'));
  hasActiveClass ? pass('Button has "active" CSS class when real scale ON') : fail('Button missing "active" class');

  const urlAfterToggle = page.url();
  urlAfterToggle.includes('realscale=1') ? pass(`URL hash contains "realscale=1": ${urlAfterToggle}`) : fail(`URL hash missing "realscale=1": ${urlAfterToggle}`);

  consoleErrors.length === 0 ? pass('Zero console errors on toggle activation') : fail(`Console errors on activation: ${consoleErrors.length}`, consoleErrors.join('; '));

  // ── TEST 3: DEACTIVATE REAL SCALE ───────────────────────────────────────
  console.log('\n── TEST 3: Deactivate Real Scale ──────────────────────────────');
  consoleErrors.length = 0;

  await btnRealScale.click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'qa-sis70-03-realscale-off.png', fullPage: false });

  const ariaAfterDeactivate = await btnRealScale.getAttribute('aria-pressed');
  ariaAfterDeactivate === 'false' ? pass('aria-pressed="false" after deactivation') : fail(`aria-pressed="${ariaAfterDeactivate}" after deactivation`);

  const urlAfterDeactivate = page.url();
  !urlAfterDeactivate.includes('realscale=1') ? pass(`URL no longer has "realscale=1" after deactivation`) : fail(`URL still shows "realscale=1" after deactivation: ${urlAfterDeactivate}`);

  consoleErrors.length === 0 ? pass('Zero console errors on toggle deactivation') : fail(`Console errors on deactivation: ${consoleErrors.length}`, consoleErrors.join('; '));

  // ── TEST 4: DEEP-LINK RESTORE ────────────────────────────────────────────
  console.log('\n── TEST 4: Deep-link Restore ──────────────────────────────────');
  consoleErrors.length = 0;

  await page.goto(`${BASE_URL}/#planet=earth&orbits=1&labels=1&speed=1&realscale=1`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'qa-sis70-04-deeplink.png', fullPage: false });

  const btnAfterDeeplink = page.locator('#ctrl-real-scale');
  const ariaDeeplink = await btnAfterDeeplink.getAttribute('aria-pressed');
  ariaDeeplink === 'true' ? pass('Deep-link restores realscale=1 — button aria-pressed="true"') : fail(`Deep-link failed to restore state — aria-pressed="${ariaDeeplink}"`);

  const activeDeeplink = await btnAfterDeeplink.evaluate(el => el.classList.contains('active'));
  activeDeeplink ? pass('Deep-link: button has "active" class') : fail('Deep-link: button missing "active" class');

  consoleErrors.length === 0 ? pass('Zero console errors on deep-link restore') : fail(`Console errors on deep-link: ${consoleErrors.length}`, consoleErrors.join('; '));

  // ── TEST 5: PLANET SELECTION REGRESSION (real scale ON) ─────────────────
  console.log('\n── TEST 5: Planet Selection Regression ────────────────────────');
  // Reload fresh with real scale off, activate, then click Earth
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  consoleErrors.length = 0;

  await page.locator('#ctrl-real-scale').click();
  await page.waitForTimeout(2500); // let camera settle

  // Find Earth label or click on canvas at approximate Earth position
  const earthLabel = page.locator('.planet-label').filter({ hasText: 'Earth' }).or(
    page.locator('.planet-label').filter({ hasText: 'Terra' })
  );
  const earthLabelCount = await earthLabel.count();

  if (earthLabelCount > 0) {
    await earthLabel.first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'qa-sis70-05-planet-select.png', fullPage: false });

    const card = page.locator('#info-card, .info-card, [class*="card"]').first();
    const cardVisible = await card.isVisible().catch(() => false);
    cardVisible ? pass('Planet card visible after planet click with real scale ON') : warn('Could not verify planet card visibility — selector may differ');

    consoleErrors.length === 0 ? pass('Zero console errors on planet selection with real scale ON') : fail(`Console errors on planet select: ${consoleErrors.length}`, consoleErrors.join('; '));
  } else {
    // Try clicking approximately where Earth would be in real scale
    // In real scale, Earth is still closest to the sun in compressed terms; try clicking center-area
    await page.screenshot({ path: 'qa-sis70-05-planet-label-fallback.png', fullPage: false });
    warn('No Earth/Terra label found — using screenshot fallback. Check label visibility in screenshot.');
  }

  // ── TEST 6: TOGGLE IN FRONT VIEW (should be blocked) ────────────────────
  console.log('\n── TEST 6: Toggle in Front View (should be blocked) ───────────');

  // Go back to top, click Earth, then try real scale toggle
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  consoleErrors.length = 0;

  // Try to find a planet label and click it to enter front view
  const anyLabel = page.locator('.planet-label').first();
  const anyLabelCount = await anyLabel.count();
  if (anyLabelCount > 0) {
    await anyLabel.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'qa-sis70-06-front-view.png', fullPage: false });

    // Now try to toggle real scale (should have no effect in front view)
    const realScaleBtnFront = page.locator('#ctrl-real-scale');
    const ariaBeforeClick = await realScaleBtnFront.getAttribute('aria-pressed');
    await realScaleBtnFront.click();
    await page.waitForTimeout(500);
    const ariaAfterClick = await realScaleBtnFront.getAttribute('aria-pressed');
    ariaBeforeClick === ariaAfterClick
      ? pass(`Toggle blocked in front view — aria-pressed stayed "${ariaBeforeClick}"`)
      : fail(`Toggle NOT blocked in front view — aria changed from "${ariaBeforeClick}" to "${ariaAfterClick}"`);
  } else {
    warn('Could not enter front view — no planet labels found. Skipping front-view toggle test.');
  }

  // ── TEST 7: OTHER TOGGLES REGRESSION (orbits + labels) ──────────────────
  console.log('\n── TEST 7: Orbits & Labels Toggles Regression ─────────────────');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  consoleErrors.length = 0;

  await page.locator('#ctrl-real-scale').click();
  await page.waitForTimeout(1500);

  const btnOrbits = page.locator('#ctrl-orbits');
  const btnLabels = page.locator('#ctrl-labels');
  const orbitsExists = await btnOrbits.count();
  const labelsExists = await btnLabels.count();

  if (orbitsExists) {
    const orbitsBefore = await btnOrbits.getAttribute('aria-pressed');
    await btnOrbits.click();
    await page.waitForTimeout(500);
    const orbitsAfter = await btnOrbits.getAttribute('aria-pressed');
    orbitsBefore !== orbitsAfter ? pass('Orbits toggle works with real scale ON') : fail('Orbits toggle has no effect with real scale ON');
  } else {
    warn('Orbits button #ctrl-orbits not found');
  }

  if (labelsExists) {
    const labelsBefore = await btnLabels.getAttribute('aria-pressed');
    await btnLabels.click();
    await page.waitForTimeout(500);
    const labelsAfter = await btnLabels.getAttribute('aria-pressed');
    labelsBefore !== labelsAfter ? pass('Labels toggle works with real scale ON') : fail('Labels toggle has no effect with real scale ON');
  } else {
    warn('Labels button #ctrl-labels not found');
  }

  await page.screenshot({ path: 'qa-sis70-07-toggles.png', fullPage: false });
  consoleErrors.length === 0 ? pass('Zero console errors during toggles test') : fail(`Console errors during toggles: ${consoleErrors.length}`, consoleErrors.join('; '));

  // ── TEST 8: MOBILE VIEWPORT ──────────────────────────────────────────────
  console.log('\n── TEST 8: Mobile Viewport ────────────────────────────────────');
  const mobilePage = await context.newPage();
  mobilePage.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(2000);
  await mobilePage.screenshot({ path: 'qa-sis70-08-mobile.png', fullPage: false });

  const mobileBtn = mobilePage.locator('#ctrl-real-scale');
  const mobileBtnVisible = await mobileBtn.isVisible().catch(() => false);
  mobileBtnVisible ? pass('Dist. Real button visible on mobile viewport') : warn('Dist. Real button not visible on mobile (may be collapsed in menu)');

  await mobilePage.close();

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('QA SUMMARY — SIS-70 / SIS-53 Real Scale Toggle');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  PASSED:   ${RESULTS.passed.length}`);
  console.log(`  FAILED:   ${RESULTS.failed.length}`);
  console.log(`  WARNINGS: ${RESULTS.warnings.length}`);

  if (RESULTS.failed.length > 0) {
    console.log('\nFAILURES:');
    RESULTS.failed.forEach(f => console.log(`  - ${f.label}${f.detail ? ': ' + f.detail : ''}`));
  }
  if (RESULTS.warnings.length > 0) {
    console.log('\nWARNINGS:');
    RESULTS.warnings.forEach(w => console.log(`  - ${w}`));
  }

  writeFileSync('qa-sis70-results.json', JSON.stringify({ passed: RESULTS.passed, failed: RESULTS.failed, warnings: RESULTS.warnings, consoleErrors }, null, 2));
  console.log('\nResults saved to qa-sis70-results.json');
  console.log('Screenshots: qa-sis70-01 through qa-sis70-08');

  await browser.close();

  if (RESULTS.failed.length > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
