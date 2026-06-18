import { chromium } from 'playwright';
import fs from 'fs';

const RESULTS = {
  screenshots: [],
  consoleErrors: [],
  consoleWarnings: [],
  observations: {}
};

// ── Desktop session ──────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') RESULTS.consoleErrors.push(msg.text());
  if (msg.type() === 'warning') RESULTS.consoleWarnings.push(msg.text());
});
page.on('pageerror', err => RESULTS.consoleErrors.push(err.message));

// 1. Top view
console.log('Loading app...');
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'qa-sis41-top-view.png', fullPage: false });
RESULTS.screenshots.push('qa-sis41-top-view.png');
console.log('✓ qa-sis41-top-view.png');

// Observe top view
RESULTS.observations.topView = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const labels = Array.from(document.querySelectorAll('*')).filter(el =>
    el.children.length === 0 &&
    el.textContent?.trim().length > 0 &&
    window.getComputedStyle(el).position !== 'static' &&
    window.getComputedStyle(el).color !== ''
  ).map(el => el.textContent.trim()).filter(t => t.length < 20);
  const uniqueLabels = [...new Set(labels)];
  return {
    hasCanvas: !!canvas,
    canvasWidth: canvas?.width,
    canvasHeight: canvas?.height,
    visibleLabels: uniqueLabels.slice(0, 20),
    labelCount: uniqueLabels.length,
  };
});

// 2. Star detail – zoom into top-left corner where stars are more visible
await page.screenshot({ path: 'qa-sis41-stars-detail.png', clip: { x: 0, y: 0, width: 400, height: 300 } });
RESULTS.screenshots.push('qa-sis41-stars-detail.png');
console.log('✓ qa-sis41-stars-detail.png (top-left crop for star inspection)');

// 3. Click Earth
async function clickPlanetSearch(name) {
  return page.evaluate((planetName) => {
    const label = Array.from(document.querySelectorAll('*')).find(el =>
      el.children.length === 0 &&
      el.textContent?.trim() === planetName &&
      window.getComputedStyle(el).position !== 'static'
    );
    if (!label) return { found: false };
    const rect = label.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top - 14;
    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: true, error: 'no canvas' };
    for (const dy of [0, -10, 10, -20, 20, -30]) {
      for (const dx of [0, -10, 10, -20, 20]) {
        canvas.dispatchEvent(new MouseEvent('click', {
          bubbles: false, cancelable: true,
          clientX: cx + dx, clientY: cy + dy, view: window,
        }));
      }
    }
    return { found: true, cx, cy };
  }, name);
}

async function clickBackBtn() {
  await page.evaluate(() => {
    const btn = document.getElementById('card-close') ||
      document.querySelector('[id*="close"]') ||
      document.querySelector('button[aria-label*="close"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3500);
}

async function getCardState() {
  return page.evaluate(() => {
    const name = document.getElementById('card-name')?.textContent?.trim();
    const card = document.getElementById('planet-card') ||
      document.querySelector('[id*="card"]');
    if (!card) return { visible: false, name: null, rect: null };
    const rect = card.getBoundingClientRect();
    return {
      visible: rect.width > 0 && rect.height > 0,
      name,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    };
  });
}

async function getCanvasRect() {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

// Earth front view
let r = await clickPlanetSearch('Terra');
console.log('Terra click:', JSON.stringify(r));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'qa-sis41-earth-front.png' });
RESULTS.screenshots.push('qa-sis41-earth-front.png');

let card = await getCardState();
console.log('Earth card:', JSON.stringify(card));

// retry via Playwright click if card not visible
if (!card.visible) {
  console.log('Retrying Earth click with Playwright...');
  const pos = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('*')).find(el =>
      el.children.length === 0 && el.textContent?.trim() === 'Terra' && window.getComputedStyle(el).position !== 'static'
    );
    if (!label) return null;
    const rect = label.getBoundingClientRect();
    const canvas = document.querySelector('canvas');
    const cr = canvas.getBoundingClientRect();
    return { relX: (rect.left + rect.width / 2) - cr.left, relY: (rect.top - 14) - cr.top };
  });
  if (pos) {
    await page.locator('canvas').click({ position: { x: pos.relX, y: pos.relY }, force: true });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'qa-sis41-earth-front.png' });
    card = await getCardState();
    console.log('Earth retry card:', JSON.stringify(card));
  }
}

