import { chromium } from 'playwright';

const URL = 'http://localhost:5188';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// Expose camera distance from its lookAt via the module? Not global — measure via screenshot diff instead.
// Instead, read camera world position by injecting a probe: the app keeps `camera` in module scope (not global),
// so we verify behaviorally: zoom must visibly change the rendered frame and must NOT zoom the page (devicePixelRatio/visualViewport.scale stays 1).

const beforeScale = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1);
const beforeShot = await page.screenshot();

// Wheel up over canvas (zoom in) repeatedly
const cx = 720, cy = 450;
for (let i = 0; i < 12; i++) {
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -120); // negative deltaY = zoom in
  await page.waitForTimeout(20);
}
await page.waitForTimeout(400);
const afterShot = await page.screenshot();
await page.screenshot({ path: 'qa-sis46-zoomed-in.png' });

// Ctrl+wheel should be suppressed (no native page zoom): visualViewport.scale stays 1
await page.keyboard.down('Control');
await page.mouse.wheel(0, -240);
await page.keyboard.up('Control');
await page.waitForTimeout(200);
const afterCtrlScale = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1);

// Zoom back out
for (let i = 0; i < 18; i++) {
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(15);
}
await page.waitForTimeout(400);
await page.screenshot({ path: 'qa-sis46-zoomed-out.png' });

const framesDiffer = Buffer.compare(beforeShot, afterShot) !== 0;

console.log(JSON.stringify({
  framesDiffer,                 // true => wheel zoom visibly changed the scene
  beforeScale,
  afterCtrlScale,               // expect 1 => native ctrl-zoom suppressed
  consoleErrors,
}, null, 2));

await browser.close();
