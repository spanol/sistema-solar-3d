import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('qa-screenshots-sis40', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', e => consoleErrors.push(e.message));

await page.goto('http://localhost:5173/');
await page.waitForTimeout(5000);

// Screenshot 1: top view
await page.screenshot({ path: 'qa-screenshots-sis40/01-top-view.png' });
console.log('Screenshot 1: top view');

// Pause rotation so label positions are stable for clicking
const rotBtn = await page.$('#ctrl-rotation');
if (rotBtn) {
  await rotBtn.click();
  console.log('Paused rotation');
}
await page.waitForTimeout(300);

// Helper: get sphere screen position (label is 14px below sphere center)
const getSpherePos = async (planetName) => {
  return page.evaluate((name) => {
    const divs = document.querySelectorAll('div[style*="position: absolute"]');
    for (const el of divs) {
      if (el.textContent.trim() === name) {
        const r = el.getBoundingClientRect();
        // label top = sphere_screen_y + 14; sphere_screen_y = r.top - 14
        return { x: r.left + r.width / 2, y: r.top - 14 };
      }
    }
    return null;
  }, planetName);
};

// Click Earth
const earthPos = await getSpherePos('Terra');
console.log('Earth sphere pos:', earthPos);
if (earthPos) {
  await page.mouse.click(earthPos.x, earthPos.y);
  console.log('Clicked Earth');
} else {
  await page.mouse.click(720, 350);
  console.log('Fallback click for Earth');
}
await page.waitForTimeout(3500);
await page.screenshot({ path: 'qa-screenshots-sis40/02-earth-front.png' });
console.log('Screenshot 2: Earth front view');

// Escape back to top view
await page.keyboard.press('Escape');
await page.waitForTimeout(2800);

// Click Saturn
const saturnPos = await getSpherePos('Saturno');
console.log('Saturn sphere pos:', saturnPos);
if (saturnPos) {
  await page.mouse.click(saturnPos.x, saturnPos.y);
  console.log('Clicked Saturn');
} else {
  await page.mouse.click(498, 232);
  console.log('Fallback click for Saturn');
}
await page.waitForTimeout(3500);
await page.screenshot({ path: 'qa-screenshots-sis40/03-saturn-front.png' });
console.log('Screenshot 3: Saturn front view');

if (consoleErrors.length) {
  console.log('CONSOLE ERRORS:', consoleErrors);
} else {
  console.log('No console errors');
}

await browser.close();
console.log('Done');
