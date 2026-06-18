import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = 'D:/code/sistema-solar-3d';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const consoleWarns = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarns.push(msg.text());
  });

  console.log('Navigating to app...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(5000); // let Three.js animate

  // Screenshot 1: top view
  console.log('Capturing top view...');
  await page.screenshot({ path: `${OUT}/qa-sis43-top.png`, fullPage: false });
  console.log('TOP VIEW saved');

  // Try clicking on Earth (3rd planet)
  // Try canvas-based click near center-ish position
  // First take a screenshot to understand layout
  const size = page.viewportSize();
  console.log('Viewport:', size);

  // Click Earth — in top view, planets orbit around center
  // Earth is roughly at center of canvas, slightly offset
  // Let's try clicking on the canvas and see what happens
  // First, let's check if there are any planet labels/buttons
  const planetElements = await page.$$('[data-planet], .planet, button[class*="planet"]');
  console.log('Planet elements found:', planetElements.length);

  // Check for any clickable elements
  const allButtons = await page.$$('button, [role="button"], [onclick]');
  console.log('Buttons found:', allButtons.length);

  // Get page text content to understand structure
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Body text snippet:', bodyText);

  // Check the canvas
  const canvases = await page.$$('canvas');
  console.log('Canvases found:', canvases.length);

  if (canvases.length > 0) {
    const canvasBox = await canvases[0].boundingBox();
    console.log('Canvas box:', canvasBox);

    // In top view, center of canvas is where Sun is
    // Earth should be roughly at: center + some offset
    // Let's try clicking at different positions
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;

    // Try clicking near Earth position (approximately 150-200px from center in top view)
    // Earth is 3rd planet, so moderate distance from center
    console.log('Clicking near Earth position...');
    await page.mouse.click(cx + 180, cy);
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-earth.png`, fullPage: false });
    console.log('EARTH VIEW saved');

    // Check if we're in planet view or still top view
    const afterClick = await page.evaluate(() => document.body.innerText.substring(0, 300));
    console.log('After Earth click text:', afterClick);

    // Try pressing Escape to go back
    await page.keyboard.press('Escape');
    await sleep(3000);

    // Saturn is 6th planet, further from center
    console.log('Clicking near Saturn position...');
    await page.mouse.click(cx + 350, cy);
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/qa-sis43-saturn.png`, fullPage: false });
    console.log('SATURN VIEW saved');
  }

  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(e => console.log('ERROR:', e));
  console.log('\n=== CONSOLE WARNINGS ===');
  consoleWarns.forEach(w => console.log('WARN:', w));

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
