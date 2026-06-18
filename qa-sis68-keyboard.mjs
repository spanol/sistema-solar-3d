/**
 * QA SIS-68: Keyboard navigation + shortcuts overlay
 * Tests all shortcuts from SIS-52
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5174';
const RESULTS = [];
const ERRORS = [];

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(test, status, detail) {
  RESULTS.push({ test, status, detail });
  console.log(`[${status}] ${test}: ${detail}`);
}

// Wait for cam.animating to be false, with a max timeout
async function waitForCamDone(page, maxMs = 3500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const animating = await page.evaluate(() => {
      // cam is module-scoped, not accessible directly; use the hash stability as proxy
      return window.__camAnimating !== undefined ? window.__camAnimating : false;
    });
    if (!animating) break;
    await wait(100);
  }
  // Extra buffer after animation detected as done
  await wait(400);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      ERRORS.push(msg.text());
      console.error(`CONSOLE ERROR: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    ERRORS.push(err.message);
    console.error(`PAGE ERROR: ${err.message}`);
  });

  // ── T1: Initial load ──────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(2500);
  await page.screenshot({ path: 'qa-sis68-01-initial.png', fullPage: false });

  const canvas = await page.$('canvas');
  log('T1 Initial load', canvas ? 'PASS' : 'FAIL', canvas ? 'Canvas present' : 'Canvas not found');

  // ── T2: ? button (click opens overlay) ───────────────────────────────────
  const btnShortcuts = await page.$('#btn-shortcuts');
  if (btnShortcuts) {
    await btnShortcuts.click();
    await wait(500);
    await page.screenshot({ path: 'qa-sis68-02a-overlay-open.png' });

    const overlayVisible = await page.evaluate(() =>
      !document.getElementById('shortcuts-overlay')?.classList.contains('hidden'));
    log('T2a ? button opens overlay', overlayVisible ? 'PASS' : 'FAIL',
        `Overlay visible=${overlayVisible}`);

    const overlayText = await page.evaluate(() =>
      document.getElementById('shortcuts-overlay')?.innerText || '');
    const hasArrows  = /←|→|ArrowLeft|ArrowRight/.test(overlayText);
    const hasNumbers = /1/.test(overlayText) && /8/.test(overlayText);
    const hasEsc     = /Esc/.test(overlayText);
    const hasSpace   = /Espa|Space/.test(overlayText);
    const hasQ       = /\?/.test(overlayText);
    log('T2b Overlay lists all shortcuts',
        (hasArrows && hasNumbers && hasEsc && hasSpace && hasQ) ? 'PASS' : 'FAIL',
        `arrows=${hasArrows} nums=${hasNumbers} esc=${hasEsc} space=${hasSpace} ?=${hasQ}` +
        `\n  overlayText: ${overlayText.replace(/\n/g,'|').substring(0,120)}`);

    // Press ? key to close
    await page.keyboard.press('?');
    await wait(400);
    const overlayClosedByKey = await page.evaluate(() =>
      document.getElementById('shortcuts-overlay')?.classList.contains('hidden'));
    log('T2c ? key closes overlay', overlayClosedByKey ? 'PASS' : 'FAIL',
        `Overlay hidden after ?=${overlayClosedByKey}`);
    await page.screenshot({ path: 'qa-sis68-02b-overlay-closed.png' });
  } else {
    log('T2 ? button', 'FAIL', '#btn-shortcuts not found');
  }

  // ── T3: 1–8 from TOP VIEW ─────────────────────────────────────────────────
  // Ensure top view
  await page.keyboard.press('Escape');
  await wait(2000);

  await page.keyboard.press('1');
  await wait(2500); // Wait for animation to Mercury
  await page.screenshot({ path: 'qa-sis68-03a-key1-mercury.png' });

  const afterKey1 = await page.evaluate(() => ({
    hash: location.hash,
    cardHidden: document.getElementById('planet-card')?.classList.contains('hidden'),
    cardTitle: document.querySelector('#card-title')?.textContent?.trim() || 'n/a'
  }));
  const key1Pass = !afterKey1.cardHidden && /mercury/i.test(afterKey1.hash);
  log('T3a key 1 → Mercury (top view)', key1Pass ? 'PASS' : 'FAIL',
      `hash="${afterKey1.hash}" cardHidden=${afterKey1.cardHidden} title="${afterKey1.cardTitle}"`);

  // Back to top, then press 8 for Neptune
  await page.keyboard.press('Escape');
  await wait(2000);

  await page.keyboard.press('8');
  await wait(2500);
  await page.screenshot({ path: 'qa-sis68-03b-key8-neptune.png' });

  const afterKey8 = await page.evaluate(() => ({
    hash: location.hash,
    cardHidden: document.getElementById('planet-card')?.classList.contains('hidden'),
    cardTitle: document.querySelector('#card-title')?.textContent?.trim() || 'n/a'
  }));
  const key8Pass = !afterKey8.cardHidden && /neptune|netuno/i.test(afterKey8.hash);
  log('T3b key 8 → Neptune (top view)', key8Pass ? 'PASS' : 'FAIL',
      `hash="${afterKey8.hash}" cardHidden=${afterKey8.cardHidden} title="${afterKey8.cardTitle}"`);

  // ── T4: ← → arrow navigation in front view ────────────────────────────────
  // Navigate to Mercury first
  await page.keyboard.press('Escape');
  await wait(2000);
  await page.keyboard.press('1');
  await wait(2500);

  const hashAtMercury = await page.evaluate(() => location.hash);

  // Press → from Mercury (should go to Vênus = planet[1])
  await page.keyboard.press('ArrowRight');
  await wait(2500);
  await page.screenshot({ path: 'qa-sis68-04a-arrow-right.png' });

  const afterRight = await page.evaluate(() => ({
    hash: location.hash,
    cardTitle: document.querySelector('#card-title')?.textContent?.trim() || 'n/a'
  }));
  const arrowRightPass = afterRight.hash !== hashAtMercury && !afterRight.hash.includes('mercury');
  log('T4a ArrowRight moves to next planet (Vênus)',
      arrowRightPass ? 'PASS' : 'FAIL',
      `before="${hashAtMercury}" after="${afterRight.hash}" title="${afterRight.title}"`);

  // Press ← (should go back to Mercury)
  await page.keyboard.press('ArrowLeft');
  await wait(2500);
  await page.screenshot({ path: 'qa-sis68-04b-arrow-left.png' });

  const afterLeft = await page.evaluate(() => ({
    hash: location.hash,
    cardTitle: document.querySelector('#card-title')?.textContent?.trim() || 'n/a'
  }));
  const arrowLeftPass = /mercury/i.test(afterLeft.hash);
  log('T4b ArrowLeft returns to Mercury',
      arrowLeftPass ? 'PASS' : 'FAIL',
      `hash="${afterLeft.hash}" title="${afterLeft.cardTitle}"`);

  // ← / → do NOT work in top view
  await page.keyboard.press('Escape');
  await wait(2000);
  const hashTopBefore = await page.evaluate(() => location.hash);
  await page.keyboard.press('ArrowRight');
  await wait(600);
  const hashTopAfter = await page.evaluate(() => location.hash);
  log('T4c ArrowRight ignored in top view',
      hashTopBefore === hashTopAfter ? 'PASS' : 'FAIL',
      `hash unchanged=${hashTopBefore === hashTopAfter} ("${hashTopBefore}" vs "${hashTopAfter}")`);

  // ── T5: Space pause/resume ────────────────────────────────────────────────
  // btn ID is ctrl-rotation, text toggles between '▶ Rotação' and '⏸ Rotação'
  const rotBefore = await page.evaluate(() => ({
    text: document.getElementById('ctrl-rotation')?.textContent?.trim(),
    pressed: document.getElementById('ctrl-rotation')?.getAttribute('aria-pressed')
  }));

  await page.keyboard.press(' ');
  await wait(500);
  await page.screenshot({ path: 'qa-sis68-05a-space-pause.png' });

  const rotAfterPause = await page.evaluate(() => ({
    text: document.getElementById('ctrl-rotation')?.textContent?.trim(),
    pressed: document.getElementById('ctrl-rotation')?.getAttribute('aria-pressed')
  }));

  const pauseWorked = rotBefore.text !== rotAfterPause.text || rotBefore.pressed !== rotAfterPause.pressed;
  log('T5a Space pauses rotation',
      pauseWorked ? 'PASS' : 'FAIL',
      `before="${rotBefore.text}"/pressed=${rotBefore.pressed} → after="${rotAfterPause.text}"/pressed=${rotAfterPause.pressed}`);

  await page.keyboard.press(' ');
  await wait(500);
  await page.screenshot({ path: 'qa-sis68-05b-space-resume.png' });

  const rotAfterResume = await page.evaluate(() => ({
    text: document.getElementById('ctrl-rotation')?.textContent?.trim(),
    pressed: document.getElementById('ctrl-rotation')?.getAttribute('aria-pressed')
  }));
  const resumeWorked = rotAfterResume.text === rotBefore.text || rotAfterResume.pressed === rotBefore.pressed;
  log('T5b Space resumes rotation',
      resumeWorked ? 'PASS' : 'FAIL',
      `resumed="${rotAfterResume.text}"/pressed=${rotAfterResume.pressed}`);

  // ── T6: Esc behavior ──────────────────────────────────────────────────────
  // 6a: Open overlay → Esc should close overlay, NOT return to top view
  await page.keyboard.press('1'); // Go to Mercury
  await wait(2500);

  await page.keyboard.press('?'); // Open overlay
  await wait(500);
  await page.screenshot({ path: 'qa-sis68-06a-esc-overlay-before.png' });

  const overlayOpenedForEsc = await page.evaluate(() =>
    !document.getElementById('shortcuts-overlay')?.classList.contains('hidden'));

  await page.keyboard.press('Escape');
  await wait(500);
  await page.screenshot({ path: 'qa-sis68-06a-esc-overlay-after.png' });

  const stateAfterEscWithOverlay = await page.evaluate(() => ({
    overlayHidden: document.getElementById('shortcuts-overlay')?.classList.contains('hidden'),
    cardVisible: !document.getElementById('planet-card')?.classList.contains('hidden'),
    hash: location.hash
  }));
  log('T6a Esc closes overlay (stays in front view)',
      overlayOpenedForEsc && stateAfterEscWithOverlay.overlayHidden && stateAfterEscWithOverlay.cardVisible
        ? 'PASS' : 'FAIL',
      `overlayWasOpen=${overlayOpenedForEsc} overlayNowHidden=${stateAfterEscWithOverlay.overlayHidden} cardStillVisible=${stateAfterEscWithOverlay.cardVisible}`);

  // 6b: Esc in front view (no overlay) → back to top
  await page.keyboard.press('Escape');
  await wait(2000);
  await page.screenshot({ path: 'qa-sis68-06b-esc-back-to-top.png' });

  const stateAfterEscFront = await page.evaluate(() => ({
    hash: location.hash,
    cardHidden: document.getElementById('planet-card')?.classList.contains('hidden')
  }));
  log('T6b Esc in front view → top view',
      stateAfterEscFront.cardHidden && !stateAfterEscFront.hash.includes('planet=')
        ? 'PASS' : 'FAIL',
      `cardHidden=${stateAfterEscFront.cardHidden} hash="${stateAfterEscFront.hash}"`);

  // ── T7: 1–8 from front view ───────────────────────────────────────────────
  // First navigate to Mercury (from top)
  await page.keyboard.press('1');
  await wait(3000); // Wait fully for animation to settle

  // Now press key 3 (Terra/Earth) while IN front view (Mercury)
  const hashAtMercury2 = await page.evaluate(() => location.hash);
  await page.keyboard.press('3');
  await wait(3000); // Full animation wait
  await page.screenshot({ path: 'qa-sis68-07-key3-from-front.png' });

  const afterKey3FromFront = await page.evaluate(() => ({
    hash: location.hash,
    cardTitle: document.querySelector('#card-title')?.textContent?.trim() || 'n/a'
  }));
  const key3Pass = afterKey3FromFront.hash !== hashAtMercury2 && !afterKey3FromFront.hash.includes('mercury');
  log('T7 key 3 → Terra from front view',
      key3Pass ? 'PASS' : 'FAIL',
      `before="${hashAtMercury2}" after="${afterKey3FromFront.hash}" title="${afterKey3FromFront.cardTitle}"`);

  // ── T8: Inputs don't capture shortcuts ────────────────────────────────────
  // Need to be in front view with a planet that has inputs
  // Make sure we have a planet card open
  if (afterKey3FromFront.hash.includes('planet=')) {
    const inputEl = await page.$('#calc-weight-input, #calc-birth-input, input[type="number"], input[type="date"]');
    if (inputEl) {
      // Scroll the input into view and click it
      await inputEl.scrollIntoViewIfNeeded();
      await inputEl.click();
      await wait(300);

      const hashBefore8 = await page.evaluate(() => location.hash);
      const rotBefore8 = await page.evaluate(() =>
        document.getElementById('ctrl-rotation')?.textContent?.trim());

      // ArrowLeft while in input — should NOT navigate planets
      await page.keyboard.press('ArrowLeft');
      await wait(600);
      const hashAfterArrow = await page.evaluate(() => location.hash);

      // Space while in input — should NOT toggle rotation
      await page.keyboard.press(' ');
      await wait(500);
      const rotAfter8 = await page.evaluate(() =>
        document.getElementById('ctrl-rotation')?.textContent?.trim());

      await page.screenshot({ path: 'qa-sis68-08-input-no-capture.png' });

      log('T8a ArrowLeft not captured in input',
          hashBefore8 === hashAfterArrow ? 'PASS' : 'FAIL',
          `hash unchanged=${hashBefore8 === hashAfterArrow} ("${hashBefore8}" vs "${hashAfterArrow}")`);
      log('T8b Space not captured in input',
          rotBefore8 === rotAfter8 ? 'PASS' : 'FAIL',
          `rotation unchanged=${rotBefore8 === rotAfter8} ("${rotBefore8}" vs "${rotAfter8}")`);
    } else {
      log('T8 Input no-capture', 'SKIP', 'No calculator input found (scroll may be needed)');
    }
  } else {
    log('T8 Input no-capture', 'SKIP', 'Not in front view, skipping input test');
  }

  // ── T9: ? key shortcut open/close ─────────────────────────────────────────
  // Click canvas to defocus any input
  const canvasEl2 = await page.$('canvas');
  if (canvasEl2) await canvasEl2.click();
  await wait(300);

  await page.keyboard.press('?');
  await wait(500);
  await page.screenshot({ path: 'qa-sis68-09a-qmark-open.png' });

  const overlayOpenByKey = await page.evaluate(() =>
    !document.getElementById('shortcuts-overlay')?.classList.contains('hidden'));
  log('T9a ? key opens overlay', overlayOpenByKey ? 'PASS' : 'FAIL',
      `overlayVisible=${overlayOpenByKey}`);

  await page.keyboard.press('?');
  await wait(400);
  await page.screenshot({ path: 'qa-sis68-09b-qmark-close.png' });
  const overlayClosedByKey3 = await page.evaluate(() =>
    document.getElementById('shortcuts-overlay')?.classList.contains('hidden'));
  log('T9b ? key closes overlay', overlayClosedByKey3 ? 'PASS' : 'FAIL',
      `overlayHidden=${overlayClosedByKey3}`);

  // ── T10: Regression — navigation + card ───────────────────────────────────
  await page.keyboard.press('Escape');
  await wait(2000);

  await page.keyboard.press('2'); // Vênus
  await wait(2500);
  await page.screenshot({ path: 'qa-sis68-10a-key2-venus.png' });

  const venusCard = await page.evaluate(() => ({
    cardVisible: !document.getElementById('planet-card')?.classList.contains('hidden'),
    hash: location.hash
  }));
  log('T10a Key 2 → Vênus regression',
      venusCard.cardVisible && /planet=venus|planet=v/i.test(venusCard.hash) ? 'PASS' : 'FAIL',
      `cardVisible=${venusCard.cardVisible} hash="${venusCard.hash}"`);

  await page.keyboard.press('5'); // Júpiter
  await wait(2500);
  await page.screenshot({ path: 'qa-sis68-10b-key5-jupiter.png' });

  const jupiterCard = await page.evaluate(() => ({
    cardVisible: !document.getElementById('planet-card')?.classList.contains('hidden'),
    hash: location.hash
  }));
  log('T10b Key 5 → Júpiter regression',
      jupiterCard.cardVisible && /planet=j/i.test(jupiterCard.hash) ? 'PASS' : 'FAIL',
      `cardVisible=${jupiterCard.cardVisible} hash="${jupiterCard.hash}"`);

  // ── FINAL ─────────────────────────────────────────────────────────────────
  await browser.close();

  const summary = {
    results: RESULTS,
    consoleErrors: ERRORS,
    totalTests: RESULTS.length,
    passed: RESULTS.filter(r => r.status === 'PASS').length,
    failed: RESULTS.filter(r => r.status === 'FAIL').length,
    skipped: RESULTS.filter(r => r.status === 'SKIP').length,
  };

  writeFileSync('qa-sis68-results.json', JSON.stringify(summary, null, 2));

  console.log('\n═══════════════════════════════════════');
  console.log(`SUMMARY: ${summary.passed} PASS / ${summary.failed} FAIL / ${summary.skipped} SKIP`);
  console.log(`Console errors: ${ERRORS.length}`);
  if (ERRORS.length) { console.log('Errors:'); ERRORS.forEach(e => console.log('  ' + e)); }

  return summary;
}

run().catch(err => { console.error(err); process.exit(1); });
