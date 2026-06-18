/**
 * QA SIS-59 Pass 2 — retrograde dates corrected + T7/T8/T9 verification
 * Mars retrograde 2024: Dec 6, 2024 – Feb 23, 2025
 */
import { chromium } from 'file:///D:/code/paperclip/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5176';
const results = [];

function pass(id, note) { results.push({ id, status: 'PASS', note }); console.log(`✅ PASS [${id}]: ${note}`); }
function fail(id, note) { results.push({ id, status: 'FAIL', note }); console.log(`❌ FAIL [${id}]: ${note}`); }
function info(msg)       { console.log(`   ℹ️  ${msg}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  // ── Pass 2: Retrograde dates corrected ───────────────────────────────────
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log(`   🔴 console.error: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.log(`   🔴 pageerror: ${err.message}`);
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // T5-corrected: Nov 1, 2024 — Mars NOT retrograde → badge should be hidden
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-11-01';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  const badgeNov = await page.$eval('#retrograde-badge', el => el.classList.contains('hidden'));
  if (badgeNov) pass('T5a-not-retrograde-nov2024', 'Badge oculto em 2024-11-01 — Marte não era retrógrado (correto)');
  else fail('T5a-not-retrograde-nov2024', 'Badge visível em 2024-11-01 — falso positivo de retrógrado');

  // T5-corrected: Dec 15, 2024 — Mars IS retrograde → badge should be visible
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2024-12-15';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'qa-sis59b-retrograde-dec2024.png' });
  const badgeDec = await page.$eval('#retrograde-badge', el => !el.classList.contains('hidden'));
  if (badgeDec) pass('T5b-retrograde-dec2024', 'Badge ♂ Retrógrado visível em 2024-12-15 — Marte retrógrado (correto)');
  else fail('T5b-retrograde-dec2024', 'Badge oculto em 2024-12-15 — deveria estar retrógrado');

  // T5c: Jan 15, 2025 — still retrograde
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2025-01-15';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  const badgeJan = await page.$eval('#retrograde-badge', el => !el.classList.contains('hidden'));
  if (badgeJan) pass('T5c-retrograde-jan2025', 'Badge visível em 2025-01-15 — Marte ainda retrógrado (correto)');
  else fail('T5c-retrograde-jan2025', 'Badge oculto em 2025-01-15 — deveria estar retrógrado');

  // T5d: Mar 1, 2025 — Mars direct again
  await page.evaluate(() => {
    const dp = document.getElementById('date-picker');
    dp.value = '2025-03-01';
    dp.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  const badgeMar = await page.$eval('#retrograde-badge', el => el.classList.contains('hidden'));
  if (badgeMar) pass('T5d-direct-mar2025', 'Badge oculto em 2025-03-01 — Marte direto novamente (correto)');
  else fail('T5d-direct-mar2025', 'Badge visível em 2025-03-01 — Marte deveria ser direto');

  // T7: painel some ao selecionar planeta via hash no carregamento
  const pageWithPlanet = await browser.newPage();
  const errsPlanet = [];
  pageWithPlanet.on('console', msg => { if (msg.type() === 'error') errsPlanet.push(msg.text()); });
  await pageWithPlanet.setViewportSize({ width: 1366, height: 768 });
  await pageWithPlanet.goto(`${BASE}/#planet=earth&orbits=1&labels=1&speed=1`, { waitUntil: 'networkidle', timeout: 30000 });
  await pageWithPlanet.waitForTimeout(3000);
  await pageWithPlanet.screenshot({ path: 'qa-sis59b-planet-selected.png' });
  const dateHiddenOnPlanet = await pageWithPlanet.$eval('#date-controls', el => el.classList.contains('hidden'));
  if (dateHiddenOnPlanet) pass('T7-panel-hides-on-planet', 'Painel de data oculto na vista frontal do planeta (via deep-link)');
  else fail('T7-panel-hides-on-planet', 'Painel de data ainda visível na vista frontal do planeta');

  // T8: painel reaparece ao voltar ao topo (click Voltar button)
  try {
    const cardClose = await pageWithPlanet.$('#card-close');
    if (cardClose && await cardClose.isVisible()) {
      await cardClose.click();
      await pageWithPlanet.waitForTimeout(1500);
      await pageWithPlanet.screenshot({ path: 'qa-sis59b-back-to-top.png' });
      const dateVisible = await pageWithPlanet.$eval('#date-controls', el => !el.classList.contains('hidden'));
      if (dateVisible) pass('T8-panel-returns', 'Painel de data reaparece após clicar Voltar');
      else fail('T8-panel-returns', 'Painel de data não reapareceu após voltar ao topo');
    } else {
      // Try evaluating backToTop via JavaScript
      await pageWithPlanet.evaluate(() => {
        // Look for the backToTop button or trigger escape
        const btn = document.querySelector('#card-close');
        if (btn) btn.click();
      });
      await pageWithPlanet.waitForTimeout(1500);
      await pageWithPlanet.screenshot({ path: 'qa-sis59b-back-to-top.png' });
      const dateVisible = await pageWithPlanet.$eval('#date-controls', el => !el.classList.contains('hidden'));
      if (dateVisible) pass('T8-panel-returns', 'Painel de data reaparece após voltar ao topo');
      else fail('T8-panel-returns', 'Painel de data não retornou — botão Voltar pode estar oculto ou non-functional');
    }
  } catch (e) {
    fail('T8-panel-returns', `Erro ao tentar voltar: ${e.message.slice(0, 100)}`);
  }
  await pageWithPlanet.close();

  // T9: console errors check (from full session)
  if (consoleErrors.length === 0) pass('T9-console-errors', 'Zero erros no console na sessão de testes');
  else fail('T9-console-errors', `${consoleErrors.length} erro(s): ${consoleErrors.slice(0, 3).join(' | ')}`);

  // T10: mobile - screenshot + check elements
  const mobilePage = await browser.newPage();
  const mobileErrors = [];
  mobilePage.on('console', msg => { if (msg.type() === 'error') mobileErrors.push(msg.text()); });
  mobilePage.on('pageerror', err => mobileErrors.push(err.message));
  await mobilePage.setViewportSize({ width: 375, height: 667 });
  await mobilePage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(3000);
  await mobilePage.screenshot({ path: 'qa-sis59b-mobile.png' });
  const mobileCanvas = await mobilePage.$('canvas');
  const mobileDateVisible = await mobilePage.$eval('#date-controls', el => !el.classList.contains('hidden')).catch(() => false);
  if (mobileCanvas && mobileDateVisible) pass('T10-mobile-responsive', 'Canvas + painel de data visíveis em 375×667');
  else fail('T10-mobile-responsive', `Canvas=${!!mobileCanvas} datePanelVisible=${mobileDateVisible}`);
  if (mobileErrors.length === 0) pass('T10b-mobile-console', 'Zero erros de console no mobile');
  else fail('T10b-mobile-console', `${mobileErrors.length} erro(s) mobile: ${mobileErrors.slice(0, 2).join(' | ')}`);

  // Final screenshot desktop
  await page.screenshot({ path: 'qa-sis59b-final-desktop.png' });
  await mobilePage.close();
  await page.close();
  await browser.close();

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n── SUMÁRIO: ${passed}/${total} PASS, ${failed} FAIL ──`);
  writeFileSync('qa-sis59b-results.json', JSON.stringify({ passed, failed, total, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('QA script error:', err);
  process.exit(2);
});
