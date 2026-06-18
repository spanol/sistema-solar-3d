import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:4175';
const OUT_DIR = 'D:/code/sistema-solar-3d';

const results = {
  buttonFound: false,
  buttonPosition: {},
  downloadTriggeredTopView: false,
  downloadTriggeredFrontView: false,
  mobileButtonVisible: false,
  consoleErrors: [],
  consoleWarnings: [],
  screenshots: [],
  notes: []
};

async function saveScreenshot(page, filename) {
  const fullPath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: fullPath, fullPage: false });
  results.screenshots.push(fullPath);
  console.log(`Screenshot saved: ${filename}`);
  return fullPath;
}

// Inject download interceptor at prototype level so it catches any anchor click
async function injectDownloadInterceptor(page) {
  await page.evaluate(() => {
    window.__downloadEvents = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.download || (this.href && this.href.startsWith('blob:'))) {
        window.__downloadEvents.push({
          download: this.download,
          href: this.href ? this.href.substring(0, 100) : '',
          time: Date.now()
        });
        console.log('[DOWNLOAD INTERCEPTED]', this.download, this.href ? this.href.substring(0, 60) : '');
        // Don't call original to avoid actual download in headless
        return;
      }
      return origClick.call(this);
    };
    // Also intercept via dispatchEvent / addEventListener on anchor
    const origDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(event) {
      if (this instanceof HTMLAnchorElement && event.type === 'click') {
        if (this.download || (this.href && this.href.startsWith('blob:'))) {
          window.__downloadEvents.push({
            download: this.download,
            href: this.href ? this.href.substring(0, 100) : '',
            time: Date.now(),
            via: 'dispatchEvent'
          });
          console.log('[DOWNLOAD VIA dispatchEvent]', this.download);
          return true;
        }
      }
      return origDispatch.call(this, event);
    };
  });
}

async function checkDownloads(page) {
  return page.evaluate(() => window.__downloadEvents || []);
}

