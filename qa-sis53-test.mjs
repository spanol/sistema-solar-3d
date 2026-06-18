import { chromium } from './node_modules/playwright/index.js';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'qa-sis53-01-top.png' });

const btn = await page.$('[id="ctrl-real-scale"]');
const btnExists = btn !== null;
const btnText = btnExists ? await btn.innerText() : 'NOT FOUND';
const btnVisible = btnExists ? await btn.isVisible() : false;
const btnActive = btnExists ? await btn.getAttribute('aria-pressed') : null;

if (btnExists) {
  await btn.click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'qa-sis53-02-realscale.png' });
  const btnActiveAfter = await btn.getAttribute('aria-pressed');
  console.log('aria-pressed after click:', btnActiveAfter);
  // Toggle back
  await btn.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'qa-sis53-03-back.png' });
}

await browser.close();
console.log(JSON.stringify({ btnExists, btnText, btnVisible, btnActive, consoleErrors: errors }, null, 2));
