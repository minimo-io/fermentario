import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { webkit } from 'playwright-core';
const ROOT = '/Users/minimo/Development/minimo/fermentario';
const work = mkdtempSync(join(tmpdir(), 'swd-'));
const dataDir = join(work, 'data'); const modelCache = join(work, 'models');
mkdirSync(dataDir, { recursive: true }); mkdirSync(modelCache, { recursive: true });
cpSync(join(ROOT,'tests/fixtures/journal.db'), join(dataDir, 'fermentario.db'));
const port = await new Promise((res, rej) => { const s = createServer(); s.on('error', rej); s.listen(0,'127.0.0.1',()=>{const {port}=s.address(); s.close(()=>res(port));}); });
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['build/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST:'127.0.0.1', ORIGIN: base, TZ:'UTC', FERMENTARIO_DATA_DIR: dataDir, FERMENTARIO_MODEL_CACHE: modelCache, FERMENTARIO_TEST_OFFLINE:'1', NODE_OPTIONS:`--import ${join(ROOT,'scripts/offline-guard.mjs')}` }, stdio:'pipe' });
for (;;) { try { await fetch(`${base}/api/status`); break; } catch { await new Promise(r=>setTimeout(r,150)); } }
const bytes = readFileSync('/tmp/pg84.epub');
const form = new FormData(); form.append('file', new Blob([bytes],{type:'application/epub+zip'}),'c.epub'); form.append('title','Diag'); form.append('author','D');
const { book } = await (await fetch(`${base}/api/books`, { method:'POST', headers:{origin:base}, body:form })).json();
const browser = await webkit.launch(); const page = await browser.newPage();
page.on('console', m => console.log('[console]', m.type(), m.text().slice(0,160)));
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0,200)));
await page.goto(`${base}/admin/book/${book.id}`, { waitUntil:'load' });
await page.waitForSelector('iframe', { timeout: 30000 });
// wait until a frame really has a paragraph (contents attached)
let textFrame = null;
for (let i=0;i<40 && !textFrame;i++) {
	await new Promise(r=>setTimeout(r,500));
	for (const f of page.frames()) { if (f===page.mainFrame()) continue; try { if (await f.evaluate(()=>!!document.body?.querySelector('p, h1, h2'))) { textFrame=f; break; } } catch {} }
}
console.log('textFrame found:', !!textFrame);
if (!textFrame) {
	const next = page.getByRole('button', { name: 'Next chapter' });
	for (let i=0;i<6 && !textFrame;i++) {
		if (await next.count()) await next.first().click().catch(()=>{});
		await new Promise(r=>setTimeout(r,1500));
		for (const f of page.frames()) { if (f===page.mainFrame()) continue; try { if (await f.evaluate(()=>!!document.body?.querySelector('p, h1, h2'))) { textFrame=f; break; } } catch {} }
	}
	console.log('textFrame after paging:', !!textFrame);
}
console.log('frames:', page.frames().length);
for (const f of page.frames()) { try { const info = await f.evaluate(() => ({ url: location.href.slice(0,40), txt: (document.body?.innerText||'').trim().slice(0,60) })); console.log('FRAME', JSON.stringify(info)); } catch(e){ console.log('FRAME ERR', String(e).slice(0,80)); } }
// dispatch swipe

if (textFrame) {
	await textFrame.evaluate(() => {
		window.__fired = [];
		document.addEventListener('touchstart', () => window.__fired.push('start'), true);
		document.addEventListener('touchend', () => window.__fired.push('end'), true);
		const mk = (type, x) => { const ev = new Event(type,{bubbles:true,cancelable:true}); const t={identifier:1,target:document.body,clientX:x,clientY:150}; Object.defineProperty(ev,'changedTouches',{value:[t]}); Object.defineProperty(ev,'touches',{value: type==='touchend'?[]:[t]}); return ev; };
		document.dispatchEvent(mk('touchstart',320)); document.dispatchEvent(mk('touchmove',220)); document.dispatchEvent(mk('touchend',60));
	});
	console.log('swipe dispatched, doc heard:', await textFrame.evaluate(() => window.__fired));
	console.log('inline probe:', await textFrame.evaluate(() => {
		let got = '';
		document.addEventListener('touchend', () => { got = 'yes'; }, true);
		try { document.dispatchEvent(new Event('touchend', { bubbles: true })); } catch (e) { return 'throw: ' + e.message; }
		return { got, body: document.body?.firstElementChild?.tagName ?? null, scriptsBlocked: !!window.epub?.js ? 'n/a' : 'n/a' };
	}));
	await new Promise(r=>setTimeout(r,2500));
	for (const f of page.frames()) { try { const info = await f.evaluate(() => ({ txt: (document.body?.innerText||'').trim().slice(0,60) })); console.log('AFTER', JSON.stringify(info)); } catch { } }
	// button sanity
	const next = page.getByRole('button', { name: 'Next chapter' });
	console.log('next button count:', await next.count());
	if (await next.count()) { await next.first().click(); await new Promise(r=>setTimeout(r,2000)); for (const f of page.frames()) { try { console.log('BTN', JSON.stringify(await f.evaluate(() => ({ txt: (document.body?.innerText||'').trim().slice(0,60) })))); } catch {} } }
}
await browser.close(); child.kill('SIGKILL'); rmSync(work,{recursive:true,force:true});
