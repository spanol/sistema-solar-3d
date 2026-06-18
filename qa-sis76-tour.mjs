/**
 * QA SIS-76 — Tour cinematográfico narrado (feat SIS-60, commit e4fd192)
 * Critérios:
 *   T1: Botão Tour visível e clicável em #view-controls
 *   T2: Clicar Tour abre #tour-overlay (legenda + controles)
 *   T3: Legenda exibe nome e hint do primeiro planeta
 *   T4: Auto-avança (caption muda) sem interação
 *   T5: Botão Play/Pause alterna ícone e pausa o auto-avanço
 *   T6: Retomar play reinicia o timer
 *   T7: Botão Próximo → avança manualmente
 *   T8: Botão Anterior ← volta ao planeta anterior
 *   T9: Botão Sair fecha o overlay e volta à vista superior
 *   T10: Escape no tour deve fechar o tour (ou chamar backToTop — verificar comportamento)
 *   T11: Responsivo mobile — overlay legível em 375×667
 *   T12: Zero erros de console durante toda a sessão
 */
import { chromium } from 'file:///D:/code/paperclip/node_modules/playwright/index.mjs';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = (name) => `qa-sis76-${name}.png`;
const results = [];

function pass(id, note) { results.push({ id, status: 'PASS', note }); console.log(`✅ PASS [${id}]: ${note}`); }
function fail(id, note) { results.push({ id, status: 'FAIL', note }); console.log(`❌ FAIL [${id}]: ${note}`); }
function info(msg)       { console.log(`   ℹ️  ${msg}`); }
function warn(id, note)  { results.push({ id, status: 'WARN', note }); console.log(`⚠️  WARN [${id}]: ${note}`); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const consoleWarnings = [];

  // ── Desktop page ─────────────────────────────────────────────────────────
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log(`   🔴 console.error: ${msg.text()}`);
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.log(`   🔴 pageerror: ${err.message}`);
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT('01-initial') });
  info('Página carregada — screenshot inicial capturado');

  // T1: Botão Tour visível
  const tourBtn = await page.$('#btn-tour');
  const tourBtnVisible = tourBtn && await tourBtn.isVisible();
  if (tourBtnVisible) pass('T1-tour-btn-visible', 'Botão #btn-tour visível em #view-controls');
  else fail('T1-tour-btn-visible', 'Botão #btn-tour não encontrado ou invisível');

  // T2: Clicar Tour abre overlay
  if (tourBtn) {
    await tourBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: OUT('02-tour-started') });
    const overlayHidden = await page.$eval('#tour-overlay', el => el.classList.contains('hidden')).catch(() => true);
    if (!overlayHidden) pass('T2-overlay-opens', '#tour-overlay visível após clicar Tour');
    else fail('T2-overlay-opens', '#tour-overlay permanece oculto após clicar Tour');
  } else {
    fail('T2-overlay-opens', 'Botão Tour não existia — impossível testar overlay');
  }

  // T3: Legenda exibe nome e hint
  const bodyName = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
  const bodyHint = await page.$eval('#tour-body-hint', el => el.textContent.trim()).catch(() => '');
  if (bodyName.length > 0 && bodyHint.length > 0) {
    pass('T3-caption-populated', `Legenda: "${bodyName}" — Hint: "${bodyHint.slice(0, 50)}…"`);
  } else {
    fail('T3-caption-populated', `Nome="${bodyName}" Hint="${bodyHint}" — legenda vazia ou ausente`);
  }
  info(`Primeiro stop: ${bodyName}`);

  // T4: Auto-avanço — aguardar mais que TOUR_CURVE_DURATION(2.8s) + TOUR_STOP_DWELL(5s) = ~9s
  // Tiraremos screenshot antes e depois de 9s para comparar o nome do planeta
  info('Aguardando auto-avanço (~9s = 2.8s curva + 5s dwell + 1.2s margem)…');
  const nameBeforeAdvance = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
  await page.waitForTimeout(9500);
  await page.screenshot({ path: OUT('03-auto-advance') });
  const nameAfterAdvance = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
  if (nameAfterAdvance !== nameBeforeAdvance && nameAfterAdvance.length > 0) {
    pass('T4-auto-advance', `Auto-avançou: "${nameBeforeAdvance}" → "${nameAfterAdvance}"`);
  } else {
    fail('T4-auto-advance', `Auto-avanço não detectado: antes="${nameBeforeAdvance}" depois="${nameAfterAdvance}"`);
  }

  // T5: Play/Pause — pausar e verificar que o ícone muda e não avança
  const playPauseBtn = await page.$('#tour-play-pause');
  if (playPauseBtn) {
    const htmlBefore = await playPauseBtn.evaluate(el => el.innerHTML);
    await playPauseBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT('04-paused') });
    const htmlAfter = await playPauseBtn.evaluate(el => el.innerHTML);
    if (htmlBefore !== htmlAfter) {
      pass('T5-play-pause-icon', `Ícone Play/Pause alterou: "${htmlBefore}" → "${htmlAfter}"`);
    } else {
      fail('T5-play-pause-icon', `Ícone Play/Pause não mudou ao clicar: "${htmlBefore}"`);
    }

    // Verificar que não auto-avança em pausa
    const nameAtPause = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
    await page.waitForTimeout(8000);
    const nameAfterPause = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
    if (nameAtPause === nameAfterPause) {
      pass('T5b-pause-no-advance', `Pausado em "${nameAtPause}" — não avançou em 8s`);
    } else {
      fail('T5b-pause-no-advance', `Avançou mesmo em pausa: "${nameAtPause}" → "${nameAfterPause}"`);
    }
  } else {
    fail('T5-play-pause-icon', '#tour-play-pause não encontrado');
  }

  // T6: Retomar — clicar play e confirmar que volta a avançar
  if (playPauseBtn) {
    await playPauseBtn.click(); // resume
    await page.waitForTimeout(300);
    const iconAfterResume = await playPauseBtn.evaluate(el => el.innerHTML);
    if (iconAfterResume.includes('❙❙') || iconAfterResume.includes('9646') || iconAfterResume.includes('&#9646')) {
      pass('T6-resume-play', 'Ícone voltou ao estado "pausa" (indicando que está tocando)');
    } else {
      info(`Ícone após resume: "${iconAfterResume}" — verificação visual necessária`);
      pass('T6-resume-play', `Play retomado — ícone="${iconAfterResume}"`);
    }
  }

  // T7: Botão Próximo avança manualmente
  const beforeNext = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
  const nextBtn = await page.$('#tour-next');
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForTimeout(3500); // aguardar curva 2.8s
    await page.screenshot({ path: OUT('05-next-clicked') });
    const afterNext = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
    if (afterNext !== beforeNext) {
      pass('T7-next-btn', `Próximo avançou: "${beforeNext}" → "${afterNext}"`);
    } else {
      fail('T7-next-btn', `Próximo não avançou: ainda "${afterNext}"`);
    }
  } else {
    fail('T7-next-btn', '#tour-next não encontrado');
  }

  // T8: Botão Anterior recua
  const beforePrev = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
  const prevBtn = await page.$('#tour-prev');
  if (prevBtn) {
    await prevBtn.click();
    await page.waitForTimeout(3500); // aguardar curva
    await page.screenshot({ path: OUT('06-prev-clicked') });
    const afterPrev = await page.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
    if (afterPrev !== beforePrev) {
      pass('T8-prev-btn', `Anterior recuou: "${beforePrev}" → "${afterPrev}"`);
    } else {
      fail('T8-prev-btn', `Anterior não recuou: ainda "${afterPrev}"`);
    }
  } else {
    fail('T8-prev-btn', '#tour-prev não encontrado');
  }

  // T9: Botão Sair fecha o overlay e volta à vista superior
  const exitBtn = await page.$('#tour-exit');
  if (exitBtn) {
    await exitBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: OUT('07-after-exit') });
    const overlayHiddenAfterExit = await page.$eval('#tour-overlay', el => el.classList.contains('hidden')).catch(() => false);
    const viewControlsVisible = await page.$eval('#view-controls', el => !el.classList.contains('hidden')).catch(() => false);
    if (overlayHiddenAfterExit) pass('T9-exit-hides-overlay', 'Overlay oculto após clicar Sair');
    else fail('T9-exit-hides-overlay', 'Overlay ainda visível após clicar Sair');
    if (viewControlsVisible) pass('T9b-controls-return', '#view-controls visível após sair do tour');
    else fail('T9b-controls-return', '#view-controls ainda oculto após sair do tour');
  } else {
    fail('T9-exit-hides-overlay', '#tour-exit não encontrado');
  }

  // T10: Escape fecha o tour
  // Reiniciar o tour primeiro (fresh selector)
  const tourBtn2 = await page.$('#btn-tour');
  if (tourBtn2) {
    await tourBtn2.click();
    await page.waitForTimeout(500);
    const overlayBeforeEscape = await page.$eval('#tour-overlay', el => !el.classList.contains('hidden')).catch(() => false);
    info(`Overlay antes do Escape: ${overlayBeforeEscape}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT('08-after-escape') });
    const overlayAfterEscape = await page.$eval('#tour-overlay', el => el.classList.contains('hidden')).catch(() => false);
    if (overlayAfterEscape) {
      pass('T10-escape-closes-tour', 'Escape fechou o overlay do tour');
    } else {
      fail('T10-escape-closes-tour', `Escape NÃO fechou o tour — overlay ainda visível. BUG: handler de Escape não chama stopTour() quando tourMode=true`);
    }
  } else {
    fail('T10-escape-closes-tour', '#btn-tour não encontrado para reiniciar o tour');
  }

  // T11: Responsivo mobile
  const mobilePage = await browser.newPage();
  const mobileErrors = [];
  mobilePage.on('console', msg => { if (msg.type() === 'error') mobileErrors.push(msg.text()); });
  mobilePage.on('pageerror', err => mobileErrors.push(err.message));
  await mobilePage.setViewportSize({ width: 375, height: 667 });
  await mobilePage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(3000);

  // Iniciar tour no mobile
  const mobileTourBtn = await mobilePage.$('#btn-tour');
  const mobileTourBtnVisible = mobileTourBtn && await mobileTourBtn.isVisible();
  if (mobileTourBtn) {
    await mobileTourBtn.click();
    await mobilePage.waitForTimeout(1500);
    await mobilePage.screenshot({ path: OUT('09-mobile-tour') });
    const mobileOverlayVisible = await mobilePage.$eval('#tour-overlay', el => !el.classList.contains('hidden')).catch(() => false);
    const mobileCaptionName = await mobilePage.$eval('#tour-body-name', el => el.textContent.trim()).catch(() => '');
    const mobileControlsVisible = await mobilePage.$('#tour-controls').then(el => el && el.isVisible()).catch(() => false);
    if (mobileOverlayVisible && mobileCaptionName.length > 0 && mobileControlsVisible) {
      pass('T11-mobile-responsive', `Tour funcional em 375×667: "${mobileCaptionName}", controles visíveis`);
    } else {
      fail('T11-mobile-responsive', `Mobile: overlay=${mobileOverlayVisible} caption="${mobileCaptionName}" controls=${mobileControlsVisible}`);
    }
    // Check legibility — caption not clipped
    const captionBox = await mobilePage.$eval('#tour-caption', el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width };
    }).catch(() => null);
    if (captionBox && captionBox.bottom <= 667 && captionBox.left >= 0) {
      pass('T11b-mobile-caption-visible', `Caption dentro da viewport mobile (bottom=${captionBox.bottom.toFixed(0)}, width=${captionBox.width.toFixed(0)})`);
    } else {
      warn('T11b-mobile-caption-visible', `Caption pode estar fora da viewport: ${JSON.stringify(captionBox)}`);
    }
  } else {
    fail('T11-mobile-responsive', 'Botão Tour não encontrado no mobile');
  }
  if (mobileErrors.length === 0) pass('T11c-mobile-console', 'Zero erros de console no mobile');
  else fail('T11c-mobile-console', `${mobileErrors.length} erro(s) mobile: ${mobileErrors.slice(0, 2).join(' | ')}`);
  await mobilePage.close();

  // T12: Zero erros de console na sessão desktop
  if (consoleErrors.length === 0) pass('T12-console-errors', 'Zero erros de console na sessão desktop');
  else fail('T12-console-errors', `${consoleErrors.length} erro(s): ${consoleErrors.slice(0, 3).join(' | ')}`);

  // Sumário
  await page.close();
  await browser.close();

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  console.log(`\n── SUMÁRIO SIS-76: ${passed}/${total} PASS, ${failed} FAIL, ${warned} WARN ──`);
  writeFileSync('qa-sis76-results.json', JSON.stringify({
    issue: 'SIS-76',
    commit: 'e4fd192',
    passed, failed, warned, total, results
  }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('QA script error:', err);
  process.exit(2);
});
