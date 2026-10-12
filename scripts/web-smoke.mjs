/**
 * Regression smoke test for the web app.
 *
 * This is the "it still works exactly as before" gate. It boots the production
 * build (`node build`) on a temporary port against a throwaway copy of the
 * frozen fixture, exercises every page and every API route, and compares the
 * recorded result with `tests/baseline/web.json`.
 *
 * Rules that keep it a real gate:
 *  - The real `data/fermentario.db` is never touched. Every run copies the
 *    fixture into a temp directory and points the server at that.
 *  - Nothing is downloaded. `scripts/offline-guard.mjs` rejects requests to the
 *    Hugging Face hosts, so the background indexing and tagging passes fail
 *    fast instead of pulling 22 MB of weights.
 *  - `TZ=UTC` fixes the heatmap day keys, which are computed with
 *    `localtime` and would otherwise differ per machine.
 *  - The model cache points at an empty temp directory, so nothing loads a
 *    488 MB model into memory.
 *
 *   node scripts/web-smoke.mjs            compare against the golden
 *   node scripts/web-smoke.mjs --update   rewrite the golden
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import Database from 'better-sqlite3';

const ROOT = resolve(import.meta.dirname, '..');
const GOLDEN = join(ROOT, 'tests/baseline/web.json');
const FIXTURE = join(ROOT, 'tests/fixtures/journal.db');
const UPDATE = process.argv.includes('--update');

if (!existsSync(join(ROOT, 'build/index.js'))) {
	console.error('No production build. Run `pnpm run build` first.');
	process.exit(1);
}
if (!existsSync(FIXTURE)) {
	console.error('No fixture. Run `node scripts/make-fixture.mjs` first.');
	process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'ferm-smoke-'));
const dataDir = join(work, 'data');
const modelCache = join(work, 'models');
mkdirSync(dataDir, { recursive: true });
mkdirSync(modelCache, { recursive: true });
cpSync(FIXTURE, join(dataDir, 'fermentario.db'));

/** Values created during the run: replaced by placeholders in the output so
 *  the golden stays stable while the assertions still see the real values. */
const volatile = new Set();
const mask = (value) => {
	if (typeof value === 'string') {
		if (volatile.has(value)) return '<runtime>';
		// The temp directory leaks into /api/status as the model cache path.
		return value.split(work).join('<workdir>');
	}
	if (typeof value === 'number') return volatile.has(value) ? '<runtime>' : value;
	if (Array.isArray(value)) return value.map(mask);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v)]));
	}
	return value;
};

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

const child = spawn(process.execPath, ['--unhandled-rejections=warn', join(ROOT, 'build/index.js')], {
	cwd: ROOT,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		PORT: String(port),
		HOST: '127.0.0.1',
		TZ: 'UTC',
		FERMENTARIO_DATA_DIR: dataDir,
		FERMENTARIO_MODEL_CACHE: modelCache,
		// A build-time flag, not app code: the guard only exists in the child.
		FERMENTARIO_TEST_OFFLINE: '1',
		NODE_OPTIONS: `--import ${join(ROOT, 'scripts/offline-guard.mjs')}`
	}
});
let serverLog = '';
child.stdout.on('data', (d) => (serverLog += d));
child.stderr.on('data', (d) => (serverLog += d));

const stop = () => {
	if (!child.killed) child.kill('SIGKILL');
	rmSync(work, { recursive: true, force: true });
};
process.on('exit', stop);

// Wait for the port to answer.
const deadline = Date.now() + 30_000;
for (;;) {
	try {
		await fetch(`${base}/api/status`);
		break;
	} catch {
		if (Date.now() > deadline) {
			console.error('Server never came up:\n' + serverLog);
			stop();
			process.exit(1);
		}
		await new Promise((r) => setTimeout(r, 150));
	}
}

const results = [];
async function api(name, path, init) {
	const res = await fetch(`${base}${path}`, init);
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	// Recorded raw. Masking happens once at the end, because a value only
	// becomes known as "runtime" after the response that carried it — the
	// updated_at of an edited note, for example.
	results.push([name, { status: res.status, body }]);
	return { status: res.status, body, text, headers: res.headers };
}

