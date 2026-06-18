/**
 * QA SIS-86 — Final close-up clips for ring detail
 */
import puppeteer from 'puppeteer';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(3000);

// Press '6' to select Saturn
await page.keyboard.press('Digit6');
await sleep(6000);

// Full view
await page.screenshot({ path: 'D:/code/sistema-solar-3d/qa-sis86-F1-saturn-full.png' });

// Close-up of ring + planet (right half of screen)
await page.screenshot({
  path: 'D:/code/sistema-solar-3d/qa-sis86-F2-ring-close.png',
  clip: { x: 550, y: 120, width: 600, height: 520 },
});

// Very close — just ring
await page.screenshot({
  path: 'D:/code/sistema-solar-3d/qa-sis86-F3-ring-detail.png',
  clip: { x: 680, y: 180, width: 400, height: 380 },
});

// Check card is left
const card = await page.evaluate(() => {
  const el = document.getElementById('card-stats');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return { left: r.left, w: r.width, h: r.height, display: style.display, name: document.getElementById('card-name')?.textContent };
});
console.log('Card:', card);
console.log('Card is LEFT of viewport center (683px):', card?.left < 683 ? 'YES ✓' : 'NO ✗');

await browser.close();
console.log('Done');
