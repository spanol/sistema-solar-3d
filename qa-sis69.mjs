/**
 * QA SIS-69 — Validação da feature Deep-link / URL compartilhável (SIS-51, commit c9e0dcb)
 *
 * Cenários:
 *  S1 — URL raiz + seleção de planeta → hash reflete estado
 *  S2 — Abrir URL com hash em nova aba → estado restaurado completo
 *  S3 — Botão "Copiar link": texto muda para "✓ Copiado!" por ~2s, clipboard recebe URL
 *  S4 — "← Voltar" e Escape → hash remove planet=
 *  S5 — Toggles (órbitas/labels/rotação) → hash atualiza sem reload
 *  S6 — Reload com hash → estado preservado
 *  S7 — Mobile 390×844: card na parte inferior, botão Copiar link visível
 *  S8 — Zero erros de console
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const RESULTS = [];
const SCREENSHOTS = [];
const ALL_ERRORS = [];

const pass = (id, note) => { console.log(`✅ PASS  [${id}] ${note}`); RESULTS.push({ id, status: 'PASS', note }); };
const fail = (id, note) => { console.error(`❌ FAIL  [${id}] ${note}`); RESULTS.push({ id, status: 'FAIL', note }); };
const warn = (id, note) => { console.log(`⚠️  WARN  [${id}] ${note}`); RESULTS.push({ id, status: 'WARN', note }); };

async function shot(page, label) {
  const f = `qa-sis69-${label}.png`;
  await page.screenshot({ path: f, fullPage: false });
  SCREENSHOTS.push(f);
  console.log(`  📸 ${f}`);
  return f;
}

async function waitReady(page, ms = 3000) {
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas');
    return c && c.width > 0;
  }, { timeout: 12000 });
  await page.waitForTimeout(ms);
}

const getHash     = p => p.evaluate(() => location.hash);
const getState    = (p, id) => p.evaluate(id => {
  const el = document.getElementById(id);
  return el ? el.getAttribute('aria-pressed') : 'NOT_FOUND';
}, id);
const getCardName = p => p.evaluate(() => {
  const el = document.getElementById('card-name');
  if (!el) return null;
  return el.offsetParent !== null ? el.textContent.trim() : null;
});
const clickById   = (p, id) => p.evaluate(id => {
  const el = document.getElementById(id);
  if (el) { el.click(); return true; }
  return false;
}, id);
const pressKey    = (p, key) => p.evaluate(key =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
, key);
const getElText   = (p, id) => p.evaluate(id => {
  const el = document.getElementById(id);
  return el ? el.textContent.trim() : null;
}, id);
const isElVisible = (p, id) => p.evaluate(id => {
  const el = document.getElementById(id);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && el.offsetParent !== null;
}, id);

async function sweepForPlanet(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angles = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);
    const radii  = [35, 55, 75, 100, 125, 155, 185, 215, 250];
    for (const r of radii) {
      for (const a of angles) {
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
        if (location.hash.includes('planet=')) return location.hash;
      }
    }
    return null;
  });
}

async function run() {
  // Grant clipboard permissions so we can read clipboard content
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();

  page.on('console', m => {
    if (m.type() === 'error') ALL_ERRORS.push(m.text());
  });
  page.on('pageerror', e => ALL_ERRORS.push(`PAGE: ${e.message}`));

  // -------------------------------------------------------------------------
  // S1 — Seleção de planeta atualiza o hash
  // -------------------------------------------------------------------------
  console.log('\n=== S1: Seleção de planeta → hash atualiza ===');
  await page.goto(`${BASE}/`);
  await waitReady(page, 2500);
  await shot(page, 'S1-initial');

  const h1before = await getHash(page);
  console.log(`  hash antes: "${h1before}"`);

  const hit1 = await sweepForPlanet(page);
  // Camera animation (lerp to planet) fires showCard() when done; ~3s for full traversal
  await page.waitForTimeout(3500);
  const h1after = await getHash(page);
  const card1   = await getCardName(page);
  await shot(page, 'S1-after-click');
  console.log(`  hash depois: "${h1after}", card: "${card1}"`);

  if (hit1 || h1after.includes('planet=')) {
    pass('S1-hash-update', `hash contém planet= após clique: "${h1after}"`);
  } else {
    fail('S1-hash-update', `hash não atualizou. Antes="${h1before}", Depois="${h1after}"`);
  }
  card1
    ? pass('S1-card-open', `card abriu: "${card1}"`)
    : fail('S1-card-open', 'card não abriu após clique no planeta');

  // -------------------------------------------------------------------------
  // S2 — Abrir URL com hash restaura estado completo
  // -------------------------------------------------------------------------
  console.log('\n=== S2: URL com hash → estado restaurado ===');
  await page.goto('about:blank');
  await page.goto(`${BASE}/#planet=mars&orbits=0&labels=1&speed=2`);
  await waitReady(page, 3500);
  await shot(page, 'S2-restore');

  const h2    = await getHash(page);
  const card2 = await getCardName(page);
  const orb2  = await getState(page, 'ctrl-orbits');
  const lbl2  = await getState(page, 'ctrl-labels');
  const rot2  = await getState(page, 'ctrl-rotation');
  console.log(`  hash="${h2}", card="${card2}", orbits=${orb2}, labels=${lbl2}, rot=${rot2}`);

  card2 && /marte/i.test(card2)
    ? pass('S2-planet', `Mars restaurado: "${card2}"`)
    : fail('S2-planet', `Esperado Marte, recebido "${card2}"`);
  orb2 === 'false'
    ? pass('S2-orbits', 'órbitas ocultas conforme hash orbits=0')
    : fail('S2-orbits', `orbits aria-pressed="${orb2}" (esperado "false")`);
  lbl2 === 'true'
    ? pass('S2-labels', 'labels ativos conforme hash labels=1')
    : fail('S2-labels', `labels aria-pressed="${lbl2}" (esperado "true")`);
  rot2 === 'true'
    ? pass('S2-speed', 'rotação ativa conforme hash speed=2')
    : fail('S2-speed', `rotação aria-pressed="${rot2}" (esperado "true")`);

  // -------------------------------------------------------------------------
  // S3 — Botão "Copiar link": clipboard + feedback "✓ Copiado!" por ~2s
  // -------------------------------------------------------------------------
  console.log('\n=== S3: Botão "Copiar link" ===');
  // Ensure we are on a page with the card open (re-use S2 state)
  const copyBtnText0 = await getElText(page, 'card-copy-link');
  const copyBtnVisible = await isElVisible(page, 'card-copy-link');
  console.log(`  botão antes do clique: "${copyBtnText0}", visível: ${copyBtnVisible}`);

  copyBtnVisible
    ? pass('S3-btn-visible', `botão "Copiar link" visível no card`)
    : fail('S3-btn-visible', `botão "Copiar link" não está visível`);

  // Click and immediately check text feedback
  await clickById(page, 'card-copy-link');
  await page.waitForTimeout(300); // allow microtask to complete
  const copyBtnText1 = await getElText(page, 'card-copy-link');
  console.log(`  texto imediatamente após clique: "${copyBtnText1}"`);

  copyBtnText1 && copyBtnText1.includes('Copiado')
    ? pass('S3-feedback', `texto mudou para "${copyBtnText1}"`)
    : fail('S3-feedback', `esperado "✓ Copiado!", recebido "${copyBtnText1}"`);

  // Try to read clipboard
  let clipboardUrl = null;
  try {
    clipboardUrl = await page.evaluate(() => navigator.clipboard.readText());
    console.log(`  clipboard: "${clipboardUrl}"`);
    clipboardUrl && clipboardUrl.includes('#planet=')
      ? pass('S3-clipboard', `clipboard contém URL com hash: "${clipboardUrl}"`)
      : fail('S3-clipboard', `clipboard não contém hash: "${clipboardUrl}"`);
  } catch (e) {
    warn('S3-clipboard', `não foi possível ler clipboard (headless): ${e.message}`);
  }

  await shot(page, 'S3-feedback');

  // Wait for reset ~2s and confirm text reverts
  await page.waitForTimeout(2500);
  const copyBtnText2 = await getElText(page, 'card-copy-link');
  console.log(`  texto após 2.5s: "${copyBtnText2}"`);
  copyBtnText2 && copyBtnText2.includes('Copiar')
    ? pass('S3-reset', `texto voltou para "${copyBtnText2}" após 2s`)
    : fail('S3-reset', `texto não voltou ao original: "${copyBtnText2}"`);

  await shot(page, 'S3-reset');

  // -------------------------------------------------------------------------
  // S4 — "← Voltar" e Escape limpam planet= do hash
  // -------------------------------------------------------------------------
  console.log('\n=== S4: "← Voltar" e Escape removem planet= ===');

  // Test close button
  await page.goto('about:blank');
  await page.goto(`${BASE}/#planet=venus&orbits=1&labels=1&speed=1`);
  await waitReady(page, 4000);
  await shot(page, 'S4-before-close');

  await clickById(page, 'card-close');
  await page.waitForTimeout(2000);
  const h4close = await getHash(page);
  console.log(`  hash após close button: "${h4close}"`);
  !h4close.includes('planet=')
    ? pass('S4-close-btn', `planet= removido via "← Voltar": "${h4close}"`)
    : fail('S4-close-btn', `planet= ainda presente: "${h4close}"`);

  // Test Escape key
  await page.goto('about:blank');
  await page.goto(`${BASE}/#planet=venus&orbits=1&labels=1&speed=1`);
  await waitReady(page, 4000);
  await shot(page, 'S4-before-escape');

  await pressKey(page, 'Escape');
  await page.waitForTimeout(2000);
  const h4esc = await getHash(page);
  await shot(page, 'S4-after-escape');
  console.log(`  hash após Escape: "${h4esc}"`);
  !h4esc.includes('planet=')
    ? pass('S4-escape', `planet= removido via Escape: "${h4esc}"`)
    : fail('S4-escape', `planet= ainda presente após Escape: "${h4esc}"`);

  // -------------------------------------------------------------------------
  // S5 — Toggles (órbitas/labels/rotação) atualizam hash sem reload
  // -------------------------------------------------------------------------
  console.log('\n=== S5: Toggles atualizam hash ===');
  await page.goto(`${BASE}/`);
  await waitReady(page, 1500);

  await clickById(page, 'ctrl-orbits');
  await page.waitForTimeout(200);
  const h5a = await getHash(page);
  console.log(`  hash após toggle órbitas: "${h5a}"`);
  h5a.includes('orbits=')
    ? pass('S5-orbits', `orbits= presente no hash: "${h5a}"`)
    : fail('S5-orbits', `orbits= não encontrado no hash: "${h5a}"`);

  await clickById(page, 'ctrl-labels');
  await page.waitForTimeout(200);
  const h5b = await getHash(page);
  console.log(`  hash após toggle labels: "${h5b}"`);
  h5b.includes('labels=')
    ? pass('S5-labels', `labels= presente no hash: "${h5b}"`)
    : fail('S5-labels', `labels= não encontrado no hash: "${h5b}"`);

  await clickById(page, 'ctrl-rotation');
  await page.waitForTimeout(200);
  const h5c = await getHash(page);
  console.log(`  hash após toggle rotação: "${h5c}"`);
  h5c.includes('speed=')
    ? pass('S5-speed', `speed= presente no hash: "${h5c}"`)
    : fail('S5-speed', `speed= não encontrado no hash: "${h5c}"`);

  await shot(page, 'S5-toggles');

  // -------------------------------------------------------------------------
  // S6 — Reload com hash preserva estado
  // -------------------------------------------------------------------------
  console.log('\n=== S6: Reload com hash preserva estado ===');
  await page.goto(`${BASE}/#planet=saturn&orbits=0&labels=0&speed=0`);
  await waitReady(page, 3000);
  await shot(page, 'S6-first-load');

  await page.reload();
  await waitReady(page, 3000);
  await shot(page, 'S6-after-reload');

  const h6    = await getHash(page);
  const card6 = await getCardName(page);
  const orb6  = await getState(page, 'ctrl-orbits');
  const lbl6  = await getState(page, 'ctrl-labels');
  const rot6  = await getState(page, 'ctrl-rotation');
  console.log(`  hash="${h6}", card="${card6}", orbits=${orb6}, labels=${lbl6}, rot=${rot6}`);

  card6 && /saturno|saturn/i.test(card6)
    ? pass('S6-planet', `Saturn após reload: "${card6}"`)
    : fail('S6-planet', `Esperado Saturno, recebido "${card6}"`);
  orb6 === 'false' ? pass('S6-orbits', 'órbitas ocultas após reload') : fail('S6-orbits', `orbits="${orb6}"`);
  lbl6 === 'false' ? pass('S6-labels', 'labels ocultos após reload')  : fail('S6-labels', `labels="${lbl6}"`);
  rot6 === 'false' ? pass('S6-speed',  'rotação parada após reload')  : fail('S6-speed', `rot="${rot6}"`);

  // -------------------------------------------------------------------------
  // S7 — Mobile 390×844: card na parte inferior, botão Copiar link visível
  // -------------------------------------------------------------------------
  console.log('\n=== S7: Mobile ===');
  const mob = await ctx.newPage();
  mob.on('console', m => { if (m.type() === 'error') ALL_ERRORS.push(`[MOB] ${m.text()}`); });
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto('about:blank');
  await mob.goto(`${BASE}/#planet=mars&orbits=0&labels=1&speed=2`);
  await waitReady(mob, 3000);
  await shot(mob, 'S7-mobile');

  const hmob        = await getHash(mob);
  const cardMob     = await getCardName(mob);
  const copyMobVis  = await isElVisible(mob, 'card-copy-link');

  // Check card is at the bottom (y-center should be > half viewport height)
  const cardY = await mob.evaluate(() => {
    const el = document.getElementById('planet-card');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  const vp = mob.viewportSize();
  console.log(`  mobile: hash="${hmob}", card="${cardMob}", copyBtnVisible=${copyMobVis}, cardY=${cardY}, vpH=${vp.height}`);

  hmob.includes('planet=mars') && /marte/i.test(cardMob || '')
    ? pass('S7-state', `Mobile: estado restaurado, card="${cardMob}"`)
    : warn('S7-state', `Mobile: hash="${hmob}", card="${cardMob}"`);

  copyMobVis
    ? pass('S7-copy-btn', 'botão "Copiar link" visível no mobile')
    : fail('S7-copy-btn', 'botão "Copiar link" NÃO visível no mobile');

  if (cardY !== null) {
    cardY > vp.height * 0.4
      ? pass('S7-card-position', `card posicionado na parte inferior (y=${Math.round(cardY)})`)
      : warn('S7-card-position', `card y=${Math.round(cardY)} pode não estar na parte inferior`);
  }

  await mob.close();

  // -------------------------------------------------------------------------
  // S8 — Zero erros de console
  // -------------------------------------------------------------------------
  console.log('\n=== S8: Zero erros de console ===');

  // Adicional: fresh page para medir erros limpos
  const p8 = await ctx.newPage();
  const freshErrors = [];
  p8.on('console', m => { if (m.type() === 'error') freshErrors.push(m.text()); });
  p8.on('pageerror', e => freshErrors.push(`PAGE: ${e.message}`));
  await p8.goto(`${BASE}/#planet=mars&orbits=0&labels=1&speed=2`);
  await waitReady(p8, 2000);
  // Trigger copy-link on fresh page too
  await p8.evaluate(id => {
    const el = document.getElementById(id);
    if (el) el.click();
  }, 'card-copy-link');
  await p8.waitForTimeout(500);
  await p8.close();

  const relevant = [...ALL_ERRORS, ...freshErrors].filter(e =>
    !e.includes('favicon') &&
    !e.includes('Console Ninja') &&
    !e.includes('[vite]')
  );
  relevant.length === 0
    ? pass('S8-errors', 'Zero erros de console')
    : fail('S8-errors', `${relevant.length} erro(s): ${relevant.slice(0, 3).join(' | ')}`);

  // -------------------------------------------------------------------------
  // Regressão: navegação por teclado (setas prev/next)
  // -------------------------------------------------------------------------
  console.log('\n=== Regressão: navegação por setas ===');
  await page.goto('about:blank');
  await page.goto(`${BASE}/#planet=earth&orbits=1&labels=1&speed=1`);
  await waitReady(page, 3000);

  const hRegStart = await getHash(page);
  await clickById(page, 'card-next');
  await page.waitForTimeout(3000);
  const hRegNext = await getHash(page);
  console.log(`  next: "${hRegStart}" → "${hRegNext}"`);
  hRegNext.includes('planet=') && hRegNext !== hRegStart
    ? pass('REG-nav-next', `hash mudou após Next: "${hRegNext}"`)
    : fail('REG-nav-next', `hash não mudou: antes="${hRegStart}", depois="${hRegNext}"`);

  await clickById(page, 'card-prev');
  await page.waitForTimeout(3000);
  const hRegPrev = await getHash(page);
  console.log(`  prev: "${hRegNext}" → "${hRegPrev}"`);
  hRegPrev.includes('planet=') && hRegPrev !== hRegNext
    ? pass('REG-nav-prev', `hash mudou após Prev: "${hRegPrev}"`)
    : fail('REG-nav-prev', `hash não mudou após Prev: "${hRegPrev}"`);

  // -------------------------------------------------------------------------
  // Sumário
  // -------------------------------------------------------------------------
  await browser.close();

  const np = RESULTS.filter(r => r.status === 'PASS').length;
  const nf = RESULTS.filter(r => r.status === 'FAIL').length;
  const nw = RESULTS.filter(r => r.status === 'WARN').length;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`SIS-69 QA (SIS-51 deep-link): ${np} PASS | ${nf} FAIL | ${nw} WARN`);
  console.log('='.repeat(70));
  RESULTS.forEach(r => {
    const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ' }[r.status];
    console.log(`${icon} [${r.id}] ${r.note}`);
  });

  if (relevant.length) {
    console.log('\nErros de console:');
    relevant.forEach(e => console.log('  -', e));
  }

  writeFileSync('qa-sis69-results.json', JSON.stringify({
    summary: { passed: np, failed: nf, warned: nw },
    results: RESULTS,
    consoleErrors: relevant,
    screenshots: SCREENSHOTS,
  }, null, 2));

  console.log('\nResultados → qa-sis69-results.json');
  console.log('Screenshots:', SCREENSHOTS.join(', '));
  process.exit(nf > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
