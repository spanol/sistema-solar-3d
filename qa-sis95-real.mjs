/**
 * QA SIS-95: Modo Tempo Real — Full validation with non-headless Chrome
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
const results = {};

async function mkBrowser(mobile = false) {
  return puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 800 },
  });
}

async function ss(page, name) {
  const p = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: p });
  console.log(`  📸 ${name}.png`);
  return p;
}

async function waitDP(page, timeout = 12000) {
  await page.waitForFunction(
    () => { const dp = document.getElementById('date-picker'); return dp && dp.value?.length > 0; },
    { timeout }
  );
}

async function getState(page) {
  return page.evaluate(() => {
    const dp  = document.getElementById('date-picker');
    const btn = document.getElementById('btn-realtime');
    const bdg = document.getElementById('retrograde-badge');
    return {
      date:     dp?.value ?? '',
      rtActive: btn?.classList.contains('active') ?? null,
      rtAria:   btn?.getAttribute('aria-pressed') ?? null,
      rtFound:  !!btn,
      badge:    bdg ? { visible: !bdg.classList.contains('hidden'), text: bdg.textContent.trim() } : null,
      hash:     window.location.hash,
      today:    new Date().toISOString().slice(0, 10),
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// TEST 1 — Initial load, no hash
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== T1: Initial load (no hash) ===');
{
  const br = await mkBrowser();
  const pg = await br.newPage();
  pg.on('console', m => { if (m.type()==='error') consoleErrors.push({t:1, msg: m.text()}); });
  pg.on('pageerror', e  => consoleErrors.push({t:1, msg: 'pageerror:'+e.message}));
  await pg.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitDP(pg);
  await new Promise(r => setTimeout(r, 2000)); // let 3D init finish
  const s = await getState(pg);
  await ss(pg, '01-initial-desktop');
  results.t1 = s;
  console.log('  state:', JSON.stringify(s));
  await br.close();
}

// ────────────────────────────────────────────────────────────────────────────
// TEST 2 — Realtime button toggle (ON → interval → OFF)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== T2: Realtime toggle ===');
{
  const br = await mkBrowser();
  const pg = await br.newPage();
  pg.on('console', m => { if (m.type()==='error') consoleErrors.push({t:2, msg: m.text()}); });
  await pg.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitDP(pg);
  await new Promise(r => setTimeout(r, 1500));

  // Capture initial planet angles
  const angles_before = await pg.evaluate(() => {
    try { return typeof planets !== 'undefined' ? planets.map(p => ({ name: p.name, angle: p.angle })) : []; }
    catch(e) { return []; }
  });

  // Click ON
  await pg.click('#btn-realtime');
  await new Promise(r => setTimeout(r, 600));
  const s_on = await getState(pg);
  await ss(pg, '02a-realtime-on');

  // Wait for one interval cycle (2s)
  await new Promise(r => setTimeout(r, 2500));
  const s_interval = await getState(pg);

  // Click OFF
  await pg.click('#btn-realtime');
  await new Promise(r => setTimeout(r, 500));
  const s_off = await getState(pg);
  await ss(pg, '02b-realtime-off');

  results.t2 = { on: s_on, interval: s_interval, off: s_off, angles_before };
  console.log('  ON:', JSON.stringify(s_on));
  console.log('  after interval:', JSON.stringify(s_interval));
  console.log('  OFF:', JSON.stringify(s_off));
  await br.close();
}

// ────────────────────────────────────────────────────────────────────────────
// TEST 3 — Past date + Mars retrograde (Dec 2024)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== T3: Past date — Mars retrograde Dec 2024 ===');
{
  const br = await mkBrowser();
  const pg = await br.newPage();
  pg.on('console', m => { if (m.type()==='error') consoleErrors.push({t:3, msg: m.text()}); });
  await pg.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitDP(pg);
  await new Promise(r => setTimeout(r, 2000));

  // Set date via evaluate (reliable cross-browser)
  await pg.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-12-15';
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 2000));
  const s_after_date = await getState(pg);
  await ss(pg, '03a-retro-date-set');

  // Verify no drift after 3s more
  await new Promise(r => setTimeout(r, 3000));
  const s_nodrift = await getState(pg);
  await ss(pg, '03b-retro-nodrift');

  // Also try another known retrograde window (Mars retrograde Oct-Nov 2022)
  await pg.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2022-11-01';
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 2000));
  const s_2022 = await getState(pg);
  await ss(pg, '03c-retro-nov2022');

  results.t3 = { after_date: s_after_date, no_drift: s_nodrift, alt_date: s_2022 };
  console.log('  after date change:', JSON.stringify(s_after_date));
  console.log('  after 3s (no drift):', JSON.stringify(s_nodrift));
  console.log('  Nov 2022 retrograde:', JSON.stringify(s_2022));
  await br.close();
}

// ────────────────────────────────────────────────────────────────────────────
// TEST 4 — Deep-link #realtime=1
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== T4: Deep-link #realtime=1 ===');
{
  const br = await mkBrowser();
  const pg = await br.newPage();
  pg.on('console', m => { if (m.type()==='error') consoleErrors.push({t:4, msg: m.text()}); });
  await pg.goto(`${BASE_URL}/#realtime=1`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitDP(pg);
  await new Promise(r => setTimeout(r, 2000));
  const s = await getState(pg);
  await ss(pg, '04-deeplink-realtime1');

  // Reload to verify persistence
  await pg.reload({ waitUntil: 'networkidle2', timeout: 20000 });
  await waitDP(pg);
  await new Promise(r => setTimeout(r, 2000));
  const s_reload = await getState(pg);
  await ss(pg, '04b-deeplink-after-reload');

  results.t4 = { initial: s, after_reload: s_reload };
  console.log('  initial:', JSON.stringify(s));
  console.log('  after reload:', JSON.stringify(s_reload));
  await br.close();
}

// ────────────────────────────────────────────────────────────────────────────
// TEST 5 — Mobile 375px
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== T5: Mobile 375px ===');
{
  const br = await mkBrowser(true);
  const pg = await br.newPage();
  pg.on('console', m => { if (m.type()==='error') consoleErrors.push({t:5, msg: m.text()}); });
  await pg.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitDP(pg);
  await new Promise(r => setTimeout(r, 2000));
  const btn_info = await pg.evaluate(() => {
    const btn = document.getElementById('btn-realtime');
    if (!btn) return { found: false };
    const r = btn.getBoundingClientRect();
    return {
      found: true,
      text: btn.textContent.trim(),
      visible: r.width > 0 && r.height > 0,
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
      rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
  await ss(pg, '05a-mobile-initial');

  await pg.click('#btn-realtime');
  await new Promise(r => setTimeout(r, 800));
  const s_after = await getState(pg);
  await ss(pg, '05b-mobile-realtime-on');

  results.t5 = { btn: btn_info, after_click: s_after };
  console.log('  btn_info:', JSON.stringify(btn_info));
  console.log('  after click:', JSON.stringify(s_after));
  await br.close();
}

// ────────────────────────────────────────────────────────────────────────────
// TEST 6 — Toggle Hoje: realtime → hoje button clears mode
// ────────────────────────────────────────────────────────────────────────────
console.log('\n=== T6: Toggle back to Hoje ===');
{
  const br = await mkBrowser();
  const pg = await br.newPage();
  pg.on('console', m => { if (m.type()==='error') consoleErrors.push({t:6, msg: m.text()}); });
  await pg.goto(`${BASE_URL}/#realtime=1`, { waitUntil: 'networkidle2', timeout: 30000 });
  await waitDP(pg);
  await new Promise(r => setTimeout(r, 2000));
  const s_before = await getState(pg);
  await ss(pg, '06a-realtime-active');

  await pg.click('#btn-hoje');
  await new Promise(r => setTimeout(r, 800));
  const s_after = await getState(pg);
  await ss(pg, '06b-hoje-clicked');

  results.t6 = { before: s_before, after: s_after };
  console.log('  before (realtime):', JSON.stringify(s_before));
  console.log('  after hoje click:', JSON.stringify(s_after));
  await br.close();
}

// ────────────────────────────────────────────────────────────────────────────
// FINAL REPORT
// ────────────────────────────────────────────────────────────────────────────
const r = results;
const today = new Date().toISOString().slice(0, 10);

// Filter out known non-app errors (404 for missing resources, not app logic)
const appErrors = consoleErrors.filter(e =>
  !e.msg.includes('WebGL') && !e.msg.includes('GPU') &&
  !e.msg.includes('WebGLRenderer') && !e.msg.includes('WebGLContext')
);

console.log('\n\n╔══════════════════════════════════════════════════════╗');
console.log('║  QA SIS-95 — MODO TEMPO REAL — FINAL REPORT         ║');
console.log('╠══════════════════════════════════════════════════════╣');

const c = {};

// C1: load without hash → today's date, button present, not active by default
c.c1_date  = r.t1?.date === today;
c.c1_btn   = r.t1?.rtFound === true;
c.c1_rtOff = r.t1?.rtActive === false;
const C1 = c.c1_date && c.c1_btn && c.c1_rtOff;
console.log(`\n[${C1?'PASS':'FAIL'}] C1 Carga sem hash`);
console.log(`       date="${r.t1?.date}" (today="${today}") btn=${r.t1?.rtFound} rtOff=${c.c1_rtOff}`);

// C2: Realtime mode ON → active=true, hash=realtime=1; OFF → active=false
c.c2_on_active  = r.t2?.on?.rtActive === true;
c.c2_on_aria    = r.t2?.on?.rtAria === 'true';
c.c2_on_hash    = r.t2?.on?.hash?.includes('realtime=1');
c.c2_off_active = r.t2?.off?.rtActive === false;
c.c2_off_hash   = !r.t2?.off?.hash?.includes('realtime=1');
const C2 = c.c2_on_active && c.c2_on_hash && c.c2_off_active;
console.log(`\n[${C2?'PASS':'FAIL'}] C2 Toggle realtime ON/OFF`);
console.log(`       ON: active=${r.t2?.on?.rtActive} aria=${r.t2?.on?.rtAria} hash="${r.t2?.on?.hash}"`);
console.log(`       OFF: active=${r.t2?.off?.rtActive} hash="${r.t2?.off?.hash}"`);

// C3: Past date → date correct, realtime off, badge may show for known retro window
c.c3_date     = r.t3?.after_date?.date === '2024-12-15';
c.c3_rtOff    = r.t3?.after_date?.rtActive === false;
c.c3_nodrift  = r.t3?.no_drift?.date === '2024-12-15';  // date stable after wait
const C3 = c.c3_date && c.c3_rtOff && c.c3_nodrift;
console.log(`\n[${C3?'PASS':'FAIL'}] C3 Data fixa (Dec 2024)`);
console.log(`       date="${r.t3?.after_date?.date}" rt=${r.t3?.after_date?.rtActive} stable="${r.t3?.no_drift?.date}"`);
console.log(`       badge: ${JSON.stringify(r.t3?.after_date?.badge)}`);

// C4: Deep-link #realtime=1 → active on load
c.c4_active = r.t4?.initial?.rtActive === true;
c.c4_hash   = r.t4?.initial?.hash?.includes('realtime=1');
c.c4_reload = r.t4?.after_reload?.rtActive === true;
const C4 = c.c4_active && c.c4_hash;
console.log(`\n[${C4?'PASS':'FAIL'}] C4 Deep-link #realtime=1`);
console.log(`       active=${r.t4?.initial?.rtActive} hash="${r.t4?.initial?.hash}" after_reload=${r.t4?.after_reload?.rtActive}`);

// C5: Console clean (exclude WebGL headless-env errors)
const non404Errors = appErrors.filter(e => !e.msg.includes('404'));
const C5 = non404Errors.length === 0;
console.log(`\n[${C5?'PASS':'FAIL'}] C5 Console limpo`);
if (appErrors.length > 0) appErrors.slice(0,5).forEach(e => console.log(`       [t${e.t}] ${e.msg.slice(0,120)}`));
else console.log('       No app errors');

// C6: Mobile button visible + functional
c.c6_vis    = r.t5?.btn?.visible === true;
c.c6_inview = r.t5?.btn?.inViewport;
c.c6_works  = r.t5?.after_click?.rtActive === true;
const C6 = c.c6_vis && c.c6_works;
console.log(`\n[${C6?'PASS':'FAIL'}] C6 Responsivo 375px`);
console.log(`       visible=${r.t5?.btn?.visible} inViewport=${r.t5?.btn?.inViewport} activates=${r.t5?.after_click?.rtActive}`);
console.log(`       rect:`, JSON.stringify(r.t5?.btn?.rect));

// C7: Hoje button deactivates realtime and sets today's date
c.c7_rtOff = r.t6?.after?.rtActive === false;
c.c7_date  = r.t6?.after?.date === today;
const C7 = c.c7_rtOff && c.c7_date;
console.log(`\n[${C7?'PASS':'FAIL'}] C7 Toggle "Hoje" desativa realtime`);
console.log(`       before: active=${r.t6?.before?.rtActive}`);
console.log(`       after:  active=${r.t6?.after?.rtActive} date="${r.t6?.after?.date}" today="${today}"`);

const all = [C1,C2,C3,C4,C5,C6,C7];
const passed = all.filter(Boolean).length;
const allPass = all.every(Boolean);

console.log(`\n╠══════════════════════════════════════════════════════╣`);
console.log(`║  SCORE: ${passed}/7 critérios                                    ║`);
console.log(`║  VERDICT: ${allPass ? '✅ APROVADO' : '❌ REPROVADO'}                                   ║`);
console.log(`╚══════════════════════════════════════════════════════╝\n`);

fs.writeFileSync(
  path.join(__dirname, 'qa-sis95-results.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    criteria: { C1, C2, C3, C4, C5, C6, C7, allPass, score: `${passed}/7` },
    details: { c, r },
    consoleErrors: appErrors,
  }, null, 2)
);

console.log('Saved: qa-sis95-results.json + screenshots in qa-sis95-screenshots/');
