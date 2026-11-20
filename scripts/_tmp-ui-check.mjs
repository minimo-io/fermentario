import { chromium } from 'playwright-core';

const browser = await chromium.launch({
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true
});
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
await page.goto('http://localhost:4173/admin/businesses/trading/ripio', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const all = await page.locator('body').innerText();
const ls = all.split('\n').map((l) => l.trim()).filter(Boolean);
const card = page.locator('[aria-label="Open BTC details"]');
console.log('--- card');
console.log((await card.innerText()).replace(/\n+/g, ' | '));

await page.getByRole('button', { name: 'Open BTC details' }).click();
await page.waitForTimeout(800);
const dlg = await page.getByRole('dialog').first().innerText();
console.log('--- detail modal');
console.log(dlg.replace(/\n+/g, ' | '));

await browser.close();
