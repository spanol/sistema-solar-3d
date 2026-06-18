import { chromium } from 'file:///D:/code/paperclip/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5176';
const results = [];

function pass(id, note) { results.push({ id, status: 'PASS', note }); console.log(`✅ PASS [${id}]: ${note}`); }
function fail(id, note) { results.push({ id, status: 'FAIL', note }); console.log(`❌ FAIL [${id}]: ${note}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  // ── T1: Desktop viewport ─────────────────────────────────────────────────
  const page = await browser.newPage();
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000); // allow Three.js to render

  await page.screenshot({ path: 'qa-sis59-01-initial.png', fullPage: false });

  // T1 — vista superior carrega
  const canvas = await page.$('canvas');
  if (canvas) pass('T1-top-view', 'Canvas Three.js presente ao abrir');
  else fail('T1-top-view', 'Canvas não encontrado');

  // T2 — painel de data visível
  const datePicker = await page.$('#date-picker');
  const btnHoje = await page.$('#btn-hoje');
  const dateControls = await page.$('#date-controls');
  if (datePicker && btnHoje && dateControls) {
    const dcVisible = await dateControls.isVisible();
    if (dcVisible) pass('T2-date-panel', 'Painel de data visível: input#date-picker + botão Agora');
    else fail('T2-date-panel', 'Painel de data existe mas não está visível');
  } else {
    fail('T2-date-panel', `Elementos faltando: datePicker=${!!datePicker} btnHoje=${!!btnHoje} dateControls=${!!dateControls}`);
  }

  // T3 — deep-link: mudar data e verificar hash
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-06-15';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  const url1 = page.url();
  if (url1.includes('date=2024-06-15')) pass('T3-deeplink', `URL contém date no hash: ${url1.split('#')[1]}`);
  else fail('T3-deeplink', `Hash não contém date=: URL = ${url1}`);

  // T4 — sem badge retrógrado em 2024-06-15 (Marte não estava retrógrado)
  await page.waitForTimeout(300);
  const badge1Hidden = await page.$eval('#retrograde-badge', el => el.classList.contains('hidden'));
  if (badge1Hidden) pass('T4a-no-retrograde-jun2024', 'Badge retrógrado oculto em 2024-06-15 (correto)');
  else fail('T4a-no-retrograde-jun2024', 'Badge retrógrado visível em 2024-06-15 — falso positivo');

  // T5 — badge retrógrado em 2024-11-01 (Marte retrógrado out-nov 2024)
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-11-01';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa-sis59-02-retrograde-nov2024.png' });
  const badge2Visible = await page.$eval('#retrograde-badge', el => !el.classList.contains('hidden'));
  if (badge2Visible) pass('T5-retrograde-nov2024', 'Badge ♂ Retrógrado visível em 2024-11-01');
  else fail('T5-retrograde-nov2024', 'Badge retrógrado NÃO visível em 2024-11-01 — deveria estar retrógrado');

  // T5b — badge desaparece em 2024-12-15 (Marte direto novamente)
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-12-15';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  const badge3Hidden = await page.$eval('#retrograde-badge', el => el.classList.contains('hidden'));
  if (badge3Hidden) pass('T5b-retrograde-ends', 'Badge some após Marte voltar ao direto (2024-12-15)');
  else fail('T5b-retrograde-ends', 'Badge ainda visível em 2024-12-15 — pode estar preso');

  // T6 — botão Agora volta para hoje
  await page.click('#btn-hoje');
  await page.waitForTimeout(500);
  const pickerValAfterHoje = await page.$eval('#date-picker', el => el.value);
  const todayStr = new Date().toISOString().slice(0, 10);
  if (pickerValAfterHoje === todayStr) pass('T6-hoje-btn', `Botão Agora definiu data para hoje: ${todayStr}`);
  else fail('T6-hoje-btn', `Botão Agora definiu ${pickerValAfterHoje} mas hoje é ${todayStr}`);

  // T7 — painel some ao selecionar planeta (clicar na Terra via JS)
  await page.evaluate(() => {
    // Trigger selectPlanet via click on a planet — use keyboard shortcut approach
    // Or find the first planet mesh and click it
    // We'll use the hash deep-link instead to trigger planet view
    location.hash = 'planet=earth&view=front&orbit=0&labels=1&speed=1';
  });
  await page.waitForTimeout(2000);
  const dateControlsHidden = await page.$eval('#date-controls', el => el.classList.contains('hidden'));
  await page.screenshot({ path: 'qa-sis59-03-planet-view.png' });
  if (dateControlsHidden) pass('T7-panel-hides-on-planet', 'Painel de data oculto na vista frontal do planeta');
  else fail('T7-panel-hides-on-planet', 'Painel de data ainda visível na vista frontal');

  // T8 — painel volta ao retornar ao topo
  await page.evaluate(() => { location.hash = ''; });
  await page.waitForTimeout(1500);
  // Click Voltar if present, or navigate back to top
  const backBtn = await page.$('#card-close');
  if (backBtn && await backBtn.isVisible()) {
    await backBtn.click();
    await page.waitForTimeout(1500);
  }
  const dateControlsVisible2 = await page.$eval('#date-controls', el => !el.classList.contains('hidden'));
  await page.screenshot({ path: 'qa-sis59-04-back-to-top.png' });
  if (dateControlsVisible2) pass('T8-panel-returns', 'Painel de data reaparece ao voltar ao topo');
  else fail('T8-panel-returns', 'Painel de data não retornou após voltar ao topo');

  // T9 — zero console errors
  if (consoleErrors.length === 0) pass('T9-console-errors', 'Zero erros no console');
  else fail('T9-console-errors', `${consoleErrors.length} erro(s) no console: ${consoleErrors.slice(0, 3).join(' | ')}`);

  // T10 — responsive mobile
  const mobilePage = await browser.newPage();
  const mobileErrors = [];
  mobilePage.on('console', msg => { if (msg.type() === 'error') mobileErrors.push(msg.text()); });
  await mobilePage.setViewportSize({ width: 375, height: 667 });
  await mobilePage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(3000);
  await mobilePage.screenshot({ path: 'qa-sis59-05-mobile.png' });
  const mobileCanvas = await mobilePage.$('canvas');
  const mobileDatePanel = await mobilePage.$('#date-controls');
  const mobileDateVisible = mobileDatePanel ? await mobileDatePanel.isVisible() : false;
  if (mobileCanvas && mobileDateVisible) pass('T10-mobile', 'Canvas e painel de data visíveis em 375×667');
  else fail('T10-mobile', `Canvas=${!!mobileCanvas} datePanelVisible=${mobileDateVisible}`);
  if (mobileErrors.length === 0) pass('T10b-mobile-console', 'Zero erros de console no mobile');
  else fail('T10b-mobile-console', `${mobileErrors.length} erro(s) no mobile: ${mobileErrors.slice(0, 2).join(' | ')}`);
  await mobilePage.close();

  await browser.close();

  // Summary
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n── SUMÁRIO: ${passed}/${total} PASS, ${failed} FAIL ──`);
  writeFileSync('qa-sis59-results.json', JSON.stringify({ passed, failed, total, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('QA script error:', err);
  process.exit(2);
});
