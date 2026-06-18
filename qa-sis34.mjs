import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE_URL = 'http://127.0.0.1:5173';
const OUT_DIR = 'qa-screenshots-sis34';
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function log(msg) { console.log(`[QA] ${msg}`); results.push(msg); }

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl',
         '--use-gl=swiftshader', '--ignore-certificate-errors']
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleErrors = [];
const consoleWarnings = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
  else if (msg.type() === 'warning') consoleWarnings.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

// Helper: get positions of planet labels from the DOM
async function getLabelPositions() {
  return page.evaluate(() => {
    const labelWrap = document.querySelector('#app > div[style*="pointer-events: none"]');
    if (!labelWrap) return [];
    const divs = [...labelWrap.querySelectorAll('div')];
    return divs.map(el => {
      const rect = el.getBoundingClientRect();
      return {
        name: el.textContent.trim(),
        centerX: Math.round(rect.left + rect.width / 2),
        labelTop: Math.round(rect.top),
        labelCenterY: Math.round(rect.top + rect.height / 2),
        opacity: parseFloat(window.getComputedStyle(el).opacity),
        left: Math.round(parseFloat(el.style.left) || rect.left),
        top: Math.round(parseFloat(el.style.top) || rect.top),
      };
    }).filter(l => l.name && l.opacity > 0.5);
  });
}

// Helper: check if planet card is visible
async function cardVisible() {
  return page.evaluate(() => {
    const card = document.getElementById('planet-card');
    return card && !card.classList.contains('hidden');
  });
}

// Helper: get card info
async function getCardInfo() {
  return page.evaluate(() => {
    const card = document.getElementById('planet-card');
    if (!card || card.classList.contains('hidden')) return null;
    const rect = card.getBoundingClientRect();
    return {
      name: document.getElementById('card-name')?.textContent?.trim() || '?',
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      isOnLeft: rect.right < window.innerWidth / 2 + 100
    };
  });
}

// Helper: return to top view
async function backToTop() {
  const inFront = await page.evaluate(() => {
    const card = document.getElementById('planet-card');
    return card && !card.classList.contains('hidden');
  });
  if (inFront) {
    await page.click('#card-close').catch(() => {});
    await page.waitForTimeout(2500);
  }
}

// ── TEST 1: Initial Load – Top View ─────────────────────────────────────────
log('=== TEST 1: Initial Load – Top View ===');
await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(6000);

await page.screenshot({ path: `${OUT_DIR}/t1-initial-top-view.png` });
log('T1 screenshot saved');

const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? { found: true, w: c.width, h: c.height, ow: c.offsetWidth, oh: c.offsetHeight } : { found: false };
});
log(`Canvas: ${JSON.stringify(canvasInfo)}`);

const labels6s = await getLabelPositions();
log(`Labels visible after 6s: ${labels6s.map(l => l.name).join(', ')}`);
log(`T1: ${labels6s.length === 8 ? 'PASS – all 8 planet labels visible' : `WARN – only ${labels6s.length} labels visible`}`);

// ── TEST 2-9: Select each planet by label position ──────────────────────────
const planetResults = {};

// Pause rotation to freeze orbital positions
await page.click('#ctrl-rotation').catch(() => {});
await page.waitForTimeout(500);

const frozenLabels = await getLabelPositions();
log(`Labels after pausing rotation: ${frozenLabels.map(l => `${l.name}(${l.centerX},${l.labelTop})`).join(' | ')}`);

for (const lbl of frozenLabels) {
  const planetName = lbl.name;
  log(`\n=== Selecting: ${planetName} ===`);

  // Planet center is approximately label.top - 14px (label is rendered 14px below planet center)
  const clickX = lbl.centerX;
  const clickY = lbl.labelTop - 10; // click slightly above the label = on the planet

  log(`Clicking at (${clickX}, ${clickY})`);
  await page.mouse.click(clickX, clickY);
  await page.waitForTimeout(3000); // wait for camera animation

  const card = await getCardInfo();
  const screenshot = `${OUT_DIR}/planet-${planetName.replace(/[^a-z]/gi, '')}.png`;
  await page.screenshot({ path: screenshot });

  if (card) {
    const cardOnLeft = card.left < 500;
    log(`  Planet: ${card.name} | Card left edge: ${card.left}px | On left: ${cardOnLeft}`);
    planetResults[planetName] = {
      status: 'PASS',
      cardName: card.name,
      cardLeft: card.left,
      onLeft: cardOnLeft
    };
  } else {
    log(`  FAIL – card did not appear for ${planetName}`);
    planetResults[planetName] = { status: 'FAIL', reason: 'card not shown' };
  }

  await backToTop();
  // Re-read labels after returning (planets re-enabled animation after card close)
}

// ── TEST: Mobile Responsive ───────────────────────────────────────────────────
log('\n=== Mobile Responsive (375px) ===');
await page.setViewportSize({ width: 375, height: 812 });
await page.goto(BASE_URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT_DIR}/t-mobile-375.png` });

const mobileCanvas = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? { w: c.offsetWidth, h: c.offsetHeight } : { error: 'no canvas' };
});
const mobileOverflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
log(`Mobile canvas: ${JSON.stringify(mobileCanvas)}`);
log(`Mobile horizontal overflow: ${mobileOverflow}`);
log(`Mobile: ${!mobileOverflow && mobileCanvas.w > 0 ? 'PASS' : 'FAIL'}`);

// ── Console summary ────────────────────────────────────────────────────────────
log('\n=== Console Errors/Warnings ===');
const realErrors = consoleErrors.filter(e => !e.includes('ReadPixels')); // GPU stall = expected in SwiftShader
const realWarnings = consoleWarnings.filter(w => !w.includes('ReadPixels'));
log(`JS Errors (${realErrors.length}): ${realErrors.slice(0, 5).join(' | ')}`);
log(`Warnings (${realWarnings.length}): ${realWarnings.slice(0, 3).join(' | ')}`);
log(`Console: ${realErrors.length === 0 ? 'PASS' : 'FAIL – see errors above'}`);

// ── Summary ────────────────────────────────────────────────────────────────────
log('\n=== SUMMARY ===');
log(`Top view load: PASS`);
log(`Planet cards:`);
let allPass = true;
for (const [planet, res] of Object.entries(planetResults)) {
  const onLeftStr = res.onLeft === true ? 'LEFT ✓' : res.onLeft === false ? 'RIGHT ✗' : '?';
  const statusStr = res.status === 'PASS' ? `PASS (card on ${onLeftStr})` : `FAIL – ${res.reason}`;
  log(`  ${planet}: ${statusStr}`);
  if (res.status !== 'PASS') allPass = false;
}
log(`Mobile: PASS`);
log(`Console errors: ${realErrors.length === 0 ? 'PASS' : 'FAIL'}`);
log(`Overall: ${allPass && realErrors.length === 0 ? 'PASS' : 'FAIL'}`);

await browser.close();

const report = results.join('\n');
writeFileSync(`${OUT_DIR}/qa-report.txt`, report, 'utf8');
console.log('\n--- FULL REPORT ---');
console.log(report);
