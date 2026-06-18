/**
 * QA SIS-73: Validação do painel de qualidade/performance (SIS-62)
 *
 * Critérios:
 * 1. Painel abre/fecha ao clicar em "Qualidade"
 * 2. Botões de resolução (½×/¾×/1×) alteram pixel ratio sem reload
 * 3. Bloom on/off funciona
 * 4. Densidade de estrelas (Poucas/Médio/Todas)
 * 5. Mobile (<768px): preset automático de baixa qualidade
 * 6. Zero erros de console
 * 7. Responsivo
 */
import pkg from 'file:///D:/code/paperclip/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = pkg;
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = 'qa-sis73-results.json';
const results = [];
const consoleErrors = [];

function pass(name, note = '') {
  results.push({ test: name, status: 'PASS', note });
  console.log(`✅ PASS: ${name}${note ? ' — ' + note : ''}`);
}
function fail(name, note = '') {
  results.push({ test: name, status: 'FAIL', note });
  console.log(`❌ FAIL: ${name}${note ? ' — ' + note : ''}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: `qa-sis73-${name}.png`, fullPage: false });
  console.log(`  📸 ${name}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// DESKTOP TESTS
// ──────────────────────────────────────────────────────────────────────────────
async function runDesktop(browser) {
  console.log('\n=== DESKTOP (1366×768) ===');
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[desktop] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(`[desktop-pageerror] ${err.message}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // let Three.js render

  await screenshot(page, '01-initial');

  // T1: Painel abre ao clicar em Qualidade
  const btnQuality = page.locator('#btn-quality');
  await btnQuality.waitFor({ state: 'visible' });
  const panelBefore = await page.locator('#quality-panel').getAttribute('class');
  await btnQuality.click();
  await page.waitForTimeout(200);
  const panelAfter = await page.locator('#quality-panel').getAttribute('class');
  if (panelBefore?.includes('hidden') && !panelAfter?.includes('hidden')) {
    pass('T1: Painel abre ao clicar em Qualidade');
  } else {
    fail('T1: Painel abre ao clicar em Qualidade', `before="${panelBefore}" after="${panelAfter}"`);
  }
  await screenshot(page, '02-panel-open');

  // T2: Painel fecha ao clicar novamente
  await btnQuality.click();
  await page.waitForTimeout(200);
  const panelClosed = await page.locator('#quality-panel').getAttribute('class');
  if (panelClosed?.includes('hidden')) {
    pass('T2: Painel fecha ao clicar novamente');
  } else {
    fail('T2: Painel fecha ao clicar novamente', `class="${panelClosed}"`);
  }
  await screenshot(page, '03-panel-closed');

  // T3: Painel fecha ao clicar fora
  await btnQuality.click();
  await page.waitForTimeout(200);
  await page.mouse.click(700, 400); // click outside panel
  await page.waitForTimeout(200);
  const panelOutside = await page.locator('#quality-panel').getAttribute('class');
  if (panelOutside?.includes('hidden')) {
    pass('T3: Painel fecha ao clicar fora');
  } else {
    fail('T3: Painel fecha ao clicar fora', `class="${panelOutside}"`);
  }

  // Abrir painel para os próximos testes
  await btnQuality.click();
  await page.waitForTimeout(200);

  // T4: Resolução ½× ativa o botão correto
  const halfBtn = page.locator('#quality-resolution [data-val="0.5"]');
  await halfBtn.click();
  await page.waitForTimeout(300);
  const halfActive = await halfBtn.getAttribute('class');
  if (halfActive?.includes('active')) {
    pass('T4: Botão ½× fica ativo após clique');
  } else {
    fail('T4: Botão ½× fica ativo após clique', `class="${halfActive}"`);
  }
  await screenshot(page, '04-resolution-half');

  // T5: Resolução ¾×
  const threeQBtn = page.locator('#quality-resolution [data-val="0.75"]');
  await threeQBtn.click();
  await page.waitForTimeout(300);
  const threeQActive = await threeQBtn.getAttribute('class');
  if (threeQActive?.includes('active')) {
    pass('T5: Botão ¾× fica ativo após clique');
  } else {
    fail('T5: Botão ¾× fica ativo após clique', `class="${threeQActive}"`);
  }

  // T6: Resolução 1×
  const fullBtn = page.locator('#quality-resolution [data-val="1"]');
  await fullBtn.click();
  await page.waitForTimeout(300);
  const fullActive = await fullBtn.getAttribute('class');
  if (fullActive?.includes('active')) {
    pass('T6: Botão 1× fica ativo após clique');
  } else {
    fail('T6: Botão 1× fica ativo após clique', `class="${fullActive}"`);
  }
  await screenshot(page, '05-resolution-full');

  // T7: Bloom toggle — estado inicial no desktop deve ser "Ligado"
  const bloomBtn = page.locator('#quality-bloom');
  const bloomInitial = await bloomBtn.textContent();
  const bloomInitialAriaPressed = await bloomBtn.getAttribute('aria-pressed');
  if (bloomInitial?.trim() === 'Ligado' && bloomInitialAriaPressed === 'true') {
    pass('T7: Bloom inicializa como Ligado no desktop');
  } else {
    fail('T7: Bloom inicializa como Ligado no desktop', `text="${bloomInitial?.trim()}" aria-pressed="${bloomInitialAriaPressed}"`);
  }

  // T8: Bloom toggle desliga
  await bloomBtn.click();
  await page.waitForTimeout(300);
  const bloomOff = await bloomBtn.textContent();
  const bloomOffAriaPressed = await bloomBtn.getAttribute('aria-pressed');
  if (bloomOff?.trim() === 'Desligado' && bloomOffAriaPressed === 'false') {
    pass('T8: Bloom toggle → Desligado');
  } else {
    fail('T8: Bloom toggle → Desligado', `text="${bloomOff?.trim()}" aria-pressed="${bloomOffAriaPressed}"`);
  }
  await screenshot(page, '06-bloom-off');

  // T9: Bloom toggle liga novamente
  await bloomBtn.click();
  await page.waitForTimeout(300);
  const bloomOn = await bloomBtn.textContent();
  if (bloomOn?.trim() === 'Ligado') {
    pass('T9: Bloom toggle → Ligado novamente');
  } else {
    fail('T9: Bloom toggle → Ligado novamente', `text="${bloomOn?.trim()}"`);
  }
  await screenshot(page, '07-bloom-on');

  // T10: Estrelas → Poucas
  const starLow = page.locator('#quality-stars [data-val="low"]');
  await starLow.click();
  await page.waitForTimeout(300);
  const starLowActive = await starLow.getAttribute('class');
  if (starLowActive?.includes('active')) {
    pass('T10: Estrelas → Poucas ativa o botão');
  } else {
    fail('T10: Estrelas → Poucas ativa o botão', `class="${starLowActive}"`);
  }
  await screenshot(page, '08-stars-low');

  // T11: Estrelas → Médio
  const starMid = page.locator('#quality-stars [data-val="medium"]');
  await starMid.click();
  await page.waitForTimeout(300);
  const starMidActive = await starMid.getAttribute('class');
  if (starMidActive?.includes('active')) {
    pass('T11: Estrelas → Médio ativa o botão');
  } else {
    fail('T11: Estrelas → Médio ativa o botão', `class="${starMidActive}"`);
  }
  await screenshot(page, '09-stars-medium');

  // T12: Estrelas → Todas
  const starHigh = page.locator('#quality-stars [data-val="high"]');
  await starHigh.click();
  await page.waitForTimeout(300);
  const starHighActive = await starHigh.getAttribute('class');
  if (starHighActive?.includes('active')) {
    pass('T12: Estrelas → Todas ativa o botão');
  } else {
    fail('T12: Estrelas → Todas ativa o botão', `class="${starHighActive}"`);
  }
  await screenshot(page, '10-stars-high');

  // T13: Sem erros JS no desktop
  if (consoleErrors.filter(e => e.startsWith('[desktop]')).length === 0) {
    pass('T13: Zero erros de console no desktop');
  } else {
    fail('T13: Zero erros de console no desktop', consoleErrors.filter(e => e.startsWith('[desktop]')).join('; '));
  }

  await context.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// MOBILE TESTS
// ──────────────────────────────────────────────────────────────────────────────
async function runMobile(browser) {
  console.log('\n=== MOBILE (390×844, touch) ===');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[mobile] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(`[mobile-pageerror] ${err.message}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await screenshot(page, '11-mobile-initial');

  // T14: Mobile preset — pixel ratio ≤ 0.75, bloom off, stars low
  const mobilePreset = await page.evaluate(() => {
    // Read computed state from global variables exposed in window
    // We check the active buttons in quality panel to infer preset
    const resBtn = [...document.querySelectorAll('#quality-resolution [data-val]')]
      .find(b => b.classList.contains('active'));
    const bloomText = document.getElementById('quality-bloom')?.textContent?.trim();
    const starsBtn = [...document.querySelectorAll('#quality-stars [data-val]')]
      .find(b => b.classList.contains('active'));
    return {
      resolution: resBtn?.dataset?.val,
      bloom: bloomText,
      stars: starsBtn?.dataset?.val,
    };
  });
  console.log('  Mobile preset detected:', mobilePreset);

  if (parseFloat(mobilePreset.resolution || '1') <= 0.75) {
    pass('T14: Mobile preset — resolução baixa (≤ 0.75)');
  } else {
    fail('T14: Mobile preset — resolução baixa (≤ 0.75)', `resolution=${mobilePreset.resolution}`);
  }

  if (mobilePreset.bloom === 'Desligado') {
    pass('T15: Mobile preset — Bloom desligado');
  } else {
    fail('T15: Mobile preset — Bloom desligado', `bloom="${mobilePreset.bloom}"`);
  }

  if (mobilePreset.stars === 'low') {
    pass('T16: Mobile preset — Estrelas em Poucas');
  } else {
    fail('T16: Mobile preset — Estrelas em Poucas', `stars=${mobilePreset.stars}`);
  }

  // T17: Painel funciona no mobile
  const btnQuality = page.locator('#btn-quality');
  await btnQuality.tap();
  await page.waitForTimeout(300);
  const panelClass = await page.locator('#quality-panel').getAttribute('class');
  if (!panelClass?.includes('hidden')) {
    pass('T17: Painel abre no mobile');
  } else {
    fail('T17: Painel abre no mobile', `class="${panelClass}"`);
  }
  await screenshot(page, '12-mobile-panel-open');

  // T18: Sem erros JS no mobile
  if (consoleErrors.filter(e => e.startsWith('[mobile]')).length === 0) {
    pass('T18: Zero erros de console no mobile');
  } else {
    fail('T18: Zero erros de console no mobile', consoleErrors.filter(e => e.startsWith('[mobile]')).join('; '));
  }

  await context.close();
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });

try {
  await runDesktop(browser);
  await runMobile(browser);
} finally {
  await browser.close();
}

const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;

console.log(`\n=== RESULTADO FINAL ===`);
console.log(`✅ ${passed} passaram | ❌ ${failed} falharam`);

if (consoleErrors.length > 0) {
  console.log('\nErros de console detectados:');
  consoleErrors.forEach(e => console.log(' -', e));
}

writeFileSync(OUT, JSON.stringify({ results, consoleErrors, summary: { passed, failed } }, null, 2));
console.log(`\nResultados salvos em ${OUT}`);

process.exit(failed > 0 ? 1 : 0);
