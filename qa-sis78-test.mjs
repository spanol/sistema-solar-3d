import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const results = { errors: [], steps: [] };

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
});

// ── Desktop session ─────────────────────────────────────────────────────────
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    results.errors.push({ type: msg.type(), text: msg.text() });
  }
});
page.on('pageerror', err => results.errors.push({ type: 'pageerror', text: err.message }));

// Step 1 — Initial load
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: 'qa-sis78-01-initial-top.png' });

// Step 2 — Inspect audio button initial state
const audioBtnState = await page.evaluate(() => {
  const btn = document.getElementById('btn-audio');
  if (!btn) return { found: false };
  const rect = btn.getBoundingClientRect();
  return {
    found: true,
    textContent: btn.textContent,
    ariaPressed: btn.getAttribute('aria-pressed'),
    ariaLabel: btn.getAttribute('aria-label'),
    title: btn.getAttribute('title'),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: rect.width,
    height: rect.height,
    visible: rect.width > 0 && rect.height > 0,
  };
});

results.steps.push({ step: '1-initial-state', ...audioBtnState });

// Screenshot of bottom-right corner
if (audioBtnState.found) {
  const { x, y } = audioBtnState;
  await page.screenshot({
    path: 'qa-sis78-02-btn-closeup.png',
    clip: { x: Math.max(0, x - 100), y: Math.max(0, y - 20), width: 250, height: 80 },
  });
}

// Step 3 — Toggle audio ON (first user gesture)
await page.click('#btn-audio');
await new Promise(r => setTimeout(r, 700));

const afterToggleOn = await page.evaluate(() => {
  const btn = document.getElementById('btn-audio');
  if (!btn) return { found: false };
  return {
    textContent: btn.textContent,
    ariaPressed: btn.getAttribute('aria-pressed'),
    ariaLabel: btn.getAttribute('aria-label'),
  };
});

await page.screenshot({ path: 'qa-sis78-03-audio-on.png' });
results.steps.push({ step: '2-toggle-on', ...afterToggleOn });

// Step 4 — Check AudioContext state (lazy init)
const audioCtxState = await page.evaluate(() => {
  // Try to read internal audioCtx via window (if exposed) or check for AudioContext in console
  // We can't easily access module scope vars; rely on btn state as proxy
  return {
    audioContextSupported: typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined',
  };
});
results.steps.push({ step: '3-audiocontext', ...audioCtxState });

// Step 5 — Navigate to a planet (try clicking on canvas near where Earth might be)
const canvasBox = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
results.steps.push({ step: '4-canvas-box', canvasBox });

if (canvasBox) {
  // Click in the center-right area (approximate Earth orbital zone in top view)
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.5 + 100, canvasBox.y + canvasBox.height * 0.5);
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'qa-sis78-04-after-planet-click.png' });

  const cardState = await page.evaluate(() => {
    const card = document.getElementById('planet-card');
    if (!card) return { found: false };
    const rect = card.getBoundingClientRect();
    const style = window.getComputedStyle(card);
    return {
      found: true,
      className: card.className,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
    };
  });
  results.steps.push({ step: '5-card-after-click', ...cardState });
}

// Step 6 — Press Escape to go back to top
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis78-05-back-to-top.png' });

const viewModeAfterEsc = await page.evaluate(() => {
  // Can't access module scope; check if card is hidden
  const card = document.getElementById('planet-card');
  const style = card ? window.getComputedStyle(card) : null;
  return {
    cardVisible: style ? (style.display !== 'none' && style.opacity !== '0') : false,
    hash: window.location.hash,
  };
});
results.steps.push({ step: '6-back-to-top', ...viewModeAfterEsc });

// Step 7 — Toggle audio OFF
await page.click('#btn-audio');
await new Promise(r => setTimeout(r, 400));
const afterToggleOff = await page.evaluate(() => {
  const btn = document.getElementById('btn-audio');
  return btn ? { textContent: btn.textContent, ariaPressed: btn.getAttribute('aria-pressed') } : null;
});
results.steps.push({ step: '7-toggle-off', ...afterToggleOff });

// ── Mobile session ──────────────────────────────────────────────────────────
const pageMobile = await browser.newPage();
await pageMobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
pageMobile.on('console', msg => {
  if (msg.type() === 'error') results.errors.push({ type: 'mobile-error', text: msg.text() });
});
await pageMobile.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 2000));
await pageMobile.screenshot({ path: 'qa-sis78-06-mobile.png' });

const mobileBtnState = await pageMobile.evaluate(() => {
  const btn = document.getElementById('btn-audio');
  if (!btn) return { found: false };
  const rect = btn.getBoundingClientRect();
  return {
    found: true,
    visible: rect.width > 0 && rect.height > 0,
    textContent: btn.textContent,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    inViewport: rect.x >= 0 && rect.y >= 0 && rect.x < window.innerWidth && rect.y < window.innerHeight,
  };
});
results.steps.push({ step: '8-mobile-btn', ...mobileBtnState });

await pageMobile.close();
await page.close();
await browser.close();

// ── Summary ─────────────────────────────────────────────────────────────────
results.consoleSummary = {
  totalErrors: results.errors.length,
  errorTexts: results.errors.map(e => `[${e.type}] ${e.text}`),
};

writeFileSync('qa-sis78-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
