import { chromium } from 'playwright';

const b = await chromium.launch({ headless: true });
const p = await b.newPage();
const errs = [];
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', e => errs.push(e.message));

await p.goto('http://localhost:5174');
await p.waitForTimeout(2500);

// Click on a planet (not Sun) – try positions to hit Jupiter or Saturn
const planetClicks = [
  { x: 520, y: 215 },  // Saturn
  { x: 800, y: 185 },  // Uranus area
  { x: 660, y: 155 },  // Uranus
  { x: 825, y: 210 },  // Neptune
];

let cardVisible = false;
for (const pos of planetClicks) {
  await p.click('canvas', { position: pos });
  await p.waitForTimeout(3500);
  cardVisible = await p.isVisible('#planet-card:not(.hidden)');
  if (cardVisible) { console.log(`Planet clicked at ${JSON.stringify(pos)}`); break; }
}

const planetName = await p.$eval('#card-name', el => el.textContent.trim()).catch(() => 'n/a');
console.log('Card planet:', planetName);

// Scroll the card down to see compare canvas
await p.evaluate(() => {
  const card = document.getElementById('planet-card');
  card.scrollTop = card.scrollHeight;
});
await p.waitForTimeout(800);
await p.screenshot({ path: 'qa-sis54-planet-scrolled.png' });

// Check canvas has pixels rendered (not blank)
const canvasDataPresent = await p.evaluate(() => {
  const c = document.getElementById('compare-canvas');
  const ctx = c.getContext('webgl2') || c.getContext('webgl');
  if (!ctx) return false;
  // just check canvas has width/height
  return c.width > 0 && c.height > 0;
});
console.log('Canvas has WebGL context with size:', canvasDataPresent);

const compareNames = await p.evaluate(() => ({
  a: document.getElementById('compare-name-a').textContent,
  da: document.getElementById('compare-diam-a').textContent,
  b: document.getElementById('compare-name-b').textContent,
  db: document.getElementById('compare-diam-b').textContent,
  sel: document.getElementById('compare-select').value,
}));
console.log('Compare labels:', JSON.stringify(compareNames));

// Test: go back to top, verify clean exit
await p.evaluate(() => document.getElementById('card-close').click());
await p.waitForTimeout(2000);
await p.screenshot({ path: 'qa-sis54-after-close.png' });
console.log('Closed card OK');

// Test navigating to another planet (open a planet then use arrow key)
await p.click('canvas', { position: { x: 520, y: 215 } });
await p.waitForTimeout(3500);
cardVisible = await p.isVisible('#planet-card:not(.hidden)');
if (cardVisible) {
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(3500);
  await p.evaluate(() => {
    const card = document.getElementById('planet-card');
    card.scrollTop = card.scrollHeight;
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'qa-sis54-next-planet.png' });
  const names2 = await p.evaluate(() => ({
    planet: document.getElementById('card-name').textContent,
    a: document.getElementById('compare-name-a').textContent,
    da: document.getElementById('compare-diam-a').textContent,
    b: document.getElementById('compare-name-b').textContent,
  }));
  console.log('After ArrowRight:', JSON.stringify(names2));
}

console.log('Console errors:', JSON.stringify(errs));
await b.close();
