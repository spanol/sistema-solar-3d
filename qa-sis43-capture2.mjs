import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'D:/code/sistema-solar-3d';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', res => {
    if (res.status() >= 400) networkErrors.push(`${res.status()} ${res.url()}`);
  });

  console.log('Navigating...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(4000);

  // Top view screenshot
  await page.screenshot({ path: `${OUT}/qa-sis43-top.png` });
  console.log('TOP saved');

  // Find all buttons and their text
  const buttons = await page.$$('button');
  const btnTexts = [];
  for (const btn of buttons) {
    const text = (await btn.textContent()).trim();
    const box = await btn.boundingBox();
    btnTexts.push({ text, box });
  }
  console.log('Buttons:', JSON.stringify(btnTexts, null, 2));

  // Find Terra button
  const terraBtn = await page.getByRole('button', { name: 'Terra' });
  if (await terraBtn.count() > 0) {
    console.log('Clicking Terra button...');
    await terraBtn.first().click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-earth.png` });
    console.log('EARTH saved');

    // Check page state
    const earthText = await page.evaluate(() => document.body.innerText.substring(0, 300));
    console.log('Earth page text:', earthText);
  } else {
    console.log('Terra button not found by role, trying by text...');
    // Try text selector
    const terraLink = page.locator('text=Terra').first();
    await terraLink.click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-earth.png` });
    console.log('EARTH saved (text selector)');
  }

  // Go back to top view
  const backBtn = await page.locator('text=← Voltar').first();
  if (await backBtn.count() > 0) {
    await backBtn.click();
    await sleep(3000);
  } else {
    await page.keyboard.press('Escape');
    await sleep(3000);
  }

  // Find Saturno button
  const saturnBtn = await page.getByRole('button', { name: 'Saturno' });
  if (await saturnBtn.count() > 0) {
    console.log('Clicking Saturno button...');
    await saturnBtn.first().click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-saturn.png` });
    console.log('SATURN saved');
  } else {
    console.log('Saturno button not found by role, trying by text...');
    const saturnLink = page.locator('text=Saturno').first();
    await saturnLink.click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-saturn.png` });
    console.log('SATURN saved (text selector)');
  }

  // Mobile viewport test
  await browser.close();

  // Mobile test
  const browser2 = await chromium.launch({ headless: true });
  const ctx2 = await browser2.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  await page2.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  await page2.screenshot({ path: `${OUT}/qa-sis43-mobile.png` });
  console.log('MOBILE saved');
  await browser2.close();

  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(e => console.log('ERROR:', e));
  console.log('\n=== NETWORK ERRORS ===');
  networkErrors.forEach(e => console.log('NET ERR:', e));

  console.log('\nDone!');
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