async function page(name, path, probes) {
	const res = await fetch(`${base}${path}`);
	const html = await res.text();
	results.push([
		name,
		{
			status: res.status,
			bytes: html.length > 0,
			// The app is client-rendered: the server sends an empty shell. If a
			// future change starts putting note text in the HTML, the golden
			// flags it so the change is a decision, not an accident.
			hasNoteText: html.includes('kayaking'),
			hasTagName: html.includes('>garden<') || html.includes('/tags/garden'),
			// The single page width from task 017.
			hasPageWidth: html.includes('max-w-2xl')
		}
	]);
	return res.status;
}

const json = (b, method = 'POST') => ({
	method,
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(b)
});

/** Fail with the recorded response instead of a TypeError further down. */
function must(name, res, predicate, what) {
	if (!predicate(res)) {
		console.error(`\n${name}: expected ${what}`);
		console.error(`  status ${res.status} body ${JSON.stringify(res.body)}`);
		console.error('\nRecorded so far:');
		console.error(JSON.stringify(Object.fromEntries(results), null, '\t'));
		stop();
		process.exit(1);
	}
}

// --- Pages -----------------------------------------------------------------
await page('page:/', '/');
await page('page:/heatmap', '/heatmap');
await page('page:/tags/garden', '/tags/garden');
await page('page:/tags/missing', '/tags/does-not-exist');
// The diagnostics page is client-rendered but must still return 200 from the
// server. A page that touches `window` at component init 500s here, which is
// exactly the bug this check was added for.
await page('page:/diagnostics', '/diagnostics');

// --- Read routes -----------------------------------------------------------
const status = await api('GET /api/status', '/api/status');
// Only the keys of the progress objects are kept: the values race with the
// background model passes, the contract does not. Rewritten in place on the
// raw record, before the final mask.
{
	const i = results.findIndex(([n]) => n === 'GET /api/status');
	results[i][1].body = {
		...results[i][1].body,
		progress: {
			embedder: Object.keys(results[i][1].body.progress?.embedder ?? {}).sort(),
			chat: Object.keys(results[i][1].body.progress?.chat ?? {}).sort()
		}
	};
}

const page1 = await api('GET /api/notes?limit=2', '/api/notes?limit=2');
const c = page1.body.nextCursor;
await api(
	'GET /api/notes?limit=2 page 2',
	`/api/notes?limit=2&before=${c.created_at}&before_id=${encodeURIComponent(c.id)}`
);
await api('GET /api/notes?tag=garden', '/api/notes?tag=garden');
await api('GET /api/notes?tag=missing', '/api/notes?tag=nosuchtag');
await api('GET /api/stats/heatmap', '/api/stats/heatmap');
await api('GET /api/asks', '/api/asks');
// The fixture notes are from 2025, so this week is empty and no model loads.
await api('GET /api/summary', '/api/summary');
await api('POST /api/chat empty', '/api/chat', json({ question: '' }));
await api('POST /api/status setModel', '/api/status', json({ kind: 'chatModel', id: 'nope' }));

// --- Write routes ----------------------------------------------------------
const created = await api(
	'POST /api/notes',
	'/api/notes',
	json({ content: 'Smoke test note about kayaking #garden' })
);
must('POST /api/notes', created, (r) => r.status === 201 && !!r.body.note, '201 with a note');
const id = created.body.note.id;
volatile.add(id);
volatile.add(created.body.note.created_at);
volatile.add(created.body.note.updated_at);

const edited = await api(
	'PATCH /api/notes/[id]',
	`/api/notes/${id}`,
	json({ content: 'Smoke test note, edited, about kayaking #work' }, 'PATCH')
);
must('PATCH /api/notes/[id]', edited, (r) => r.status === 200 && !!r.body.note, '200 with a note');
volatile.add(edited.body.note.updated_at);

await api('DELETE /api/notes/[id]/tags/[tag]', `/api/notes/${id}/tags/work`);
await api('DELETE /api/notes/[id]/tags/[missing]', `/api/notes/${id}/tags/nosuch`);
await api('POST /api/notes empty', '/api/notes', json({ content: '' }));
await api('POST /api/notes hashtags only', '/api/notes', json({ content: '#garden' }));
await api('PATCH /api/notes/missing', '/api/notes/does-not-exist', json({ content: 'x' }, 'PATCH'));
await api('DELETE /api/notes/[id]', `/api/notes/${id}`);
await api('DELETE /api/notes/[id] again', `/api/notes/${id}`);

