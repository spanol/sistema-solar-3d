/**
 * QA SIS-95: Logic validation via code analysis + isolated JS execution
 * Since headless Chromium can't render WebGL, we:
 * 1. Parse and execute the non-Three.js JS logic in Node.js
 * 2. Try Puppeteer with SwiftShader software rendering
 * 3. Document findings from code analysis
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5173';
const OUT_DIR = path.join(__dirname, 'qa-sis95-screenshots');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const consoleErrors = [];
const consoleWarnings = [];
const results = {};

async function ss(page, name) {
  const p = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 ${name}.png`);
  return p;
}

async function waitForAppInit(page, timeout = 15000) {
  // Wait for the date-picker to have a value (sign app JS ran)
  try {
    await page.waitForFunction(() => {
      const dp = document.getElementById('date-picker');
      return dp && dp.value && dp.value.length > 0;
    }, { timeout });
    return true;
  } catch (e) {
    // fallback: wait for canvas + extra time
    await page.waitForSelector('canvas', { timeout: 5000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    return false;
  }
}

// Launch with software rendering (SwiftShader)
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-gpu-watchdog',
  ],
});

try {
  // ── TEST 1: Initial load ─────────────────────────────────────────────────
  console.log('\n=== TEST 1: Initial load ===');
  const p1 = await browser.newPage();
  p1.on('console', msg => {
    const t = msg.type();
    const text = msg.text();
    if (t === 'error') consoleErrors.push({ test: 1, text });
    if (t === 'warning') consoleWarnings.push({ test: 1, text });
  });
  await p1.setViewport({ width: 1280, height: 800 });
  await p1.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  const appInited = await waitForAppInit(p1);
  await ss(p1, '01-initial-desktop');

  const state1 = await p1.evaluate(() => {
    const dp = document.getElementById('date-picker');
    const btn = document.getElementById('btn-realtime');
    return {
      datePickerValue: dp?.value,
      realtimeBtn: btn ? {
        text: btn.textContent.trim(),
        active: btn.classList.contains('active'),
        ariaPressed: btn.getAttribute('aria-pressed'),
        id: btn.id,
      } : null,
      hash: window.location.hash,
      today: new Date().toISOString().slice(0, 10),
    };
  });

  results.test1 = { appInited, state: state1 };
  console.log('  App initialized:', appInited);
  console.log('  Date picker:', state1.datePickerValue, '(today:', state1.today, ')');
  console.log('  Realtime btn:', JSON.stringify(state1.realtimeBtn));
  console.log('  Hash:', state1.hash);
  await p1.close();

  // ── TEST 2: Realtime toggle ──────────────────────────────────────────────
  console.log('\n=== TEST 2: Realtime button toggle ===');
  const p2 = await browser.newPage();
  p2.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ test: 2, text: msg.text() });
  });
  await p2.setViewport({ width: 1280, height: 800 });
  await p2.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForAppInit(p2);

  // Click realtime button
  await p2.click('#btn-realtime');
  await new Promise(r => setTimeout(r, 800));

  const state2on = await p2.evaluate(() => {
    const btn = document.getElementById('btn-realtime');
    const dp = document.getElementById('date-picker');
    return {
      active: btn?.classList.contains('active'),
      ariaPressed: btn?.getAttribute('aria-pressed'),
      date: dp?.value,
      hash: window.location.hash,
    };
  });

  // Wait for auto-update
  await new Promise(r => setTimeout(r, 2500));
  const state2interval = await p2.evaluate(() => ({
    date: document.getElementById('date-picker')?.value,
    hash: window.location.hash,
  }));

  // Click to toggle OFF
  await p2.click('#btn-realtime');
  await new Promise(r => setTimeout(r, 500));
  const state2off = await p2.evaluate(() => {
    const btn = document.getElementById('btn-realtime');
    return {
      active: btn?.classList.contains('active'),
      ariaPressed: btn?.getAttribute('aria-pressed'),
      hash: window.location.hash,
    };
  });

  await ss(p2, '02-realtime-toggle');
  results.test2 = { on: state2on, interval: state2interval, off: state2off };
  console.log('  ON state:', JSON.stringify(state2on));
  console.log('  After interval:', JSON.stringify(state2interval));
  console.log('  OFF state:', JSON.stringify(state2off));
  await p2.close();

  // ── TEST 3: Past date (Mars retrograde Dec 2024) ─────────────────────────
  console.log('\n=== TEST 3: Past date — Mars retrograde ===');
  const p3 = await browser.newPage();
  p3.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ test: 3, text: msg.text() });
  });
  await p3.setViewport({ width: 1280, height: 800 });
  await p3.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForAppInit(p3);

  await p3.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-12-15';
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 2000));

  const state3 = await p3.evaluate(() => {
    const dp = document.getElementById('date-picker');
    const btn = document.getElementById('btn-realtime');
    const badge = document.getElementById('retrograde-badge');
    return {
      date: dp?.value,
      realtimeActive: btn?.classList.contains('active'),
      badgeVisible: badge ? !badge.classList.contains('hidden') : null,
      badgeText: badge?.textContent.trim(),
      hash: window.location.hash,
    };
  });

  // Wait to verify no drift
  await new Promise(r => setTimeout(r, 3000));
  const state3b = await p3.evaluate(() => ({
    date: document.getElementById('date-picker')?.value,
    hash: window.location.hash,
  }));

  await ss(p3, '03-past-date-retrograde');
  results.test3 = { initial: state3, afterWait: state3b };
  console.log('  State after date change:', JSON.stringify(state3));
  console.log('  After 3s wait (no drift check):', JSON.stringify(state3b));
  await p3.close();

  // ── TEST 4: Deep-link #realtime=1 ────────────────────────────────────────
  console.log('\n=== TEST 4: Deep-link #realtime=1 ===');
  const p4 = await browser.newPage();
  p4.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ test: 4, text: msg.text() });
  });
  await p4.setViewport({ width: 1280, height: 800 });
  await p4.goto(`${BASE_URL}/#realtime=1`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForAppInit(p4);

  const state4 = await p4.evaluate(() => {
    const btn = document.getElementById('btn-realtime');
    const dp = document.getElementById('date-picker');
    return {
      realtimeActive: btn?.classList.contains('active'),
      ariaPressed: btn?.getAttribute('aria-pressed'),
      date: dp?.value,
      hash: window.location.hash,
    };
  });
  await ss(p4, '04-deeplink-realtime');
  results.test4 = state4;
  console.log('  Deep-link state:', JSON.stringify(state4));
  await p4.close();

  // ── TEST 5: Mobile 375px ─────────────────────────────────────────────────
  console.log('\n=== TEST 5: Mobile 375px ===');
  const p5 = await browser.newPage();
  p5.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ test: 5, text: msg.text() });
  });
  await p5.setViewport({ width: 375, height: 812 });
  await p5.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForAppInit(p5);

  const btn5 = await p5.evaluate(() => {
    const btn = document.getElementById('btn-realtime');
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    return {
      text: btn.textContent.trim(),
      found: true,
      rect: { top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height) },
      visible: rect.width > 0 && rect.height > 0,
      inViewport: rect.top >= 0 && rect.bottom <= 812 && rect.left >= 0 && rect.right <= 375,
    };
  });

  await ss(p5, '05-mobile-initial');

  await p5.click('#btn-realtime');
  await new Promise(r => setTimeout(r, 800));
  const btn5after = await p5.evaluate(() => {
    const btn = document.getElementById('btn-realtime');
    return { active: btn?.classList.contains('active'), hash: window.location.hash };
  });
  await ss(p5, '05b-mobile-realtime-active');

  results.test5 = { btn: btn5, afterClick: btn5after };
  console.log('  Button info:', JSON.stringify(btn5));
  console.log('  After click:', JSON.stringify(btn5after));
  await p5.close();

  // ── TEST 6: Today restores live ─────────────────────────────────────────
  console.log('\n=== TEST 6: Toggle back — hoje button ===');
  const p6 = await browser.newPage();
  p6.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ test: 6, text: msg.text() });
  });
  await p6.setViewport({ width: 1280, height: 800 });
  // Start with realtime=1 deep-link
  await p6.goto(`${BASE_URL}/#realtime=1`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitForAppInit(p6);

  const state6before = await p6.evaluate(() => ({
    realtimeActive: document.getElementById('btn-realtime')?.classList.contains('active'),
    date: document.getElementById('date-picker')?.value,
    hash: window.location.hash,
  }));

  await ss(p6, '06a-realtime-deeplink-state');

  // Click hoje
  await p6.click('#btn-hoje');
  await new Promise(r => setTimeout(r, 800));

  const state6after = await p6.evaluate(() => ({
    realtimeActive: document.getElementById('btn-realtime')?.classList.contains('active'),
    date: document.getElementById('date-picker')?.value,
    today: new Date().toISOString().slice(0, 10),
    hash: window.location.hash,
  }));
  await ss(p6, '06b-hoje-clicked');

  results.test6 = { before: state6before, after: state6after };
  console.log('  Before hoje click:', JSON.stringify(state6before));
  console.log('  After hoje click:', JSON.stringify(state6after));
  await p6.close();

} finally {
  await browser.close();
}

// ── FINAL REPORT ─────────────────────────────────────────────────────────────
const r = results;
const today = new Date().toISOString().slice(0, 10);

console.log('\n\n╔══════════════════════════════════════════════════════╗');
console.log('║  QA SIS-95: Modo Tempo Real — FINAL REPORT          ║');
console.log('╠══════════════════════════════════════════════════════╣\n');

// C1: Load without hash → today's date, button present
const c1_dateOk = r.test1?.state?.datePickerValue === today;
const c1_btnOk = r.test1?.state?.realtimeBtn?.id === 'btn-realtime';
const c1 = c1_dateOk && c1_btnOk;
console.log(`[${c1 ? 'PASS' : 'FAIL'}] C1 Carga sem hash: data=hoje + botão presente`);
console.log(`       datePicker="${r.test1?.state?.datePickerValue}" today="${today}" btn_found=${c1_btnOk}`);

// C2: Realtime mode activates, hash has realtime=1, deactivates
const c2_on = r.test2?.on?.active === true && r.test2?.on?.ariaPressed === 'true';
const c2_hash = r.test2?.on?.hash?.includes('realtime=1');
const c2_off = r.test2?.off?.active === false;
const c2 = c2_on && c2_hash && c2_off;
console.log(`[${c2 ? 'PASS' : 'FAIL'}] C2 Toggle: ativa (active=true, hash=realtime=1), desativa`);
console.log(`       on.active=${r.test2?.on?.active} hash="${r.test2?.on?.hash}" off.active=${r.test2?.off?.active}`);

// C3: Past date set correctly, realtime not active
const c3_date = r.test3?.initial?.date === '2024-12-15';
const c3_rtOff = !r.test3?.initial?.realtimeActive;
const c3 = c3_date && c3_rtOff;
console.log(`[${c3 ? 'PASS' : 'FAIL'}] C3 Data fixa: data correta, realtime desligado`);
console.log(`       date="${r.test3?.initial?.date}" realtimeActive=${r.test3?.initial?.realtimeActive}`);
console.log(`       badge visible=${r.test3?.initial?.badgeVisible} text="${r.test3?.initial?.badgeText}"`);

// C4: Deep-link #realtime=1 restores mode
const c4 = r.test4?.realtimeActive === true && r.test4?.hash?.includes('realtime=1');
console.log(`[${c4 ? 'PASS' : 'FAIL'}] C4 Deep-link #realtime=1 restaura modo`);
console.log(`       active=${r.test4?.realtimeActive} hash="${r.test4?.hash}"`);

// C5: Console errors (WebGL errors from headless env are expected — filter them)
const realErrors = consoleErrors.filter(e =>
  !e.text.includes('WebGL') &&
  !e.text.includes('WebGLRenderer') &&
  !e.text.includes('Could not create a WebGL') &&
  !e.text.includes('gpu') &&
  !e.text.includes('GPU')
);
const c5 = realErrors.length === 0;
console.log(`[${c5 ? 'PASS' : 'FAIL'}] C5 Console limpo (${realErrors.length} erros reais, ${consoleErrors.length} total incl. WebGL headless)`);
if (realErrors.length > 0) realErrors.slice(0, 5).forEach(e => console.log(`       [t${e.test}] ${e.text.slice(0, 120)}`));

// C6: Mobile button visible and functional
const c6_vis = r.test5?.btn?.visible && r.test5?.btn?.found;
const c6_works = r.test5?.afterClick?.active === true;
const c6 = c6_vis && c6_works;
console.log(`[${c6 ? 'PASS' : 'FAIL'}] C6 Responsivo 375px: botão visível e funcional`);
console.log(`       visible=${r.test5?.btn?.visible} inViewport=${r.test5?.btn?.inViewport} activates=${r.test5?.afterClick?.active}`);

// C7: Hoje button clears realtime, restores today date
const c7_rtOff = !r.test6?.after?.realtimeActive;
const c7_date = r.test6?.after?.date === today;
const c7 = c7_rtOff && c7_date;
console.log(`[${c7 ? 'PASS' : 'FAIL'}] C7 Hoje button: desativa realtime, restaura data de hoje`);
console.log(`       before active=${r.test6?.before?.realtimeActive} after active=${r.test6?.after?.realtimeActive} date="${r.test6?.after?.date}"`);

const all = [c1, c2, c3, c4, c5, c6, c7];
const passed = all.filter(Boolean).length;
const allPass = all.every(Boolean);

console.log(`\n╠══════════════════════════════════════════════════════╣`);
console.log(`║  SCORE: ${passed}/${all.length} critérios aprovados`);
console.log(`║  VERDICT: ${allPass ? '✅ APROVADO — SIS-95 done, notificar SIS-93' : '❌ REPROVADO — reabrir SIS-94'}`);
console.log(`╚══════════════════════════════════════════════════════╝\n`);

fs.writeFileSync(
  path.join(__dirname, 'qa-sis95-results.json'),
  JSON.stringify({
    date: new Date().toISOString(),
    criteria: { c1, c2, c3, c4, c5, c6, c7, allPass, score: `${passed}/${all.length}` },
    details: results,
    consoleErrors,
    realErrors,
  }, null, 2)
);
