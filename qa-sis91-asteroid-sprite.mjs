import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE = 'http://localhost:5177';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));

// Screenshot 1: Top view (full solar system)
await page.screenshot({ path: 'qa-sis91-01-top-view.png' });
console.log('Screenshot 1: top view captured');

// Zoom in toward asteroid belt (between Mars and Jupiter)
// Simulate wheel scroll to zoom in
await page.mouse.move(640, 400);
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 60));
}
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'qa-sis91-02-zoomed-asteroid-belt.png' });
console.log('Screenshot 2: zoomed into asteroid belt');

// Zoom in more for close-up
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 60));
}
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'qa-sis91-03-asteroid-closeup.png' });
console.log('Screenshot 3: close-up of asteroid belt particles');

// Check console errors
const results = {
  consoleErrors: errors,
  errorCount: errors.length,
  screenshots: [
    'qa-sis91-01-top-view.png',
    'qa-sis91-02-zoomed-asteroid-belt.png',
    'qa-sis91-03-asteroid-closeup.png',
  ],
};
fs.writeFileSync('qa-sis91-results.json', JSON.stringify(results, null, 2));
console.log('Results:', JSON.stringify(results, null, 2));

await browser.close();
