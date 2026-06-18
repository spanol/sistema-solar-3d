// QA SIS-49: Validate interactive zoom (SIS-48)
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5179';
const RESULTS = { screenshots: [], consoleErrors: [], findings: [] };

const browser = await chromium.launch({ headless: true });

// === Desktop test ===
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', m => { if (['error','warning','warn'].includes(m.type())) consoleMsgs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => consoleMsgs.push(`[pageerror] ${e.message}`));

  await page.goto(BASE);
  await page.waitForTimeout(4000); // let Three.js scene load

  // 1. Initial top view
  await page.screenshot({ path: 'qa-sis49-01-top-initial.png' });
  RESULTS.screenshots.push('qa-sis49-01-top-initial.png');

  // Measure zoom effect: get canvas bounding box as proxy
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  RESULTS.findings.push(`Canvas size: ${box.width}x${box.height}`);

  // 2. Zoom in via wheel (deltaY positive = scroll down = zoom in)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa-sis49-02-top-zoom-in.png' });
  RESULTS.screenshots.push('qa-sis49-02-top-zoom-in.png');

  // Check page zoom didn't change (window.devicePixelRatio should stay same)
  const pageZoomUnchanged = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    scrollY: window.scrollY,
    outerWidth: window.outerWidth,
    innerWidth: window.innerWidth,
    bodyTransform: document.body.style.transform,
  }));
  RESULTS.findings.push(`After zoom-in — DPR: ${pageZoomUnchanged.dpr}, scrollY: ${pageZoomUnchanged.scrollY}, outerW: ${pageZoomUnchanged.outerWidth}, innerW: ${pageZoomUnchanged.innerWidth}`);
  const pageUnchanged = pageZoomUnchanged.outerWidth === pageZoomUnchanged.innerWidth || Math.abs(pageZoomUnchanged.outerWidth - pageZoomUnchanged.innerWidth) < 2;
  RESULTS.findings.push(`Native browser zoom triggered: ${!pageUnchanged}`);

  // 3. Zoom out
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa-sis49-03-top-zoom-out.png' });
  RESULTS.screenshots.push('qa-sis49-03-top-zoom-out.png');

  // 4. Click Earth (approx position — middle-right area)
  // Try clicking near center where planet orbits would be
  // Earth is at ~middle distance from center
  await page.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2);
  await page.waitForTimeout(3000); // wait for front view transition
  await page.screenshot({ path: 'qa-sis49-04-front-view.png' });
  RESULTS.screenshots.push('qa-sis49-04-front-view.png');

  // Check if planet card is visible on left
  const cardVisible = await page.evaluate(() => {
    const card = document.querySelector('#info-card') || document.querySelector('.info-card') || document.querySelector('[class*="card"]') || document.querySelector('[id*="info"]');
    if (!card) return { found: false };
    const rect = card.getBoundingClientRect();
    return { found: true, visible: rect.width > 0 && rect.height > 0, left: rect.left, display: window.getComputedStyle(card).display };
  });
  RESULTS.findings.push(`Planet card: ${JSON.stringify(cardVisible)}`);

  // 5. Zoom in front view
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa-sis49-05-front-zoom-in.png' });
  RESULTS.screenshots.push('qa-sis49-05-front-zoom-in.png');

  // 6. Test Ctrl+wheel (should NOT zoom the page)
  await page.keyboard.down('Control');
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(80);
  }
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  const afterCtrlZoom = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    outerWidth: window.outerWidth,
    innerWidth: window.innerWidth,
  }));
  RESULTS.findings.push(`After Ctrl+wheel — DPR: ${afterCtrlZoom.dpr}, outerW: ${afterCtrlZoom.outerWidth}, innerW: ${afterCtrlZoom.innerWidth}`);
  await page.screenshot({ path: 'qa-sis49-06-ctrl-wheel.png' });
  RESULTS.screenshots.push('qa-sis49-06-ctrl-wheel.png');

  // Test zoom limits — zoom in hard (min distance)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa-sis49-07-zoom-min.png' });
  RESULTS.screenshots.push('qa-sis49-07-zoom-min.png');

  // Zoom out hard (max distance)
  for (let i = 0; i < 50; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa-sis49-08-zoom-max.png' });
  RESULTS.screenshots.push('qa-sis49-08-zoom-max.png');

  RESULTS.consoleErrors = consoleMsgs;
  await ctx.close();
}

// === Mobile viewport test ===
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const mobileMsgs = [];
  page.on('console', m => { if (['error','warning','warn'].includes(m.type())) mobileMsgs.push(`[${m.type()}] ${m.text()}`); });

  await page.goto(BASE);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'qa-sis49-09-mobile-top.png' });
  RESULTS.screenshots.push('qa-sis49-09-mobile-top.png');

  // Simulate pinch zoom via touch events
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Pinch in: two fingers moving apart = zoom in
  await page.touchscreen.tap(cx, cy); // just a touch to engage
  await page.waitForTimeout(200);

  RESULTS.mobileConsoleErrors = mobileMsgs;
  await ctx.close();
}

await browser.close();

// Write results
writeFileSync('qa-sis49-results.json', JSON.stringify(RESULTS, null, 2));
console.log(JSON.stringify(RESULTS, null, 2));
