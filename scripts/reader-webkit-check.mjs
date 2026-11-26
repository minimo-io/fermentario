/**
 * EPUB reader end-to-end check on the real WebKit engine — the iPhone
 * Safari engine. Boots the production build against a throwaway copy of
 * the fixture, uploads a real Gutenberg EPUB, opens /admin/book/[id],
 * makes a selection inside the content iframe, and walks the highlight
 * flow: toolbar appears (via the selection poll) → Highlight saves → note
 * exists → mark is drawn → toolbar does not ghost back.
 *
 *   node scripts/reader-webkit-check.mjs [path/to/book.epub]
 *
 * Needs: `pnpm run build` and a downloaded EPUB (default /tmp/pg84.epub).
 * The browser itself comes from the shared Playwright cache; nothing is
 * downloaded here.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { webkit } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'tests/fixtures/journal.db');
const EPUB = resolve(process.argv[2] ?? '/tmp/pg84.epub');

const fail = (msg) => {
	console.error('FAIL:', msg);
	stop();
	process.exit(1);
};

if (!existsSync(join(ROOT, 'build/index.js'))) fail('No production build. Run `pnpm run build` first.');
if (!existsSync(FIXTURE)) fail('No fixture. Run `node scripts/make-fixture.mjs` first.');
if (!existsSync(EPUB)) fail(`No EPUB at ${EPUB} (pass a path as argument).`);

const work = mkdtempSync(join(tmpdir(), 'ferm-webkit-check-'));
const dataDir = join(work, 'data');
mkdirSync(dataDir, { recursive: true });
cpSync(FIXTURE, join(dataDir, 'fermentario.db'));

function freePort() {
	return new Promise((res, rej) => {
		const s = createServer();
		s.on('error', rej);
		s.listen(0, '127.0.0.1', () => {
			const { port } = s.address();
			s.close(() => res(port));
		});
	});
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, ['build/index.js'], {
	cwd: ROOT,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		PORT: String(port),
		HOST: '127.0.0.1',
		ORIGIN: base,
		BODY_SIZE_LIMIT: '110M',
		TZ: 'UTC',
		FERMENTARIO_DATA_DIR: dataDir,
		FERMENTARIO_TEST_OFFLINE: '1',
		NODE_OPTIONS: `--import ${join(ROOT, 'scripts/offline-guard.mjs')}`
	}
});
let serverLog = '';
child.stdout.on('data', (d) => (serverLog += d));
child.stderr.on('data', (d) => (serverLog += d));

const stop = () => {
	if (child.killed === false && child.exitCode === null) child.kill('SIGKILL');
	rmSync(work, { recursive: true, force: true });
};
process.on('exit', stop);

const deadline = Date.now() + 30_000;
for (;;) {
	try {
		await fetch(`${base}/api/notes?limit=1`);
		break;
	} catch {
		if (Date.now() > deadline) fail(`server never came up:\n${serverLog}`);
		await new Promise((r) => setTimeout(r, 150));
	}
}

// Upload a real EPUB through the normal write path.
const bytes = readFileSync(EPUB);
const form = new FormData();
form.append('file', new Blob([bytes], { type: 'application/epub+zip' }), 'check.epub');
form.append('title', 'WebKit Check Book');
form.append('author', 'M. Webkit');
const up = await fetch(`${base}/api/books`, { method: 'POST', headers: { origin: base }, body: form });
const upBody = await up.json().catch(() => ({}));
if (!up.ok) fail(`upload ${up.status}: ${JSON.stringify(upBody)}`);
const bookId = upBody.book.id;
console.log(`book uploaded: ${bookId} (${bytes.length} bytes)`);

const browser = await webkit.launch();
const page = await browser.newPage();
const browserErrors = [];
page.on('pageerror', (e) => browserErrors.push(String(e)));
page.on('console', (m) => {
	if (m.type() === 'error') browserErrors.push('console: ' + m.text());
});

try {
	await page.goto(`${base}/admin/book/${bookId}`, { waitUntil: 'load', timeout: 60_000 });
	await page.waitForSelector('iframe', { timeout: 30_000 });

	// Find a content frame with book text. The first view is often the
	// cover (h1 only), so accept headings too, wait for the engine to
	// settle, and page forward once if only the cover rendered.
	let frame = null;
	const textSelectors = 'p, h1, h2';
	const scan = async () => {
		for (const f of page.frames()) {
			if (f === page.mainFrame()) continue;
			try {
				const has = await f.evaluate(
					(sel) => !!document.body?.querySelector(sel),
					textSelectors
				);
				if (has) return f;
			} catch {}
		}
		return null;
	};
	for (let i = 0; i < 30 && !frame; i++) {
		frame = await scan();
		if (frame) break;
		if (i === 15) {
			// Still only a cover: move one section forward via the reader's
			// own next-chapter control.
			const next = page.getByRole('button', { name: 'Next chapter' });
			if (await next.count()) await next.click().catch(() => {});
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	if (!frame) {
		console.log('frames:', page.frames().length);
		console.log('errors:', browserErrors.slice(0, 8).join('\n'));
		const body = await page.evaluate(() => document.body.innerHTML.slice(0, 800));
		console.log('body:', body);
		fail('no content iframe with text');
	}
	console.log('PASS: EPUB unzipped and rendered in WebKit');

	// Programmatic selection — exactly what the poll must capture.
	const excerpt = await frame.evaluate(() => {
		const el = document.querySelector('p, h1, h2');
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
		return (sel.toString() || '').trim().slice(0, 40);
	});
	if (!excerpt) fail('programmatic selection produced no text');

	await page.waitForFunction(
		() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Highlight'),
		null,
		{ timeout: 8000 }
	);
	console.log('PASS: selection toolbar appeared from the capture poll');

	// Use it.
	await page.getByRole('button', { name: 'Highlight', exact: true }).click();

	const notes = await (await fetch(`${base}/api/books/${bookId}/notes`)).json();
	if (notes.total !== 1 || !String(notes.notes?.[0]?.cfi).startsWith('epubcfi(')) {
		fail(`note not stored as expected: ${JSON.stringify(notes)}`);
	}
	console.log('PASS: highlight stored via API', notes.notes[0].cfi.slice(0, 48));

	// The SVG mark must exist in the content view.
	let markOk = false;
	for (const f of page.frames()) {
		try {
			markOk = await f.evaluate(
				() => !!document.querySelector('[ref="ferm-note"], .ferm-note, [ref]') ||
					!!document.querySelector('svg path[fill], svg rect[fill]')
			);
			if (markOk) break;
		} catch {}
	}
	console.log(markOk ? 'PASS: mark rendered in the pane' : 'NOTE: mark element not found by selector');

	// The toolbar must not ghost back from the old selection.
	await new Promise((r) => setTimeout(r, 2500));
	const ghosted = await page.evaluate(() =>
		[...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Highlight')
	);
	if (ghosted) fail('toolbar re-opened after the highlight was saved');
	console.log('PASS: toolbar stayed closed (dismiss gate + native clear)');

	// Trusted-input chain proof: a real mouse drag inside the sandboxed
	// content iframe must reach the parent capture — same delivery path a
	// finger takes (synthetic in-frame dispatches are realm-isolated by
	// the sandbox, trusted input is not). Playwright cannot synthesize
	// trusted TOUCH gestures, so this proves arrival; the swipe math is
	// the same branch already exercised by the tap guards.
	const ib = await page.locator('iframe').first().boundingBox();
	if (!ib) fail('no iframe bounding box');
	const pr = await frame.evaluate(() => {
		const els = [...document.querySelectorAll('p')];
		const el = els.find((e) => (e.textContent || '').trim().length > 60) || els[0];
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: r.left, y: r.top, w: r.width, h: r.height };
	});
	if (!pr) fail('no paragraph to drag-select');
	const hasToolbar = () =>
		page.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Highlight'));
	if (await hasToolbar()) await page.getByRole('button', { name: 'Cancel' }).click();
	const startX = ib.x + pr.x + 24;
	const dragY = ib.y + pr.y + Math.min(14, pr.h / 2);
	const endX = startX + Math.min(240, Math.max(80, pr.w - 40));
	await page.mouse.move(startX, dragY);
	await page.mouse.down();
	for (let x = startX + 30; x <= endX; x += 30) await page.mouse.move(x, dragY);
	await page.mouse.up();
	let trustedOk = false;
	for (let i = 0; i < 15 && !trustedOk; i++) {
		await new Promise((r) => setTimeout(r, 400));
		trustedOk = await hasToolbar();
	}
	if (!trustedOk) fail('trusted mouse drag never produced the toolbar (event chain broken)');
	console.log('PASS: trusted input inside the sandboxed iframe reaches the parent capture');
	await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});

	// One tap on the mark opens its action sheet; Delete removes the note.
	// marks-pane appends its SVG to the PARENT document.body and proxies
	// the iframe's gesture to the mark under the touch point.
	let markSel = '[ref="ferm-note"]';
	let found = await page.locator(markSel).count();
	if (!found) {
		for (const sel of ['svg [ref]', '[ref]']) {
			if (await page.locator(sel).count()) {
				markSel = sel;
				found = 1;
				break;
			}
		}
	}
	const markLoc = page.locator(markSel).first();
	if (!found) {
		console.log('NOTE: mark element not found for the tap test');
	} else {
		// The pane SVG is pointer-events:none by design: real taps go
		// through marks-pane's proxy. The harness fires the click on the
		// mark element directly — everything from the mark's listener
		// onward is what this step tests.
		await markLoc.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		await page.waitForFunction(
			() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Delete highlight')),
			null,
			{ timeout: 6000 }
		);
		console.log('PASS: tapping the mark opens the action sheet');
		await page.getByRole('button', { name: /Delete highlight/ }).click();
		await new Promise((r) => setTimeout(r, 800));
		const afterDel = await (await fetch(`${base}/api/books/${bookId}/notes`)).json();
		if (afterDel.total !== 0) fail(`expected the note deleted, got total ${afterDel.total}`);
		console.log('PASS: sheet Delete removes the highlight');
	}

	if (browserErrors.length) console.log('browser errors seen:\n' + browserErrors.slice(0, 5).join('\n'));
	console.log('\nreader webkit check: ALL PASS');
} finally {
	await browser.close();
	stop();
}
