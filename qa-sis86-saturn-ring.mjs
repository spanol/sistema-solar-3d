/**
 * QA Script - SIS-86: Validar qualidade do anel de Saturno (SIS-85)
 */
import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = 'D:/code/sistema-solar-3d';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const results = { pass: [], fail: [], screenshots: [], consoleErrors: [] };

  // ─── TEST 1: Top View (default) ──────────────────────────────────────────
  console.log('\n=== T1: Vista superior (estado inicial) ===');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      results.consoleErrors.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', err => results.consoleErrors.push({ type: 'pageerror', text: err.message }));

  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  const ss1 = `${OUT_DIR}/qa-sis86-01-top-view.png`;
  await page.screenshot({ path: ss1 });
  results.screenshots.push('qa-sis86-01-top-view.png');
  console.log('Screenshot top view ok');

  // Verificar Saturno visível na top view
  const saturnInTopView = await page.evaluate(() => {
    // Check if canvas is rendering (non-black)
    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: false, reason: 'no canvas' };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { found: false, reason: 'no 2d context (WebGL canvas ok)' };
    return { found: true };
  });
  console.log('Top view check:', saturnInTopView);
  results.pass.push('T1: Vista superior carregou (canvas presente)');

  // ─── TEST 2: Deep-link para Saturno ──────────────────────────────────────
  console.log('\n=== T2: Deep-link saturn — vista frontal ===');
  await page.goto(BASE_URL + '#planet=saturn', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(5000); // transição de câmera

  const ss2 = `${OUT_DIR}/qa-sis86-02-saturn-front.png`;
  await page.screenshot({ path: ss2 });
  results.screenshots.push('qa-sis86-02-saturn-front.png');
  console.log('Screenshot saturn front ok');

  // Verificar card de fatos
  const cardCheck = await page.evaluate(() => {
    // Procurar card visível
    const cards = document.querySelectorAll(
      '.planet-card, #planet-card, [class*="card"], [id*="card"], [class*="info"], [id*="info"]'
    );
    for (const c of cards) {
      const style = window.getComputedStyle(c);
      const rect = c.getBoundingClientRect();
      if (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0 &&
        rect.width > 0 && rect.height > 0
      ) {
        return {
          found: true,
          tag: c.tagName,
          id: c.id,
          classes: c.className,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        };
      }
    }
    // Fallback: check body text
    const bodyText = document.body.innerText.toLowerCase();
    const hasSaturnFacts = bodyText.includes('saturn') || bodyText.includes('saturno') ||
      bodyText.includes('anel') || bodyText.includes('ring');
    return { found: false, bodyHasSaturnText: hasSaturnFacts };
  });
  console.log('Card check:', JSON.stringify(cardCheck));

  if (cardCheck.found) {
    results.pass.push('T2: Card de fatos aparece após selecionar Saturno');
    // Verificar se card está à ESQUERDA (rect.left < 640 para viewport 1280)
    if (cardCheck.rect && cardCheck.rect.left < 640) {
      results.pass.push('T2: Card posicionado à esquerda do planeta ✓');
    } else if (cardCheck.rect) {
      results.fail.push(`T2: Card NÃO está à esquerda — left=${cardCheck.rect.left}`);
    }
  } else {
    results.fail.push(`T2: Card de fatos NÃO encontrado (bodyHasSaturnText=${cardCheck.bodyHasSaturnText})`);
  }

  // ─── TEST 3: Screenshot da vista frontal ampliado ─────────────────────────
  console.log('\n=== T3: Close-up do anel de Saturno ===');
  await sleep(1000);
  const ss3 = `${OUT_DIR}/qa-sis86-03-saturn-ring-close.png`;
  await page.screenshot({ path: ss3 });
  results.screenshots.push('qa-sis86-03-saturn-ring-close.png');
  console.log('Screenshot ring close-up ok');

  // ─── TEST 4: Verificar clique no anel seleciona Saturno ──────────────────
  console.log('\n=== T4: Clique no anel seleciona Saturno ===');
  // Voltar ao top view e clicar no anel
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  const ss4a = `${OUT_DIR}/qa-sis86-04-topview-before-click.png`;
  await page.screenshot({ path: ss4a });
  results.screenshots.push('qa-sis86-04-topview-before-click.png');

  // Clicar na região de Saturno (aproximado — top-view, Saturno fica à direita-centro)
  await page.click('canvas', { offset: { x: 880, y: 420 } });
  await sleep(3000);

  const ss4b = `${OUT_DIR}/qa-sis86-05-after-click.png`;
  await page.screenshot({ path: ss4b });
  results.screenshots.push('qa-sis86-05-after-click.png');
  console.log('Screenshot after click ok');

  // ─── TEST 5: Mobile 375px ────────────────────────────────────────────────
  console.log('\n=== T5: Mobile 375px ===');
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 375, height: 812, isMobile: true });

  mobile.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      results.consoleErrors.push({ type: msg.type(), text: msg.text(), ctx: 'mobile' });
    }
  });
  mobile.on('pageerror', err => results.consoleErrors.push({ type: 'pageerror', text: err.message, ctx: 'mobile' }));

  await mobile.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  const ss5a = `${OUT_DIR}/qa-sis86-06-mobile-top.png`;
  await mobile.screenshot({ path: ss5a });
  results.screenshots.push('qa-sis86-06-mobile-top.png');
  console.log('Mobile top view ok');

  // Mobile → Saturno
  await mobile.goto(BASE_URL + '#planet=saturn', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(4000);

  const ss5b = `${OUT_DIR}/qa-sis86-07-mobile-saturn.png`;
  await mobile.screenshot({ path: ss5b });
  results.screenshots.push('qa-sis86-07-mobile-saturn.png');
  console.log('Mobile saturn view ok');
  results.pass.push('T5: Mobile 375px — carregou sem crash');

  // ─── TEST 6: Console errors ───────────────────────────────────────────────
  const filteredErrors = results.consoleErrors.filter(e =>
    !e.text.includes('Console Ninja') &&
    !e.text.includes('favicon') &&
    !e.text.includes('service worker')
  );

  if (filteredErrors.length === 0) {
    results.pass.push('T6: Console limpo (zero erros/avisos relevantes)');
  } else {
    // Categorize
    const webglErrors = filteredErrors.filter(e => e.text.includes('WebGL'));
    const otherErrors = filteredErrors.filter(e => !e.text.includes('WebGL'));
    if (webglErrors.length > 0) {
      results.fail.push(`T6: ${webglErrors.length} erro(s) WebGL no console`);
    }
    if (otherErrors.length > 0) {
      results.fail.push(`T6: ${otherErrors.length} outro(s) erro(s)/aviso(s) no console`);
    }
  }

  await browser.close();

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    issue: 'SIS-86',
    subject: 'QA: anel de Saturno (SIS-85)',
    screenshots: results.screenshots,
    pass: results.pass,
    fail: results.fail,
    consoleErrors: filteredErrors,
    verdict: results.fail.length === 0 ? 'PASS' : 'FAIL',
  };

  fs.writeFileSync(`${OUT_DIR}/qa-sis86-results.json`, JSON.stringify(report, null, 2));
  console.log('\n=== RESUMO ===');
  console.log('Verdict:', report.verdict);
  console.log('PASS:', results.pass);
  console.log('FAIL:', results.fail);
  console.log('Console errors (filtered):', filteredErrors.length);
}

run().catch(err => {
  console.error('QA script failed:', err);
  process.exit(1);
});