const asks = await api('GET /api/asks before delete', '/api/asks');
const askId = asks.body.asks[0]?.id;
if (!askId) {
	console.error('\nGET /api/asks: expected the fixture to have one ask row');
	stop();
	process.exit(1);
}
await api('DELETE /api/asks/[id]', `/api/asks/${askId}`, { method: 'DELETE' });

// --- Export / import round trip -------------------------------------------
const exported = await fetch(`${base}/api/export`);
const bytes = Buffer.from(await exported.arrayBuffer());
const exportedPath = join(work, 'exported.db');
writeFileSync(exportedPath, bytes);

// Check the downloaded file is a real database with the expected rows, not
// just a 200. Byte comparison is not possible: the run creates fresh UUIDs.
let exportCheck;
try {
	const d = new Database(exportedPath, { readonly: true });
	exportCheck = {
		quickCheck: d.pragma('quick_check', { simple: true }),
		notes: d.prepare('SELECT COUNT(*) AS c FROM notes').get().c,
		vectors: d.prepare('SELECT COUNT(*) AS c FROM note_vectors').get().c,
		fts: d.prepare('SELECT COUNT(*) AS c FROM notes_fts').get().c
	};
	d.close();
} catch (e) {
	exportCheck = { error: String(e.message ?? e) };
}
results.push([
	'GET /api/export',
	{
		status: exported.status,
		contentType: exported.headers.get('content-type'),
		filename: (exported.headers.get('content-disposition') ?? '').replace(/\d{4}-\d{2}-\d{2}/, '<date>'),
		check: exportCheck
	}
]);

const form = new FormData();
form.append('file', new Blob([bytes]), 'exported.db');
// SvelteKit rejects a form POST whose origin does not match, so the request has
// to look like it came from the app itself. That protection is worth keeping, so
// the test satisfies it rather than disabling it.
const imported = await fetch(`${base}/api/import`, {
	method: 'POST',
	headers: { origin: base },
	body: form
});
const sse = await imported.text();
const events = sse
	.split('\n\n')
	.map((b) => b.replace(/^data: /, '').trim())
	.filter(Boolean)
	.map((line) => {
		try {
			return JSON.parse(line);
		} catch {
			return { unparsed: line };
		}
	});
results.push([
	'POST /api/import',
	{
		status: imported.status,
		contentType: imported.headers.get('content-type'),
		phases: events.filter((e) => e.phase).map((e) => e.phase),
		errors: events.filter((e) => e.error).map((e) => e.error),
		done: events.find((e) => e.done)?.counts ?? null
	}
]);

stop();

// One mask pass over everything, so a value is stable no matter which request
// revealed it.
const actual = mask(Object.fromEntries(results));
const text = JSON.stringify(actual, null, '\t') + '\n';

if (UPDATE) {
	mkdirSync(dirname(GOLDEN), { recursive: true });
	writeFileSync(GOLDEN, text);
	console.log(`golden written: ${GOLDEN} (${results.length} checks)`);
	process.exit(0);
}

if (!existsSync(GOLDEN)) {
	console.error(`No golden file. Run: node scripts/web-smoke.mjs --update`);
	process.exit(1);
}

const expected = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const before = JSON.stringify(Object.keys(expected));
if (JSON.stringify(results.map(([n]) => n)) !== before) {
	console.error('The set of checks changed. Re-run with --update and review the diff.');
	process.exit(1);
}

let failures = 0;
for (const name of Object.keys(expected)) {
	const a = JSON.stringify(expected[name]);
	const b = JSON.stringify(actual[name]);
	if (a !== b) {
		failures++;
		console.error(`\nDIFF ${name}\n  expected: ${a}\n  actual:   ${b}`);
	}
}

if (failures > 0) {
	console.error(`\n${failures}/${results.length} checks differ from the baseline.`);
	process.exit(1);
}
console.log(`web smoke: ${results.length}/${results.length} checks match the baseline.`);
