/**
 * SIS-59 Re-QA — verificar BUG-01 fix (commit b3f4752) + regressão geral
 */
import { chromium } from 'file:///D:/code/paperclip/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5180';
const results = [];

function pass(id, note) { results.push({ id, status: 'PASS', note }); console.log(`✅ PASS [${id}]: ${note}`); }
function fail(id, note) { results.push({ id, status: 'FAIL', note }); console.log(`❌ FAIL [${id}]: ${note}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });

  // ── BUG-01 FIX: planet= deep-link ────────────────────────────────────────
  const p1 = await browser.newPage();
  const p1Errors = [];
  p1.on('console', msg => { if (msg.type() === 'error') p1Errors.push(msg.text()); });
  p1.on('pageerror', err => p1Errors.push(err.message));
  await p1.setViewportSize({ width: 1366, height: 768 });
  await p1.goto(`${BASE}/#planet=earth&orbits=1&labels=1&speed=1`, { waitUntil: 'networkidle', timeout: 30000 });
  await p1.waitForTimeout(4000);
  await p1.screenshot({ path: 'qa-sis59-reqa-01-planet-deeplink.png' });
  const url1 = p1.url();
  const dcHiddenOnPlanet = await p1.$eval('#date-controls', el => el.classList.contains('hidden'));
  const hashHasPlanet = url1.includes('planet=');
  console.log(`   URL: ${url1}`);
  if (dcHiddenOnPlanet && hashHasPlanet) {
    pass('BUG01-planet-deeplink-FIXED', `planet= deep-link RESTAURADO — dateControls oculto, URL mantém planet=. Hash: ${url1.split('#')[1]}`);
  } else {
    fail('BUG01-planet-deeplink-FIXED', `planet= deep-link ainda quebrado. dcHidden=${dcHiddenOnPlanet} hashHasPlanet=${hashHasPlanet}. URL: ${url1}`);
  }
  if (p1Errors.length === 0) pass('BUG01-console-clean', 'Zero erros de console no deep-link planet=');
  else fail('BUG01-console-clean', `${p1Errors.length} erro(s): ${p1Errors.slice(0, 2).join(' | ')}`);
  await p1.close();

  // ── BUG-01b FIX: date= deep-link ────────────────────────────────────────
  const p2 = await browser.newPage();
  await p2.setViewportSize({ width: 1366, height: 768 });
  await p2.goto(`${BASE}/#orbits=1&labels=1&speed=1&date=2024-12-15`, { waitUntil: 'networkidle', timeout: 30000 });
  await p2.waitForTimeout(4000);
  await p2.screenshot({ path: 'qa-sis59-reqa-02-date-deeplink.png' });
  const datePickerVal = await p2.$eval('#date-picker', el => el.value);
  const badgeVisible = await p2.$eval('#retrograde-badge', el => !el.classList.contains('hidden'));
  console.log(`   date-picker value after load: ${datePickerVal}, retrograde badge: ${badgeVisible}`);
  if (datePickerVal === '2024-12-15') {
    pass('BUG01b-date-deeplink-FIXED', `date= deep-link RESTAURADO — picker mostra 2024-12-15`);
  } else {
    fail('BUG01b-date-deeplink-FIXED', `date= deep-link ainda quebrado — picker tem ${datePickerVal} ao invés de 2024-12-15`);
  }
  if (badgeVisible) pass('BUG01b-retrograde-restored', 'Badge retrógrado visível em 2024-12-15 após deep-link');
  else fail('BUG01b-retrograde-restored', 'Badge retrógrado deveria estar visível em 2024-12-15');
  await p2.close();

  // ── REGRESSÃO: funcionalidades core ainda funcionam ────────────────────
  const p3 = await browser.newPage();
  const p3Errors = [];
  p3.on('console', msg => { if (msg.type() === 'error') p3Errors.push(msg.text()); });
  p3.on('pageerror', err => p3Errors.push(err.message));
  await p3.setViewportSize({ width: 1366, height: 768 });
  await p3.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await p3.waitForTimeout(3000);

  // Painel data visível na carga normal
  const dcVisible = await p3.$eval('#date-controls', el => !el.classList.contains('hidden'));
  if (dcVisible) pass('REG-date-panel-normal-load', 'Painel de data visível na carga normal (sem hash)');
  else fail('REG-date-panel-normal-load', 'Painel de data oculto na carga normal — REGRESSÃO');

  // datePicker inicia com hoje
  const todayStr = new Date().toISOString().slice(0, 10);
  const pickerVal = await p3.$eval('#date-picker', el => el.value);
  if (pickerVal === todayStr) pass('REG-default-date', `datePicker inicia com hoje: ${todayStr}`);
  else fail('REG-default-date', `datePicker tem ${pickerVal} ao invés de ${todayStr}`);

  // Mudar data via evento change ainda atualiza hash
  await p3.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2025-06-01';
    dp.dispatchEvent(new Event('change'));
  });
  await p3.waitForTimeout(500);
  const urlAfterChange = p3.url();
  if (urlAfterChange.includes('date=2025-06-01')) pass('REG-date-change-updates-hash', 'Mudar data via change ainda atualiza hash');
  else fail('REG-date-change-updates-hash', `Hash não atualizou: ${urlAfterChange}`);

  // Badge retrógrado ainda funciona
  await p3.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-12-15';
    dp.dispatchEvent(new Event('change'));
  });
  await p3.waitForTimeout(400);
  const badgeStillWorks = await p3.$eval('#retrograde-badge', el => !el.classList.contains('hidden'));
  if (badgeStillWorks) pass('REG-retrograde-badge', 'Badge retrógrado ainda funciona em 2024-12-15');
  else fail('REG-retrograde-badge', 'Badge retrógrado NÃO funcionando — REGRESSÃO');

  // Botão Agora ainda funciona
  await p3.click('#btn-hoje');
  await p3.waitForTimeout(400);
  const pickerAfterHoje = await p3.$eval('#date-picker', el => el.value);
  if (pickerAfterHoje === todayStr) pass('REG-btn-hoje', 'Botão Agora ainda retorna para hoje');
  else fail('REG-btn-hoje', `Botão Agora definiu ${pickerAfterHoje} ao invés de ${todayStr} — REGRESSÃO`);

  if (p3Errors.length === 0) pass('REG-console-errors', 'Zero erros de console na sessão de regressão');
  else fail('REG-console-errors', `${p3Errors.length} erro(s): ${p3Errors.slice(0, 3).join(' | ')}`);

  await p3.screenshot({ path: 'qa-sis59-reqa-03-regression.png' });
  await p3.close();

  await browser.close();

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n── SUMÁRIO RE-QA: ${passed}/${total} PASS, ${failed} FAIL ──`);
  writeFileSync('qa-sis59-reqa-results.json', JSON.stringify({ passed, failed, total, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Re-QA script error:', err);
  process.exit(2);
});
