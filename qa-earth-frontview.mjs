import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT_DIR = './qa-screenshots-sis36';
const BASE_URL = 'http://localhost:5184';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(`[error] ${msg.text()}`);
  });
  page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`));

  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(8000); // full WebGL render

  // --- Strategy: click Neptune (large, worked before) then navigate via Anterior to reach Earth ---
  // Neptune label → click above it
  const neptunePos = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'));
    const el = all.find(d =>
      d.textContent.trim() === 'Netuno' &&
      d.style.position === 'absolute' &&
      d.style.pointerEvents === 'none'
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top - 25 };
  });
  console.log('Neptune pos:', neptunePos);

  if (neptunePos) {
    await page.mouse.click(neptunePos.x, neptunePos.y);
    await wait(4000);
    await page.screenshot({ path: join(OUT_DIR, '07-neptune-card-confirm.png') });
    const cardTitle = await page.$eval('#card-title, .card-title, [class*="planet-name"]', el => el.textContent).catch(() => '?');
    console.log('Card shows:', cardTitle);

    // Navigate Anterior from Neptune (7) to Earth (2): 5 clicks
    for (let i = 0; i < 5; i++) {
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const prev = btns.find(b => b.textContent.includes('Anterior') || b.textContent.includes('←'));
        if (prev) { prev.click(); return true; }
        return false;
      });
      console.log(`Anterior click ${i + 1}: ${clicked}`);
      await wait(2500);
    }
    await page.screenshot({ path: join(OUT_DIR, '07-terra-front-view-browser.png') });
    console.log('✓ Terra front view screenshot saved');

    // Capture card content
    const cardContent = await page.evaluate(() => {
      const title = document.querySelector('h2, .planet-title, [id*="planet-name"], [class*="title"]');
      return title ? title.textContent.trim() : 'not found';
    });
    console.log('Card planet name:', cardContent);
  } else {
    console.log('ERROR: Could not find Neptune label');
    await page.screenshot({ path: join(OUT_DIR, '07-debug-no-neptune.png') });
  }

  // Also capture Marte (Mars) front view for inner planet verification - just 1 more Anterior
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const prev = btns.find(b => b.textContent.includes('Anterior') || b.textContent.includes('←'));
    if (prev) prev.click();
  });
  await wait(2500);
  await page.screenshot({ path: join(OUT_DIR, '08-mars-front-view-browser.png') });
  console.log('✓ Mars front view screenshot saved');

  await ctx.close();
  await browser.close();

  const summary = { consoleErrors };
  writeFileSync(join(OUT_DIR, 'browser-run-report.json'), JSON.stringify(summary, null, 2));
  console.log(`Done. Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length) console.log(consoleErrors);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
