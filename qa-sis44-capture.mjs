import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push(err.message));

console.log('Navigating...');
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'qa-sis44-top.png' });
console.log('✓ qa-sis44-top.png');

// Click planet by dispatching MouseEvent directly on canvas.
// Label is positioned 14px BELOW the planet's 2D screen center.
// So planet center = label.getBoundingClientRect().top - 14
async function clickPlanet(name) {
  return page.evaluate((planetName) => {
    const all = Array.from(document.querySelectorAll('*'));
    const label = all.find(el =>
      el.children.length === 0 &&
      el.textContent?.trim() === planetName &&
      window.getComputedStyle(el).position !== 'static'
    );
    if (!label) return { found: false };

    const rect = label.getBoundingClientRect();
    // Planet sphere center is 14px above the label's top edge
    const cx = rect.left + rect.width / 2;
    const cy = rect.top - 14;

    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: true, error: 'no canvas' };

    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: false, cancelable: true,
      clientX: cx, clientY: cy, view: window,
    }));
    return { found: true, clickX: cx, clickY: cy, label: rect };
  }, name);
}

async function clickBack() {
  await page.evaluate(() => {
    const btn = document.getElementById('card-close');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3500);
}

// --- Try clicking Terra with a search sweep ---
// Planet might be a few pixels off, try a small grid search
async function clickPlanetSearch(name) {
  return page.evaluate((planetName) => {
    const all = Array.from(document.querySelectorAll('*'));
    const label = all.find(el =>
      el.children.length === 0 &&
      el.textContent?.trim() === planetName &&
      window.getComputedStyle(el).position !== 'static'
    );
    if (!label) return { found: false };

    const rect = label.getBoundingClientRect();
    const baseX = rect.left + rect.width / 2;
    const baseY = rect.top - 14;

    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: true, error: 'no canvas' };

    // Try a grid of offsets to hit the sphere (±15px)
    for (const dy of [0, -8, 8, -16, 16]) {
      for (const dx of [0, -8, 8, -16, 16]) {
        canvas.dispatchEvent(new MouseEvent('click', {
          bubbles: false, cancelable: true,
          clientX: baseX + dx, clientY: baseY + dy, view: window,
        }));
      }
    }
    return { found: true, base: { x: baseX, y: baseY } };
  }, name);
}

// Terra front view
let r = await clickPlanetSearch('Terra');
console.log('Terra search click:', JSON.stringify(r));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'qa-sis44-earth-front.png' });
const earthCard = await page.evaluate(() => document.getElementById('card-name')?.textContent?.trim());
console.log('✓ qa-sis44-earth-front.png — card:', earthCard || '(empty, try again)');

// If first click didn't work, try clicking using Playwright canvas.click at planet location
if (!earthCard) {
  console.log('Card empty — trying Playwright canvas.click at planet position...');
  const pos = await page.evaluate((name) => {
    const all = Array.from(document.querySelectorAll('*'));
    const label = all.find(el => el.children.length === 0 && el.textContent?.trim() === name && window.getComputedStyle(el).position !== 'static');
    if (!label) return null;
    const rect = label.getBoundingClientRect();
    const canvas = document.querySelector('canvas');
    const cr = canvas.getBoundingClientRect();
    return {
      relX: (rect.left + rect.width / 2) - cr.left,
      relY: (rect.top - 14) - cr.top,
    };
  }, 'Terra');
  if (pos) {
    await page.locator('canvas').click({ position: { x: pos.relX, y: pos.relY }, force: true });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'qa-sis44-earth-front.png' });
    const card2 = await page.evaluate(() => document.getElementById('card-name')?.textContent?.trim());
    console.log('Retry card:', card2);
  }
}

await clickBack();

// Saturn front view
r = await clickPlanetSearch('Saturno');
console.log('Saturno search click:', JSON.stringify(r));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'qa-sis44-saturn-front.png' });
const saturnCard = await page.evaluate(() => document.getElementById('card-name')?.textContent?.trim());
console.log('✓ qa-sis44-saturn-front.png — card:', saturnCard || '(empty)');

await clickBack();
await page.screenshot({ path: 'qa-sis44-top-final.png' });
console.log('✓ qa-sis44-top-final.png');

console.log('\n=== QA Summary ===');
console.log(`Console errors: ${consoleErrors.length}`);
consoleErrors.forEach(e => console.log(' ERROR:', e));

await browser.close();
