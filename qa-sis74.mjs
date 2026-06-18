import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const OUT_DIR = 'D:\\code\\sistema-solar-3d';
const PREFIX = 'qa-sis74-';

const results = {};
const errors = [];

function ss(name) {
  return `${OUT_DIR}\\${PREFIX}${name}.png`;
}

async function setDateInput(page, dateValue) {
  // Use evaluate to directly set the input value and dispatch change
  await page.evaluate((val) => {
    const dp = document.getElementById('date-picker');
    dp.value = val;
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  }, dateValue);
  await new Promise(r => setTimeout(r, 800)); // wait for planets to move
}

async function getPlanetAngles(page) {
  return await page.evaluate(() => {
    // Try to get planet DOM label positions as proxy for orbital angles
    const labels = document.querySelectorAll('.planet-label');
    const positions = {};
    labels.forEach(el => {
      const style = window.getComputedStyle(el);
      positions[el.textContent.trim()] = {
        left: el.style.left || style.left,
        top: el.style.top || style.top
      };
    });
    return positions;
  });
}

async function getDateControlsState(page) {
  return await page.evaluate(() => {
    const dc = document.getElementById('date-controls');
    if (!dc) return { exists: false };
    const rect = dc.getBoundingClientRect();
    const computed = window.getComputedStyle(dc);
    return {
      exists: true,
      hidden: dc.classList.contains('hidden'),
      visible: rect.width > 0 && rect.height > 0,
      display: computed.display,
      hasPicker: !!document.getElementById('date-picker'),
      hasAgora: !!document.getElementById('btn-hoje'),
      hasRetrogradeBadge: !!document.getElementById('retrograde-badge'),
      pickerValue: document.getElementById('date-picker')?.value,
      retrogradHidden: document.getElementById('retrograde-badge')?.classList.contains('hidden'),
    };
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`);
  });

  console.log('Loading app...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000)); // wait for WebGL init

  // =====================================================
  // CRITERION 1: Date panel visible in top view
  // =====================================================
  console.log('\n--- CRITERION 1: Date panel in top view ---');
  const dc1 = await getDateControlsState(page);
  console.log('Date controls state:', JSON.stringify(dc1, null, 2));

  await page.screenshot({ path: ss('01-top-view-initial'), fullPage: false });
  console.log('Screenshot: qa-sis74-01-top-view-initial.png');

  const c1pass = dc1.exists && !dc1.hidden && dc1.visible && dc1.hasPicker && dc1.hasAgora;
  results['1_date_panel'] = {
    pass: c1pass,
    details: dc1
  };
  console.log(`CRITERION 1: ${c1pass ? 'PASS' : 'FAIL'}`);

  // =====================================================
  // CRITERION 2 & 3: Date input changes + planets reposition
  // =====================================================
  console.log('\n--- CRITERION 2 & 3: Date input and planet positions ---');

  // Capture planet label positions at initial date (today)
  const todayPositions = await getPlanetAngles(page);
  const todayPicker = await page.evaluate(() => document.getElementById('date-picker')?.value);
  console.log('Today picker value:', todayPicker);
  console.log('Today planet positions (sample):', JSON.stringify(todayPositions));

  // Screenshot before date change
  await page.screenshot({ path: ss('02-before-date-change'), fullPage: false });

  // Set date to 2020-01-15
  console.log('Setting date to 2020-01-15...');
  await setDateInput(page, '2020-01-15');
  await new Promise(r => setTimeout(r, 1000));

  const dc2 = await getDateControlsState(page);
  console.log('Picker value after change:', dc2.pickerValue);
  const positions2020 = await getPlanetAngles(page);
  console.log('2020-01-15 planet positions (sample):', JSON.stringify(positions2020));

  await page.screenshot({ path: ss('03-date-2020-01-15'), fullPage: false });
  console.log('Screenshot: qa-sis74-03-date-2020-01-15.png');

  // Check if positions changed
  let positionsChanged = false;
  for (const key of Object.keys(todayPositions)) {
    if (positions2020[key] &&
        (positions2020[key].left !== todayPositions[key].left ||
         positions2020[key].top !== todayPositions[key].top)) {
      positionsChanged = true;
      break;
    }
  }
  console.log('Positions changed from today to 2020-01-15:', positionsChanged);

  // Click "Agora" button to reset to today
  console.log('Clicking Agora button...');
  await page.click('#btn-hoje');
  await new Promise(r => setTimeout(r, 1000));

  const dcAfterAgora = await getDateControlsState(page);
  console.log('Picker value after Agora:', dcAfterAgora.pickerValue);

  // Check today's date format
  const todayExpected = '2026-06-17';
  const agoraWorked = dcAfterAgora.pickerValue === todayExpected;
  console.log(`Agora reset to today (${todayExpected}): ${agoraWorked}`);

  await page.screenshot({ path: ss('04-after-agora'), fullPage: false });
  console.log('Screenshot: qa-sis74-04-after-agora.png');

  results['2_date_input_agora'] = {
    pass: dc2.pickerValue === '2020-01-15' && agoraWorked,
    pickerAfterChange: dc2.pickerValue,
    pickerAfterAgora: dcAfterAgora.pickerValue,
    expectedToday: todayExpected
  };
  results['3_planets_reposition'] = {
    pass: positionsChanged,
    todayPositions,
    positions2020
  };
  console.log(`CRITERION 2: ${results['2_date_input_agora'].pass ? 'PASS' : 'FAIL'}`);
  console.log(`CRITERION 3: ${results['3_planets_reposition'].pass ? 'PASS' : 'FAIL'}`);

  // =====================================================
  // CRITERION 4: Retrógrado badge
  // =====================================================
  console.log('\n--- CRITERION 4: Retrógrado badge ---');

  // Try 2022-10-01 (known Mars retrograde period)
  console.log('Setting date to 2022-10-01 (Mars retrograde period)...');
  await setDateInput(page, '2022-10-01');
  await new Promise(r => setTimeout(r, 800));

  const dc4a = await getDateControlsState(page);
  const badgeVisible2022 = !dc4a.retrogradHidden;
  console.log('Retrograde badge visible at 2022-10-01:', badgeVisible2022);

  if (badgeVisible2022) {
    await page.screenshot({ path: ss('05-retrograde-badge-2022'), fullPage: false });
    console.log('Screenshot: qa-sis74-05-retrograde-badge-2022.png');
  } else {
    await page.screenshot({ path: ss('05-no-retrograde-2022'), fullPage: false });
    console.log('Screenshot: qa-sis74-05-no-retrograde-2022.png');
  }

  // Try today (2026-06-17)
  await page.click('#btn-hoje');
  await new Promise(r => setTimeout(r, 800));
  const dc4b = await getDateControlsState(page);
  const badgeVisibleToday = !dc4b.retrogradHidden;
  console.log('Retrograde badge visible at 2026-06-17:', badgeVisibleToday);
  await page.screenshot({ path: ss('06-retrograde-today'), fullPage: false });

  results['4_retrograde_badge'] = {
    pass: true, // It either shows or doesn't, we just verify the element exists and badge logic runs
    badgeExistsInDOM: dc4a.hasRetrogradeBadge,
    visibleAt20221001: badgeVisible2022,
    visibleAtToday: badgeVisibleToday,
    note: badgeVisible2022 ? 'Badge appeared at 2022-10-01 retrograde period' : 'Badge did NOT appear at 2022-10-01 — may indicate logic issue'
  };
  // Real PASS requires badge to appear at 2022-10-01 OR badge element exists
  results['4_retrograde_badge'].pass = dc4a.hasRetrogradeBadge && badgeVisible2022;
  console.log(`CRITERION 4: ${results['4_retrograde_badge'].pass ? 'PASS' : 'FAIL'} — ${results['4_retrograde_badge'].note}`);

  // =====================================================
  // CRITERION 5: URL hash contains date
  // =====================================================
  console.log('\n--- CRITERION 5: URL hash contains date ---');

  await setDateInput(page, '2020-01-15');
  await new Promise(r => setTimeout(r, 500));

  const url = page.url();
  const hash = new URL(url).hash;
  console.log('Current URL:', url);
  console.log('Hash:', hash);

  const hashHasDate = hash.includes('date=') && hash.includes('2020-01-15');
  console.log('Hash contains date=2020-01-15:', hashHasDate);

  await page.screenshot({ path: ss('07-url-hash'), fullPage: false });
  console.log('Screenshot: qa-sis74-07-url-hash.png');

  results['5_url_hash'] = {
    pass: hashHasDate,
    url,
    hash
  };
  console.log(`CRITERION 5: ${results['5_url_hash'].pass ? 'PASS' : 'FAIL'} — hash: ${hash}`);

  // =====================================================
  // CRITERION 6: Panel disappears in front view
  // =====================================================
  console.log('\n--- CRITERION 6: Panel hides in front view ---');

  // Reset to today first
  await page.click('#btn-hoje');
  await new Promise(r => setTimeout(r, 500));

  // Click on a planet to enter front view
  // Planets are on canvas — click the center-ish area where planets orbit
  // Use the planet label click if available
  const planetLabels = await page.evaluate(() => {
    const labels = document.querySelectorAll('.planet-label');
    return Array.from(labels).map(el => {
      const rect = el.getBoundingClientRect();
      return { text: el.textContent.trim(), x: rect.left + rect.width/2, y: rect.top + rect.height/2, visible: rect.width > 0 };
    }).filter(l => l.visible);
  });
  console.log('Visible planet labels:', planetLabels.map(l => l.text));

  let clickedPlanet = false;
  if (planetLabels.length > 0) {
    const target = planetLabels[0];
    console.log(`Clicking planet label "${target.text}" at (${target.x}, ${target.y})`);
    await page.mouse.click(target.x, target.y);
    await new Promise(r => setTimeout(r, 1500));
    clickedPlanet = true;
  }

  const dc6Front = await getDateControlsState(page);
  console.log('Date controls state after clicking planet:', JSON.stringify(dc6Front));

  await page.screenshot({ path: ss('08-front-view'), fullPage: false });
  console.log('Screenshot: qa-sis74-08-front-view.png');

  const panelHiddenInFront = dc6Front.hidden || !dc6Front.visible || dc6Front.display === 'none';
  console.log('Panel hidden in front view:', panelHiddenInFront);

  // Now click "← Voltar" to go back
  const voltarBtn = await page.$('#card-close');
  let panelVisibleAfterBack = false;
  if (voltarBtn) {
    console.log('Clicking ← Voltar button...');
    await voltarBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    const dc6Back = await getDateControlsState(page);
    panelVisibleAfterBack = !dc6Back.hidden && dc6Back.visible;
    console.log('Date controls state after Voltar:', JSON.stringify(dc6Back));
    await page.screenshot({ path: ss('09-back-to-top'), fullPage: false });
    console.log('Screenshot: qa-sis74-09-back-to-top.png');
    console.log('Panel visible after Voltar:', panelVisibleAfterBack);
  } else {
    console.log('Could not find Voltar button — card may not have opened');
    // Try Escape key
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    const dc6Esc = await getDateControlsState(page);
    panelVisibleAfterBack = !dc6Esc.hidden && dc6Esc.visible;
    await page.screenshot({ path: ss('09-after-escape'), fullPage: false });
  }

  results['6_panel_front_view'] = {
    pass: (clickedPlanet ? panelHiddenInFront : true) && panelVisibleAfterBack,
    clickedPlanet,
    panelHiddenInFront,
    panelVisibleAfterBack,
    note: !clickedPlanet ? 'Could not click planet label — front view not triggered' : ''
  };
  console.log(`CRITERION 6: ${results['6_panel_front_view'].pass ? 'PASS' : 'FAIL'}`);

  // =====================================================
  // CRITERION 7: Zero console errors
  // =====================================================
  console.log('\n--- CRITERION 7: Console errors ---');
  console.log('Console errors collected:', consoleErrors.length);
  consoleErrors.forEach(e => console.log(' ERROR:', e));

  results['7_console_errors'] = {
    pass: consoleErrors.length === 0,
    errorCount: consoleErrors.length,
    errors: consoleErrors
  };
  console.log(`CRITERION 7: ${results['7_console_errors'].pass ? 'PASS' : 'FAIL'}`);

  // =====================================================
  // CRITERION 8: Responsive / mobile (375px)
  // =====================================================
  console.log('\n--- CRITERION 8: Mobile responsive (375px) ---');

  await page.setViewport({ width: 375, height: 667 });
  await new Promise(r => setTimeout(r, 1000));

  const dc8 = await getDateControlsState(page);
  console.log('Date controls state at 375px:', JSON.stringify(dc8));
  const panelVisibleMobile = dc8.exists && !dc8.hidden && dc8.visible;

  await page.screenshot({ path: ss('10-mobile-375'), fullPage: false });
  console.log('Screenshot: qa-sis74-10-mobile-375.png');

  results['8_mobile'] = {
    pass: panelVisibleMobile && dc8.hasPicker && dc8.hasAgora,
    panelVisible: panelVisibleMobile,
    details: dc8
  };
  console.log(`CRITERION 8: ${results['8_mobile'].pass ? 'PASS' : 'FAIL'}`);

  // =====================================================
  // FINAL SUMMARY
  // =====================================================
  console.log('\n\n========================================');
  console.log('FINAL RESULTS SUMMARY');
  console.log('========================================');
  const criteria = [
    ['1', '1_date_panel', 'Painel de data na vista superior'],
    ['2', '2_date_input_agora', 'Input de data e botão Agora'],
    ['3', '3_planets_reposition', 'Planetas se reposicionam na órbita'],
    ['4', '4_retrograde_badge', 'Badge Retrógrado'],
    ['5', '5_url_hash', 'Estado da data no hash da URL'],
    ['6', '6_panel_front_view', 'Painel some na vista frontal'],
    ['7', '7_console_errors', 'Zero erros no console'],
    ['8', '8_mobile', 'Responsivo (mobile 375px)'],
  ];
  for (const [num, key, label] of criteria) {
    const r = results[key];
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${num}. ${label}`);
    if (!r.pass && r.note) console.log(`       Note: ${r.note}`);
  }

  // Write JSON results
  fs.writeFileSync(`${OUT_DIR}\\qa-sis74-results.json`, JSON.stringify({ results, consoleErrors }, null, 2));
  console.log('\nResults saved to qa-sis74-results.json');

  await browser.close();
})().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
