/**
 * QA SIS-74: Final consolidated verification script
 * Checks all 8 criteria with correct timing and approach
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = 'D:\\code\\sistema-solar-3d';
const PREFIX = 'qa-sis74-';

function ss(name) { return `${OUT_DIR}\\${PREFIX}${name}.png`; }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function setDate(page, val) {
  await page.evaluate((v) => {
    const dp = document.getElementById('date-picker');
    dp.value = v;
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  }, val);
  await wait(1200);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function getDateControlsVisible(page) {
  return await page.evaluate(() => {
    const dc = document.getElementById('date-controls');
    if (!dc) return false;
    const hidden = dc.classList.contains('hidden');
    const style = window.getComputedStyle(dc);
    return !hidden && style.display !== 'none' && style.visibility !== 'hidden';
  });
}

async function getPlanetLabelPositions(page) {
  return await page.evaluate(() => {
    const wrap = document.querySelector('#app > div');
    if (!wrap) return {};
    const labels = {};
    Array.from(wrap.querySelectorAll('div')).forEach(el => {
      const t = el.textContent.trim();
      if (t && el.style.left && el.style.top && !t.includes(' ') && t.length < 20) {
        labels[t] = { left: el.style.left, top: el.style.top };
      }
    });
    return labels;
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  console.log('Loading http://localhost:5173...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(2500);
  console.log('App loaded.\n');

  const results = {};

  // =========================================================
  // C1: Date panel visible in top view
  // =========================================================
  console.log('=== C1: Date panel in top view ===');
  const c1state = await page.evaluate(() => {
    const dc = document.getElementById('date-controls');
    const dp = document.getElementById('date-picker');
    const btn = document.getElementById('btn-hoje');
    const badge = document.getElementById('retrograde-badge');
    if (!dc) return { exists: false };
    const rect = dc.getBoundingClientRect();
    const style = window.getComputedStyle(dc);
    return {
      exists: true,
      hidden: dc.classList.contains('hidden'),
      display: style.display,
      visible: rect.width > 0 && rect.height > 0,
      hasPicker: !!dp,
      hasAgora: !!btn,
      agoraText: btn?.textContent.trim(),
      hasBadge: !!badge,
      pickerValue: dp?.value,
      pickerType: dp?.type,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    };
  });
  console.log('State:', JSON.stringify(c1state, null, 2));

  const c1pass = c1state.exists && !c1state.hidden && c1state.visible &&
                 c1state.hasPicker && c1state.hasAgora && c1state.pickerValue === '2026-06-17';
  await page.screenshot({ path: ss('01-top-view'), fullPage: false });
  console.log(`C1: ${c1pass ? 'PASS' : 'FAIL'}\n`);
  results.c1 = { pass: c1pass, details: c1state };

  // =========================================================
  // C2: Date input change + Agora button
  // =========================================================
  console.log('=== C2: Date input and Agora button ===');
  await setDate(page, '2020-01-15');
  const c2state_after_change = await page.evaluate(() => document.getElementById('date-picker')?.value);
  console.log('Picker value after setting 2020-01-15:', c2state_after_change);
  await page.screenshot({ path: ss('02-date-2020-01-15'), fullPage: false });

  await page.click('#btn-hoje');
  await wait(800);
  const c2state_after_agora = await page.evaluate(() => document.getElementById('date-picker')?.value);
  console.log('Picker value after Agora:', c2state_after_agora);
  await page.screenshot({ path: ss('03-after-agora'), fullPage: false });

  const c2pass = c2state_after_change === '2020-01-15' && c2state_after_agora === '2026-06-17';
  console.log(`C2: ${c2pass ? 'PASS' : 'FAIL'}\n`);
  results.c2 = { pass: c2pass, afterChange: c2state_after_change, afterAgora: c2state_after_agora };

  // =========================================================
  // C3: Planets reposition on date change
  // =========================================================
  console.log('=== C3: Planets reposition on date change ===');
  // Get positions at today
  await wait(500);
  const pos_today = await getPlanetLabelPositions(page);
  console.log('Planet positions today (2026-06-17):', JSON.stringify(pos_today));

  await setDate(page, '2020-01-15');
  const pos_2020 = await getPlanetLabelPositions(page);
  console.log('Planet positions at 2020-01-15:', JSON.stringify(pos_2020));

  let changedCount = 0;
  for (const name of Object.keys(pos_today)) {
    if (pos_2020[name] &&
        (pos_2020[name].left !== pos_today[name].left || pos_2020[name].top !== pos_today[name].top)) {
      changedCount++;
    }
  }
  console.log(`Changed positions: ${changedCount}/${Object.keys(pos_today).length}`);
  await page.screenshot({ path: ss('04-planets-2020'), fullPage: false });

  const c3pass = changedCount >= 6; // at least 6 of 8 planets moved
  console.log(`C3: ${c3pass ? 'PASS' : 'FAIL'} (${changedCount} planets moved)\n`);
  results.c3 = { pass: c3pass, changedCount };

  // =========================================================
  // C4: Retrograde badge
  // =========================================================
  console.log('=== C4: Retrograde badge ===');

  // Check if isMarsRetrograde function works inside the app's module scope
  // The function is module-scoped but Astronomy is imported as ESM
  // We need to trigger via the date picker

  // Try 2022-10-01
  await setDate(page, '2022-10-01');
  const c4badge2022_10_01 = await page.evaluate(() => {
    const badge = document.getElementById('retrograde-badge');
    return {
      hidden: badge?.classList.contains('hidden'),
      text: badge?.textContent.trim(),
      display: window.getComputedStyle(badge).display
    };
  });
  console.log('Badge at 2022-10-01:', c4badge2022_10_01);
  await page.screenshot({ path: ss('05-badge-2022-10-01'), fullPage: false });

  // Try 2022-10-30 (deeper into retrograde)
  await setDate(page, '2022-10-30');
  const c4badge2022_10_30 = await page.evaluate(() => {
    const b = document.getElementById('retrograde-badge');
    return { hidden: b?.classList.contains('hidden'), display: window.getComputedStyle(b).display };
  });
  console.log('Badge at 2022-10-30:', c4badge2022_10_30);
  await page.screenshot({ path: ss('06-badge-2022-10-30'), fullPage: false });

  // Try 2022-11-15
  await setDate(page, '2022-11-15');
  const c4badge2022_11_15 = await page.evaluate(() => {
    const b = document.getElementById('retrograde-badge');
    return { hidden: b?.classList.contains('hidden'), display: window.getComputedStyle(b).display };
  });
  console.log('Badge at 2022-11-15:', c4badge2022_11_15);

  // Try today 2026-06-17
  await page.click('#btn-hoje');
  await wait(800);
  const c4badgeToday = await page.evaluate(() => {
    const b = document.getElementById('retrograde-badge');
    return { hidden: b?.classList.contains('hidden'), display: window.getComputedStyle(b).display };
  });
  console.log('Badge at 2026-06-17 (today):', c4badgeToday);
  await page.screenshot({ path: ss('07-badge-today'), fullPage: false });

  const badgeAppeared = !c4badge2022_10_01.hidden || !c4badge2022_10_30.hidden || !c4badge2022_11_15.hidden;
  // C4 passes if: badge element exists AND it appeared at least once during known retrograde
  const c4pass = badgeAppeared;
  console.log(`C4: ${c4pass ? 'PASS' : 'FAIL'} — badge appeared at retrograde dates: ${badgeAppeared}`);
  if (!c4pass) {
    console.log('  NOTE: Badge exists in DOM but never shown — isMarsRetrograde() may always return false');
    console.log('  The Astronomy module is an ESM import (module-scoped) — cannot test from page context');
    console.log('  This is a C4 FAIL: badge should appear during known Mars retrograde 2022-10 to 2023-01');
  }
  results.c4 = { pass: c4pass, badgeAppeared, at20221001: c4badge2022_10_01, at20221030: c4badge2022_10_30, atToday: c4badgeToday };
  console.log();

  // =========================================================
  // C5: URL hash contains date
  // =========================================================
  console.log('=== C5: URL hash contains date ===');
  await setDate(page, '2020-01-15');
  const c5url = page.url();
  const c5hash = new URL(c5url).hash;
  console.log('URL:', c5url);
  console.log('Hash:', c5hash);
  const c5pass = c5hash.includes('date=2020-01-15') || c5hash.includes('date%3D2020-01-15');
  await page.screenshot({ path: ss('08-url-hash'), fullPage: false });
  console.log(`C5: ${c5pass ? 'PASS' : 'FAIL'} — hash: ${c5hash}\n`);
  results.c5 = { pass: c5pass, hash: c5hash };

  // =========================================================
  // C6: Panel disappears in front view, reappears on back
  // =========================================================
  console.log('=== C6: Date panel hides in front view ===');

  // Reset to today top view
  await page.click('#btn-hoje');
  await wait(800);

  const panelBeforeClick = await getDateControlsVisible(page);
  console.log('Panel visible before clicking planet:', panelBeforeClick);

  // Click on the canvas to select a planet (click center where sun is, then try offset)
  // selectPlanet is triggered on click raycasting — click directly on a planet's 3D position
  // The sun is at (0,0), inner planets within 150-200px of center at 1280x800

  // Use keyboard shortcut - pressing number keys triggers planet selection
  // Looking at keydown handler...
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', code: 'Digit3', bubbles: true }));
  });
  await wait(3000); // Wait for camera animation to complete

  const panelInFront = await getDateControlsVisible(page);
  const cardVisible = await page.evaluate(() => {
    const card = document.getElementById('planet-card');
    if (!card) return false;
    const rect = card.getBoundingClientRect();
    const style = window.getComputedStyle(card);
    return !card.classList.contains('hidden') && style.display !== 'none' && rect.width > 0;
  });
  const viewModeState = await page.evaluate(() => {
    // Check dateControls hidden class directly
    const dc = document.getElementById('date-controls');
    return {
      dcHiddenClass: dc?.classList.contains('hidden'),
      dcDisplay: window.getComputedStyle(dc).display,
      cardHidden: document.getElementById('planet-card')?.classList.contains('hidden')
    };
  });
  console.log('After key 3 (Earth selection):', viewModeState);
  console.log('Panel visible (should be FALSE):', panelInFront);
  console.log('Card visible (should be TRUE):', cardVisible);

  await page.screenshot({ path: ss('09-front-view'), fullPage: false });

  // Click Voltar to go back
  const voltarVisible = await page.evaluate(() => {
    const btn = document.getElementById('card-close');
    const rect = btn?.getBoundingClientRect();
    return { visible: !!btn && rect?.width > 0, text: btn?.textContent.trim() };
  });
  console.log('Voltar button:', voltarVisible);

  let panelAfterBack = false;
  if (voltarVisible.visible) {
    await page.click('#card-close');
    await wait(2000); // Wait for camera animation back to top
    panelAfterBack = await getDateControlsVisible(page);
    console.log('Panel visible after Voltar (should be TRUE):', panelAfterBack);
    await page.screenshot({ path: ss('10-back-top'), fullPage: false });
  } else {
    // Try Escape
    await page.keyboard.press('Escape');
    await wait(2000);
    panelAfterBack = await getDateControlsVisible(page);
    await page.screenshot({ path: ss('10-back-escape'), fullPage: false });
  }

  // C6 passes if: panel was hidden in front view AND reappeared after back
  const c6pass = !panelInFront && panelAfterBack;
  console.log(`C6: ${c6pass ? 'PASS' : 'FAIL'} (hidden in front: ${!panelInFront}, visible after back: ${panelAfterBack})\n`);
  results.c6 = { pass: c6pass, panelInFront, panelAfterBack, cardVisible };

  // =========================================================
  // C7: Console errors
  // =========================================================
  console.log('=== C7: Console errors ===');
  const realErrors = consoleErrors.filter(e =>
    !e.includes('favicon') && !e.includes('.ico')
  );
  console.log('Total errors:', consoleErrors.length, '— Real errors (non-favicon):', realErrors.length);
  consoleErrors.forEach(e => console.log('  [error]', e));

  const c7pass = realErrors.length === 0;
  console.log(`C7: ${c7pass ? 'PASS' : 'FAIL'}\n`);
  results.c7 = { pass: c7pass, errors: consoleErrors, realErrors };

  // =========================================================
  // C8: Mobile 375px
  // =========================================================
  console.log('=== C8: Mobile 375px ===');
  await page.setViewport({ width: 375, height: 667 });
  await wait(1000);

  const c8state = await page.evaluate(() => {
    const dc = document.getElementById('date-controls');
    const dp = document.getElementById('date-picker');
    const btn = document.getElementById('btn-hoje');
    if (!dc) return { exists: false };
    const rect = dc.getBoundingClientRect();
    const style = window.getComputedStyle(dc);
    return {
      exists: true,
      hidden: dc.classList.contains('hidden'),
      display: style.display,
      visible: rect.width > 0 && rect.height > 0,
      hasPicker: !!dp,
      hasAgora: !!btn,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    };
  });
  console.log('Mobile state:', JSON.stringify(c8state, null, 2));
  await page.screenshot({ path: ss('11-mobile-375'), fullPage: false });

  const c8pass = c8state.exists && !c8state.hidden && c8state.visible && c8state.hasPicker && c8state.hasAgora;
  console.log(`C8: ${c8pass ? 'PASS' : 'FAIL'}\n`);
  results.c8 = { pass: c8pass, details: c8state };

  // =========================================================
  // SUMMARY
  // =========================================================
  console.log('\n========================================');
  console.log('FINAL RESULTS SUMMARY — SIS-74');
  console.log('========================================');
  const criteria = [
    ['C1', 'c1', 'Painel de data na vista superior'],
    ['C2', 'c2', 'Input de data e botão Agora funcionam'],
    ['C3', 'c3', 'Planetas se reposicionam na órbita'],
    ['C4', 'c4', 'Badge Retrógrado aparece em datas corretas'],
    ['C5', 'c5', 'Estado da data no hash da URL'],
    ['C6', 'c6', 'Painel some na vista frontal / reaparece'],
    ['C7', 'c7', 'Zero erros no console'],
    ['C8', 'c8', 'Responsivo (mobile 375px)'],
  ];
  for (const [num, key, label] of criteria) {
    const r = results[key];
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${num} — ${label}`);
  }

  const allPass = Object.values(results).every(r => r.pass);
  console.log(`\nOverall: ${allPass ? 'PASS' : 'FAIL'}`);

  fs.writeFileSync(`${OUT_DIR}\\qa-sis74-results.json`, JSON.stringify(results, null, 2));
  console.log('Results written to qa-sis74-results.json');

  await browser.close();
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
