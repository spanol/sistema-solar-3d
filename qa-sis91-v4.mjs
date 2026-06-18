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

// Screenshot 1: Top view (default) - shows belt at normal scale
await page.screenshot({ path: 'qa-sis91-v4-01-top-default.png' });
console.log('1: default top view');

// Moderate zoom: ~5 steps to get belt visible and larger
// D starts at ~133, each step of deltaY=120 multiplies by exp(120*0.0016) ≈ 1.21
// 5 steps → D ≈ 133/1.21^5 ≈ 133/2.59 ≈ 51 units
// At D=51, FOV=60°, visible radius ≈ 51*tan(30°) ≈ 29 → belt at 22-27 visible
await page.mouse.move(640, 400);
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 100));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v4-02-zoom5steps.png' });
console.log('2: 5 steps zoom (D≈51)');

// 2 more steps → D≈35 (belt at edge of view but still visible)
for (let i = 0; i < 2; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 100));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v4-03-zoom7steps.png' });
console.log('3: 7 steps zoom (D≈35)');

// Back to 3 steps from start for medium-close view
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));

await page.mouse.move(640, 400);
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 100));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v4-04-zoom3steps.png' });
console.log('4: 3 steps zoom (D≈78)');

// Crop the belt area - take a high-res screenshot and crop
// At 3-step zoom, belt appears at roughly 30% from edge of viewport
// Belt particles should be visible and large enough to see shape

// Let's also try with 1280x800 at 4 steps
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));
await page.mouse.move(640, 400);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 100));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v4-05-zoom4steps.png' });
console.log('5: 4 steps zoom (D≈63)');

// Take a 2x viewport screenshot to see more detail
await page.setViewport({ width: 2560, height: 1600 });
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));
await page.mouse.move(1280, 800);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise(r => setTimeout(r, 100));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'qa-sis91-v4-06-hires-zoom4.png' });
console.log('6: high-res 4 steps zoom');

const results = {
  consoleErrors: errors,
  resources404,
  errorCount: errors.length,
};

fs.writeFileSync('qa-sis91-v4-results.json', JSON.stringify(results, null, 2));
console.log('Results:', JSON.stringify(results, null, 2));

await browser.close();
