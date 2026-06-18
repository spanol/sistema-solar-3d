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
const resources404 = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('response', resp => {
  if (resp.status() === 404) resources404.push(resp.url());
});

await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Screenshot 1: Top view overview
await page.screenshot({ path: 'qa-sis91-v2-01-top-view.png' });
console.log('1: top view captured');

// The asteroid belt is the ring between Mars and Jupiter.
// From the viewport, the right edge of the belt is approximately at (760, 350).
// Pan + zoom toward that region by placing cursor over it and scrolling in.

// Move cursor to asteroid belt region (right side of ring, between Marte and Jupiter)
await page.mouse.move(760, 350);
await new Promise(r => setTimeout(r, 200));

// Zoom in moderately (8 steps) toward asteroid belt
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 80));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v2-02-belt-zoom1.png' });
console.log('2: moderate zoom on asteroid belt captured');

// Zoom in more (8 more steps)
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 80));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v2-03-belt-zoom2.png' });
console.log('3: close zoom on asteroid belt captured');

// Zoom in even more for particle detail
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 80));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v2-04-belt-particles.png' });
console.log('4: particle close-up captured');

// Reset and try zooming from the left side (near Jupiter)
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Jupiter side of asteroid belt is around (535, 510) from the first screenshot
await page.mouse.move(535, 510);
await new Promise(r => setTimeout(r, 200));

for (let i = 0; i < 10; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 80));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v2-05-jupiter-side.png' });
console.log('5: jupiter-side asteroid belt captured');

for (let i = 0; i < 8; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 80));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v2-06-jupiter-closeup.png' });
console.log('6: jupiter-side close-up captured');

const results = {
  consoleErrors: errors,
  resources404,
  errorCount: errors.length,
  screenshots: [
    'qa-sis91-v2-01-top-view.png',
    'qa-sis91-v2-02-belt-zoom1.png',
    'qa-sis91-v2-03-belt-zoom2.png',
    'qa-sis91-v2-04-belt-particles.png',
    'qa-sis91-v2-05-jupiter-side.png',
    'qa-sis91-v2-06-jupiter-closeup.png',
  ],
};

fs.writeFileSync('qa-sis91-v2-results.json', JSON.stringify(results, null, 2));
console.log('Results:', JSON.stringify(results, null, 2));

await browser.close();
