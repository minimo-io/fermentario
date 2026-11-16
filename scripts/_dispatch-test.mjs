import { chromium, webkit } from 'playwright-core';
const b = await webkit.launch();
const p = await b.newPage();
await p.setContent('<iframe srcdoc="<body><p>hi</p></body>"></iframe>');
const f = p.frames()[1];
const r = await f.evaluate(() => {
	let got = '';
	document.addEventListener('touchend', () => { got = 'yes'; }, true);
	try { document.dispatchEvent(new Event('touchend', { bubbles: true })); } catch (e) { return 'throw: ' + e.message; }
	return got;
});
console.log('dispatch-in-srcdoc:', r);
await b.close();