async function resetDownloadTracker(page) {
  await page.evaluate(() => { window.__downloadEvents = []; });
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--enable-accelerated-2d-canvas',
      '--ignore-gpu-blocklist',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  try {
    // ── DESKTOP SESSION ─────────────────────────────────────────────────────
    console.log('\n=== DESKTOP SESSION (1280×800) ===');
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: 1280, height: 800 });

    // Capture console messages
    desktopPage.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        results.consoleErrors.push(text);
        console.log(`[CONSOLE ERROR] ${text}`);
      } else if (type === 'warning' || type === 'warn') {
        results.consoleWarnings.push(text);
        console.log(`[CONSOLE WARN] ${text}`);
      } else {
        console.log(`[CONSOLE ${type.toUpperCase()}] ${text}`);
      }
    });

    desktopPage.on('pageerror', err => {
      results.consoleErrors.push(`PAGE ERROR: ${err.message}`);
      console.log(`[PAGE ERROR] ${err.message}`);
    });

    // Step 2: Navigate and wait for WebGL
    console.log('Navigating to', BASE_URL);
    await desktopPage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Inject download interceptor immediately
    await injectDownloadInterceptor(desktopPage);

    console.log('Waiting 4s for WebGL to load...');
    await new Promise(r => setTimeout(r, 4000));

    // Check WebGL status
    const webglStatus = await desktopPage.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { canvas: false };
      try {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return {
          canvas: true,
          webglWorking: !!gl,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          rendererInfo: gl ? gl.getParameter(gl.RENDERER) : null
        };
      } catch(e) {
        return { canvas: true, webglWorking: false, error: e.message };
      }
    });
    console.log('WebGL status:', webglStatus);
    results.notes.push(`WebGL status: ${JSON.stringify(webglStatus)}`);

    // Step 3: Screenshot - desktop top view
    await saveScreenshot(desktopPage, 'qa-sis75-01-desktop-top.png');

    // Step 5: Check for #btn-screenshot
    const btnHandle = await desktopPage.$('#btn-screenshot');
    results.buttonFound = !!btnHandle;
    console.log(`#btn-screenshot found: ${results.buttonFound}`);

    if (btnHandle) {
      const btnInfo = await desktopPage.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, width: rect.width, height: rect.height },
          // Distance from viewport edges
          fromBottom: vpH - rect.bottom,
          fromRight: vpW - rect.right,
          computedStyle: {
            display: style.display,
            visibility: style.visibility,
            position: style.position,
            bottom: style.bottom,
            right: style.right,
            zIndex: style.zIndex
          },
          textContent: el.textContent,
          ariaLabel: el.getAttribute('aria-label'),
          title: el.getAttribute('title')
        };
      }, btnHandle);

      console.log('Button info:', JSON.stringify(btnInfo, null, 2));
      results.buttonPosition = {
        rect: btnInfo.rect,
        fromBottom: btnInfo.fromBottom,
        fromRight: btnInfo.fromRight,
        computedStyle: btnInfo.computedStyle
      };
      results.buttonVisible = btnInfo.visible;

      // Step 6: Click #btn-screenshot (top view)
      console.log('\nStep 6: Clicking #btn-screenshot (top view)...');
      await resetDownloadTracker(desktopPage);
      await desktopPage.click('#btn-screenshot');
      await new Promise(r => setTimeout(r, 2000));

      const downloads1 = await checkDownloads(desktopPage);
      console.log('Downloads triggered (top view):', downloads1);
      results.downloadTriggeredTopView = downloads1.length > 0;
      results.downloadDetailsTopView = downloads1;
      results.notes.push(`Top view downloads: ${JSON.stringify(downloads1)}`);
    }

    // Step 7: Screenshot after click (top view)
    await saveScreenshot(desktopPage, 'qa-sis75-02-after-click-top.png');

    // Step 8: Click on a planet
    // First let's check what's visible on the canvas
    const canvasInfo = await desktopPage.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
    console.log('\nCanvas info:', canvasInfo);

    console.log('\nStep 8: Clicking on canvas to select a planet...');
    // Click at center of canvas
    const clickX = canvasInfo ? Math.round(canvasInfo.x + canvasInfo.width / 2) : 640;
    const clickY = canvasInfo ? Math.round(canvasInfo.y + canvasInfo.height / 2) : 400;
    await desktopPage.mouse.click(clickX, clickY);
    await new Promise(r => setTimeout(r, 2000));

    // Step 9: Screenshot - planet front view (may not be planet view if WebGL failed)
    await saveScreenshot(desktopPage, 'qa-sis75-03-planet-front-view.png');

    const viewState = await desktopPage.evaluate(() => ({
      hash: window.location.hash,
      url: window.location.href,
      // Check for any changed UI elements
      activePlanet: document.querySelector('[data-active], .active-planet, .planet-selected') ? 'found' : null,
      infoCard: document.querySelector('#info-panel, .info-card, #planet-info') ? 'found' : null,
      cardTitle: document.querySelector('.card-title, .planet-name, h2')?.textContent || null
    }));
    console.log('View state after planet click:', viewState);
    results.notes.push(`After planet click: ${JSON.stringify(viewState)}`);

    // Step 10: Click #btn-screenshot in planet front view
    console.log('\nStep 10: Clicking #btn-screenshot in (possible) planet front view...');
    await resetDownloadTracker(desktopPage);
    const btnFront = await desktopPage.$('#btn-screenshot');
    if (btnFront) {
      await desktopPage.click('#btn-screenshot');
      await new Promise(r => setTimeout(r, 2000));
      const downloads2 = await checkDownloads(desktopPage);
      console.log('Downloads triggered (front view):', downloads2);
      results.downloadTriggeredFrontView = downloads2.length > 0;
      results.downloadDetailsFrontView = downloads2;
      results.notes.push(`Front view downloads: ${JSON.stringify(downloads2)}`);
    }

    // Step 11: Screenshot after front click
    await saveScreenshot(desktopPage, 'qa-sis75-04-after-click-front.png');

    await desktopPage.close();

    // ── MOBILE SESSION ───────────────────────────────────────────────────────
    console.log('\n=== MOBILE SESSION (375×812) ===');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 375, height: 812, isMobile: true, deviceScaleFactor: 2 });

    mobilePage.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        results.consoleErrors.push(`[mobile] ${text}`);
        console.log(`[mobile CONSOLE ERROR] ${text}`);
      }
    });

    // Step 13: Navigate (mobile)
    console.log('Navigating to', BASE_URL, '(mobile)');
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await injectDownloadInterceptor(mobilePage);
    console.log('Waiting 3s for WebGL...');
    await new Promise(r => setTimeout(r, 3000));

    // Step 14: Mobile screenshot
    await saveScreenshot(mobilePage, 'qa-sis75-05-mobile.png');

    // Step 15: Check #btn-screenshot visibility on mobile
    const mobileBtnInfo = await mobilePage.evaluate(() => {
      const btn = document.querySelector('#btn-screenshot');
      if (!btn) return { found: false };
      const rect = btn.getBoundingClientRect();
      const style = window.getComputedStyle(btn);
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      return {
        found: true,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
        rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, width: rect.width, height: rect.height },
        fromBottom: vpH - rect.bottom,
        fromRight: vpW - rect.right,
        display: style.display,
        visibility: style.visibility,
        position: style.position,
        bottom: style.bottom,
        right: style.right,
        zIndex: style.zIndex
      };
    });

    console.log('Mobile button info:', JSON.stringify(mobileBtnInfo, null, 2));
    results.mobileButtonVisible = mobileBtnInfo.found && mobileBtnInfo.visible;
    results.mobileButtonInfo = mobileBtnInfo;

    // Also test mobile screenshot click
    if (mobileBtnInfo.found && mobileBtnInfo.visible) {
      console.log('Testing screenshot click on mobile...');
      await resetDownloadTracker(mobilePage);
      await mobilePage.click('#btn-screenshot');
      await new Promise(r => setTimeout(r, 1500));
      const mobileDownloads = await checkDownloads(mobilePage);
      console.log('Mobile downloads:', mobileDownloads);
      results.mobileDownloadTriggered = mobileDownloads.length > 0;
      results.notes.push(`Mobile downloads: ${JSON.stringify(mobileDownloads)}`);
    }

    await saveScreenshot(mobilePage, 'qa-sis75-06-mobile-after-click.png');
    await mobilePage.close();

    // ── EXTRA: Check button implementation details ────────────────────────
    console.log('\n=== EXTRA: Verifying button implementation ===');
    const verifyPage = await browser.newPage();
    await verifyPage.setViewport({ width: 1280, height: 800 });

    verifyPage.on('console', msg => {
      if (msg.type() === 'log') console.log(`[verify LOG] ${msg.text()}`);
    });

    await verifyPage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await injectDownloadInterceptor(verifyPage);
    await new Promise(r => setTimeout(r, 4000));

    // Inspect what happens when screenshot button is clicked
    const implDetails = await verifyPage.evaluate(() => {
      const btn = document.querySelector('#btn-screenshot');
      if (!btn) return { error: 'button not found' };

      // Check for all buttons in bottom right area
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
        id: b.id,
        text: b.textContent.trim().substring(0, 20),
        ariaLabel: b.getAttribute('aria-label'),
        rect: (() => {
          const r = b.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
        })()
      }));

      // Check canvas
      const canvas = document.querySelector('canvas');
      const canvasInfo = canvas ? {
        width: canvas.width,
        height: canvas.height,
        id: canvas.id,
        className: canvas.className
      } : null;

      // Check renderer element position
      const rendererEl = document.querySelector('#renderer, canvas#canvas, canvas');

      return {
        btnFound: !!btn,
        allButtons,
        canvasInfo,
        btnHTML: btn.outerHTML
      };
    });

    console.log('Implementation details:', JSON.stringify(implDetails, null, 2));
    results.notes.push(`Button HTML: ${implDetails.btnHTML}`);
    results.notes.push(`All buttons: ${JSON.stringify(implDetails.allButtons?.map(b => ({ id: b.id, label: b.ariaLabel })))}`);

    await verifyPage.close();

  } catch (err) {
    console.error('FATAL ERROR:', err);
    results.consoleErrors.push(`FATAL: ${err.message}`);
  } finally {
    await browser.close();
  }

  // ── SAVE RESULTS ──────────────────────────────────────────────────────────
  const reportPath = path.join(OUT_DIR, 'qa-sis75-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log('\n=== FINAL RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

run().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
