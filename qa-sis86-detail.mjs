/**
 * QA SIS-86 — Detailed Saturn ring inspection
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

// Intercept 404s
const notFound = [];
page.on('response', res => {
  if (res.status() === 404) notFound.push(res.url());
});

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    consoleErrors.push({ t: msg.type(), m: msg.text() });
  }
});
page.on('pageerror', err => consoleErrors.push({ t: 'pageerror', m: err.message }));

// ── 1. Load top view ─────────────────────────────────────────────────────────
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(3000);
await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-D1-top.png' });
console.log('D1: top view');

// ── 2. Navigate to Saturn via hash ───────────────────────────────────────────
await page.evaluate(() => { location.hash = 'planet=saturn'; });
await sleep(6000); // wait for camera transition
await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-D2-saturn-transition.png' });
console.log('D2: saturn transition');

// ── 3. Wait more for full zoom ────────────────────────────────────────────────
await sleep(3000);
await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-D3-saturn-front.png' });
console.log('D3: saturn front full');

// ── 4. Check card details ─────────────────────────────────────────────────────
const cardInfo = await page.evaluate(() => {
  const card = document.getElementById('card-stats');
  if (!card) return { found: false };
  const rect = card.getBoundingClientRect();
  const style = window.getComputedStyle(card);
  return {
    found: true,
    display: style.display,
    opacity: style.opacity,
    rect: { left: rect.left, top: rect.top, w: rect.width, h: rect.height },
    html: card.innerHTML.substring(0, 300),
  };
});
console.log('Card info:', JSON.stringify(cardInfo, null, 2));

// ── 5. Check ring click on top view ──────────────────────────────────────────
// First go back to top view
await page.evaluate(() => { location.hash = ''; });
await sleep(3000);
await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-D4-back-to-top.png' });
console.log('D4: back to top');

// Get Saturn position to click
const saturnPos = await page.evaluate(() => {
  // Try to find Saturn label position
  const labels = document.querySelectorAll('*');
  for (const el of labels) {
    if (el.textContent.trim() === 'Saturno' && el.children.length === 0) {
      const rect = el.getBoundingClientRect();
      return { found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2, tag: el.tagName };
    }
  }
  return { found: false };
});
console.log('Saturn label pos:', saturnPos);

if (saturnPos.found) {
  // Click slightly to the right of Saturn label (the ring area)
  await page.mouse.click(saturnPos.x + 30, saturnPos.y - 5);
  await sleep(4000);
  await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-D5-ring-click.png' });
  console.log('D5: after ring click');

  const afterClickCard = await page.evaluate(() => {
    const card = document.getElementById('card-stats');
    if (!card) return { found: false };
    const style = window.getComputedStyle(card);
    return { found: true, visible: style.display !== 'none', opacity: style.opacity };
  });
  console.log('Card after ring click:', afterClickCard);
}

// ── 6. Mobile with longer wait ────────────────────────────────────────────────
const mobile = await browser.newPage();
await mobile.setViewport({ width: 375, height: 812, isMobile: true });
await mobile.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(3000);
await mobile.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-D6-mobile-top.png' });
console.log('D6: mobile top');

await mobile.evaluate(() => { location.hash = 'planet=saturn'; });
await sleep(7000);
await mobile.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-D7-mobile-saturn.png' });
console.log('D7: mobile saturn');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n=== 404 URLs ===');
console.log(notFound.length === 0 ? 'None' : notFound.join('\n'));

console.log('\n=== Console Errors ===');
const relevant = consoleErrors.filter(e => !e.m.includes('Console Ninja') && !e.m.includes('favicon'));
console.log(relevant.length === 0 ? 'Clean' : JSON.stringify(relevant, null, 2));

await browser.close();