const canvasRect = await getCanvasRect();
RESULTS.observations.earthFront = {
  cardVisible: card.visible,
  cardName: card.name,
  cardRect: card.rect,
  canvasRect,
  cardOnLeft: card.rect ? card.rect.right < (canvasRect?.width || 1440) / 2 : null,
  cardOverlapsPlanetZone: card.rect ? card.rect.right > (canvasRect?.width || 1440) * 0.4 : null,
};
console.log('✓ qa-sis41-earth-front.png — card visible:', card.visible, '| card name:', card.name);

await clickBackBtn();

// Saturn front view
r = await clickPlanetSearch('Saturno');
console.log('Saturno click:', JSON.stringify(r));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'qa-sis41-saturn-front.png' });
RESULTS.screenshots.push('qa-sis41-saturn-front.png');

let satCard = await getCardState();
// retry
if (!satCard.visible) {
  const pos = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('*')).find(el =>
      el.children.length === 0 && el.textContent?.trim() === 'Saturno' && window.getComputedStyle(el).position !== 'static'
    );
    if (!label) return null;
    const rect = label.getBoundingClientRect();
    const canvas = document.querySelector('canvas');
    const cr = canvas.getBoundingClientRect();
    return { relX: (rect.left + rect.width / 2) - cr.left, relY: (rect.top - 14) - cr.top };
  });
  if (pos) {
    await page.locator('canvas').click({ position: { x: pos.relX, y: pos.relY }, force: true });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'qa-sis41-saturn-front.png' });
    satCard = await getCardState();
  }
}

RESULTS.observations.saturnFront = {
  cardVisible: satCard.visible,
  cardName: satCard.name,
  cardRect: satCard.rect,
  canvasRect,
  cardOnLeft: satCard.rect ? satCard.rect.right < (canvasRect?.width || 1440) / 2 : null,
};
console.log('✓ qa-sis41-saturn-front.png — card visible:', satCard.visible, '| card name:', satCard.name);

await clickBackBtn();
await page.screenshot({ path: 'qa-sis41-top-final.png' });
RESULTS.screenshots.push('qa-sis41-top-final.png');
console.log('✓ qa-sis41-top-final.png');

await browser.close();

// ── Mobile session ───────────────────────────────────────────────────────────
const browser2 = await chromium.launch({ headless: true });
const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 } });
const page2 = await ctx2.newPage();
const mobileErrors = [];
page2.on('console', msg => { if (msg.type() === 'error') mobileErrors.push(msg.text()); });
page2.on('pageerror', err => mobileErrors.push(err.message));

await page2.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page2.waitForTimeout(4000);
await page2.screenshot({ path: 'qa-sis41-mobile-top.png' });
RESULTS.screenshots.push('qa-sis41-mobile-top.png');
console.log('✓ qa-sis41-mobile-top.png');

// Try clicking Earth on mobile
const mobilePos = await page2.evaluate(() => {
  const label = Array.from(document.querySelectorAll('*')).find(el =>
    el.children.length === 0 && el.textContent?.trim() === 'Terra' && window.getComputedStyle(el).position !== 'static'
  );
  if (!label) return null;
  const rect = label.getBoundingClientRect();
  const canvas = document.querySelector('canvas');
  const cr = canvas?.getBoundingClientRect();
  return cr ? { relX: (rect.left + rect.width / 2) - cr.left, relY: (rect.top - 14) - cr.top } : null;
});

if (mobilePos) {
  await page2.locator('canvas').click({ position: { x: mobilePos.relX, y: mobilePos.relY }, force: true });
  await page2.waitForTimeout(4000);
}
await page2.screenshot({ path: 'qa-sis41-mobile-earth.png' });
RESULTS.screenshots.push('qa-sis41-mobile-earth.png');
console.log('✓ qa-sis41-mobile-earth.png');

RESULTS.observations.mobile = {
  additionalErrors: mobileErrors,
};

await browser2.close();

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n=== QA RESULTS ===');
console.log(JSON.stringify(RESULTS, null, 2));
fs.writeFileSync('qa-sis41-results.json', JSON.stringify(RESULTS, null, 2));
console.log('\n✓ Results saved to qa-sis41-results.json');
