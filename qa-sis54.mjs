import { chromium } from 'playwright';

const b = await chromium.launch({ headless: true });
const p = await b.newPage();
const errs = [];
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', e => errs.push(e.message));

await p.goto('http://localhost:5174');
await p.waitForTimeout(2500);
await p.screenshot({ path: 'qa-sis54-top.png' });
console.log('Top view captured');

// Click somewhere a planet might be – try several spots
const clicks = [
  { x: 760, y: 400 },
  { x: 650, y: 350 },
  { x: 800, y: 450 },
  { x: 720, y: 380 },
];

let cardVisible = false;
for (const pos of clicks) {
  await p.click('canvas', { position: pos });
  await p.waitForTimeout(3500);
  cardVisible = await p.isVisible('#planet-card:not(.hidden)');
  if (cardVisible) { console.log(`Planet clicked at ${JSON.stringify(pos)}`); break; }
}

await p.screenshot({ path: 'qa-sis54-card.png' });
console.log('Card visible:', cardVisible);

const compareVisible = await p.isVisible('#card-compare');
const dropdownVisible = await p.isVisible('#compare-select');
const dropdownValue = await p.$eval('#compare-select', el => el.value).catch(() => 'n/a');
const dropdownOptions = await p.$$eval('#compare-select option', opts => opts.map(o => o.value)).catch(() => []);
const nameA = await p.$eval('#compare-name-a', el => el.textContent.trim()).catch(() => 'n/a');
const diamA = await p.$eval('#compare-diam-a', el => el.textContent.trim()).catch(() => 'n/a');
const nameB = await p.$eval('#compare-name-b', el => el.textContent.trim()).catch(() => 'n/a');
const diamB = await p.$eval('#compare-diam-b', el => el.textContent.trim()).catch(() => 'n/a');
const canvasH = await p.$eval('#compare-canvas', el => el.offsetHeight).catch(() => 0);
const canvasW = await p.$eval('#compare-canvas', el => el.offsetWidth).catch(() => 0);

console.log('card-compare visible:', compareVisible);
console.log('dropdown visible:', dropdownVisible);
console.log('dropdown value:', dropdownValue);
console.log('dropdown options:', dropdownOptions);
console.log('nameA:', nameA, '| diamA:', diamA);
console.log('nameB:', nameB, '| diamB:', diamB);
console.log('compare-canvas size:', canvasW, 'x', canvasH);

// Change dropdown to first non-Earth option
if (dropdownOptions.length > 1) {
  const newVal = dropdownOptions.find(v => v !== dropdownValue) || dropdownOptions[0];
  await p.selectOption('#compare-select', newVal);
  await p.waitForTimeout(500);
  const nameB2 = await p.$eval('#compare-name-b', el => el.textContent.trim()).catch(() => 'n/a');
  const diamB2 = await p.$eval('#compare-diam-b', el => el.textContent.trim()).catch(() => 'n/a');
  console.log('After dropdown change -> nameB:', nameB2, '| diamB:', diamB2);
  await p.screenshot({ path: 'qa-sis54-compare-changed.png' });
}

// Close card
await p.$eval('#card-close', el => el.click()).catch(() => {});
await p.waitForTimeout(1500);
const cardHiddenAfterClose = await p.isHidden('#planet-card');
console.log('Card hidden after close:', cardHiddenAfterClose);

console.log('Console errors:', JSON.stringify(errs));

await b.close();
