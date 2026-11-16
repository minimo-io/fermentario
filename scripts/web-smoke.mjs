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
 *    Hugging Face hosts, so the background indexing pass fails fast instead of
 *    pulling 22 MB of weights.
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
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

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
/** Action ids and times are fresh on every run: hide them from the golden. */
const rememberActions = (r) => {
	for (const a of r.body?.actions ?? []) {
		volatile.add(a.id);
		volatile.add(a.created_at);
	}
	return r;
};
const mask = (value) => {
	if (typeof value === 'string') {
		if (volatile.has(value)) return '<runtime>';
		// The temp directory leaks into /api/status as the model cache path,
		// and the random test port leaks into absolute URLs (canonical,
		// og:url, embedded server data). Both are runtime details. The
		// homepage record is raw SSR HTML, so the build's content-hashed
		// asset names and the SvelteKit nonce leak there too — all four are
		// artifacts of this build, not app behaviour.
		return value
			.split(work).join('<workdir>')
			.split(base).join('<base>')
			.split(base.replace('http://', 'ws://')).join('<base>')
			.replace(/__sveltekit_[A-Za-z0-9_]+/g, '__sveltekit_<nonce>')
			.replace(/\.[A-Za-z0-9_-]{8}\.(js|css)/g, '.<hashed>.$2');
	}
	// Zero is a real value — a count, a reading position index — never a fresh
	// id or timestamp, so masking it would hide a legitimate number.
	if (typeof value === 'number') return value !== 0 && volatile.has(value) ? '<runtime>' : value;
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

const child = spawn(process.execPath, ['--unhandled-rejections=warn', join(ROOT, 'scripts/start.mjs')], {
	cwd: ROOT,
	stdio: ['ignore', 'pipe', 'pipe'],
	env: {
		...process.env,
		PORT: String(port),
		HOST: '127.0.0.1',
		// adapter-node defaults the request origin to https. Without this the
		// form POST below fails the CSRF check and the restore path is never run.
		ORIGIN: base,
		// Match scripts/start.mjs so the restore route can accept a real backup.
		BODY_SIZE_LIMIT: '110M',
		TZ: 'UTC',
		FERMENTARIO_DATA_DIR: dataDir,
		FERMENTARIO_MODEL_CACHE: modelCache,
		// The relay is on this same server. Discovery and publish talk to it
		// instead of the public relays, so the test never touches the network.
		FERMENTARIO_NOSTR_RELAYS: `ws://127.0.0.1:${port}/relay`,
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

// The first request above must have imported the legacy file into the journal
// layout and removed the old path. Without this the smoke test would still
// pass while the app quietly kept writing to data/fermentario.db.
if (existsSync(join(dataDir, 'fermentario.db'))) {
	console.error('Legacy data/fermentario.db still exists after first boot.');
	stop();
	process.exit(1);
}
try {
	const registry = new Database(join(dataDir, 'registry.db'), { readonly: true });
	const activeId = registry.prepare("SELECT value FROM app_state WHERE key = 'active_journal_id'").get()?.value;
	const journal = activeId
		? registry.prepare('SELECT * FROM journals WHERE id = ?').get(activeId)
		: null;
	registry.close();
	if (!journal || journal.state !== 'active' || journal.schema_version !== 34) {
		console.error('The legacy import did not register an active v34 journal: ' + JSON.stringify(journal));
		stop();
		process.exit(1);
	}
} catch (err) {
	console.error('Registry check failed: ' + err.message);
	stop();
	process.exit(1);
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
			hasPageWidth: html.includes('max-w-2xl'),
			// Chrome that must match the route. A mini app under /admin is not a
			// section: it must show no selected section pill and no composer.
			hasComposer: html.includes('composer-field'),
			selectedSections: [...html.matchAll(/data-section="([^"]+)"[^>]*aria-selected="true"/g)].map((m) => m[1])
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
// `/` is the public homepage now (200, published feed). Old section URLs
// 307 to their `/admin` twins.
const rootPage = await api('GET / homepage', '/');
must('GET / homepage', rootPage, (r) => r.status === 200, '200 with the public feed');
await page('page:/', '/');
const notesRedirect = await api('GET /notes redirect', '/notes', { redirect: 'manual' });
must(
	'GET /notes redirect',
	notesRedirect,
	(r) => r.status === 307 && r.headers.get('location') === '/admin/notes',
	'307 to /admin/notes'
);
await page('page:/admin/notes', '/admin/notes');
await page('page:/admin/todo', '/admin/todo');
await page('page:/admin/time-tracker', '/admin/time-tracker');
await page('page:/admin/stocks', '/admin/stocks');
const bizRedirect = await api('GET /businesses redirect', '/businesses', { redirect: 'manual' });
must(
	'GET /businesses redirect',
	bizRedirect,
	(r) => r.status === 307 && r.headers.get('location') === '/admin/businesses/trading/b3',
	'307 to /admin/businesses/trading/b3'
);
const bizTradingRedirect = await api('GET /businesses/trading redirect', '/businesses/trading', { redirect: 'manual' });
must(
	'GET /businesses/trading redirect',
	bizTradingRedirect,
	(r) => r.status === 307 && r.headers.get('location') === '/admin/businesses/trading/b3',
	'307 to /admin/businesses/trading/b3'
);
await page('page:/admin/businesses/trading/b3', '/admin/businesses/trading/b3');
await page('page:/admin/heatmap', '/admin/heatmap');
await page('page:/admin/tags/garden', '/admin/tags/garden');
await page('page:/admin/tags/missing', '/admin/tags/does-not-exist');
// The diagnostics page is client-rendered but must still return 200 from the
// server. A page that touches `window` at component init 500s here, which is
// exactly the bug this check was added for.
await page('page:/admin/diagnostics', '/admin/diagnostics');

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

const published = await api(
	'PATCH /api/notes/[id] published',
	`/api/notes/${id}`,
	json({ published: true }, 'PATCH')
);
must(
	'PATCH /api/notes/[id] published',
	published,
	(r) => r.status === 200 && r.body.note?.published === true,
	'200 with a published note'
);
await api('GET /api/public/notes', '/api/public/notes');
await api('GET /api/public/notes/[id]', `/api/public/notes/${id}`);
await page('page:/notes/[id]', `/notes/${id}`);
await page('page:/admin/notes/[id]', `/admin/notes/${id}`);

// Public config is a separate, safe namespace. Exercise write/read/disable,
// then reset it so the remaining public checks keep the default shape.
const publicConfigPatch = await api(
	'PATCH /api/config/public',
	'/api/config/public',
	json(
		{ siteTitle: 'Smoke Config', description: 'Smoke public description', notesEnabled: false, showCoverImages: false },
		'PATCH'
	)
);
must(
	'PATCH /api/config/public',
	publicConfigPatch,
	(r) =>
		r.status === 200 &&
		r.body.publicConfig?.siteTitle === 'Smoke Config' &&
		r.body.publicConfig?.description === 'Smoke public description' &&
		r.body.publicConfig?.notesEnabled === false &&
		r.body.publicConfig?.showCoverImages === false,
	'200 with the sanitized public config'
);
volatile.add(publicConfigPatch.body.publicConfig.updatedAt);
const publicConfigRead = await api('GET /api/public/config', '/api/public/config');
must(
	'GET /api/public/config',
	publicConfigRead,
	(r) => r.status === 200 && r.body.publicConfig?.siteTitle === 'Smoke Config' && r.body.publicConfig?.notesEnabled === false,
	'200 with the public config'
);
const disabledPublicNotes = await api('GET /api/public/notes disabled', '/api/public/notes');
must(
	'GET /api/public/notes disabled',
	disabledPublicNotes,
	(r) => r.status === 200 && r.body.notes?.length === 0 && r.body.hasMore === false,
	'200 with an empty public feed while notes are disabled'
);
const disabledPublicNote = await api('GET /api/public/notes/[id] disabled', `/api/public/notes/${id}`);
must(
	'GET /api/public/notes/[id] disabled',
	disabledPublicNote,
	(r) => r.status === 404,
	'404 while public notes are disabled'
);
const disabledHome = await fetch(`${base}/`);
must('GET / disabled', { status: disabledHome.status }, (r) => r.status === 200, '200 homepage while disabled');
await disabledHome.arrayBuffer();
const publicConfigReset = await api(
	'PATCH /api/config/public reset',
	'/api/config/public',
	json(
		{ siteTitle: 'fermentario', description: 'Published notes.', notesEnabled: true, showCoverImages: true },
		'PATCH'
	)
);
must(
	'PATCH /api/config/public reset',
	publicConfigReset,
	(r) => r.status === 200 && r.body.publicConfig?.siteTitle === 'fermentario' && r.body.publicConfig?.notesEnabled === true,
	'200 with the default public config restored'
);
volatile.add(publicConfigReset.body.publicConfig.updatedAt);

// Covers ride with the note: upload, serve bytes, then reference by id.
const TINY_COVER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const cover = await api(
	'POST /api/notes/[id]/photo',
	`/api/notes/${id}/photo`,
	json({ photo: TINY_COVER })
);
must('POST /api/notes/[id]/photo', cover, (r) => r.status === 201 && !!r.body.id, '201 with a cover id');
volatile.add(cover.body.id);
volatile.add(cover.body.created_at);
const coverPhoto = await fetch(`${base}/api/notes/photos/${cover.body.id}`);
const coverBytes = new Uint8Array(await coverPhoto.arrayBuffer());
results.push([
	'GET /api/notes/photos/[photoId]',
	{ status: coverPhoto.status, contentType: coverPhoto.headers.get('content-type'), bytes: coverBytes.length }
]);
must(
	'GET /api/notes/photos/[photoId]',
	{ status: coverPhoto.status, body: { contentType: coverPhoto.headers.get('content-type'), bytes: coverBytes.length } },
	(r) => r.status === 200 && r.body.contentType === 'image/png' && r.body.bytes > 0,
	'200 with the stored cover bytes'
);
await api('GET /api/notes/[id] cover', `/api/notes/${id}`);

// Server-rendered public pages carry the published text as HTML.
const homeHtml = await (await fetch(`${base}/`)).text();
must('GET / SSR feed', { body: homeHtml }, (r) => r.body.includes('kayaking'), 'homepage HTML contains the published note');
const noteHtml = await (await fetch(`${base}/notes/${id}`)).text();
must('GET /notes/[id] SSR', { body: noteHtml }, (r) => r.body.includes('kayaking'), 'note HTML contains its content');

await api('DELETE /api/notes/[id]/tags/[tag]', `/api/notes/${id}/tags/work`);
await api('DELETE /api/notes/[id]/tags/[missing]', `/api/notes/${id}/tags/nosuch`);
await api('POST /api/notes empty', '/api/notes', json({ content: '' }));
await api('POST /api/notes hashtags only', '/api/notes', json({ content: '#garden' }));
await api('PATCH /api/notes/missing', '/api/notes/does-not-exist', json({ content: 'x' }, 'PATCH'));
await api('GET /api/notes/[id]', `/api/notes/${id}`);
await api('GET /api/notes/[missing]', '/api/notes/does-not-exist');
await api('DELETE /api/notes/[id]', `/api/notes/${id}`, { method: 'DELETE' });
await api('DELETE /api/notes/[id] again', `/api/notes/${id}`, { method: 'DELETE' });

const asks = await api('GET /api/asks before delete', '/api/asks');
const askId = asks.body.asks[0]?.id;
if (!askId) {
	console.error('\nGET /api/asks: expected the fixture to have one ask row');
	stop();
	process.exit(1);
}
await api('DELETE /api/asks/[id]', `/api/asks/${askId}`, { method: 'DELETE' });

// --- Data that must survive the export/import round trip -------------------
// The fixture has notes only. Create one row in every other section so a
// restore that silently skips a table fails the checks below.
const noteIdForComment = page1.body.notes[0].id;
const flagged = await api(
	'PATCH /api/notes/[id] featured+video',
	`/api/notes/${noteIdForComment}`,
	json({ featured: true, video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, 'PATCH')
);
must(
	'PATCH /api/notes/[id] featured+video',
	flagged,
	(r) => r.status === 200 && r.body.note?.featured === true && r.body.note?.video === 'dQw4w9WgXcQ',
	'200 with a featured note and a video id'
);

const noteComment = await api(
	'POST /api/notes/[id]/comments',
	`/api/notes/${noteIdForComment}/comments`,
	json({ content: 'Note comment that must survive a restore' })
);
must('POST /api/notes/[id]/comments', noteComment, (r) => r.status === 201, '201');
volatile.add(noteComment.body.comment.id);
volatile.add(noteComment.body.comment.created_at);

const pinnedNoteComment = await api(
	'PATCH /api/notes/[id]/comments/[commentId] pinned',
	`/api/notes/${noteIdForComment}/comments/${noteComment.body.comment.id}`,
	json({ pinned: true }, 'PATCH')
);
must(
	'PATCH /api/notes/[id]/comments/[commentId] pinned',
	pinnedNoteComment,
	(r) =>
		r.status === 200 &&
		r.body.comment?.pinned === true &&
		r.body.comment?.content === 'Note comment that must survive a restore',
	'200 with the comment pinned'
);

const group = await api('POST /api/todo/groups', '/api/todo/groups', json({ name: 'Restore group' }));
must('POST /api/todo/groups', group, (r) => r.status === 201 && !!r.body.group, '201 with a group');
const groupId = group.body.group.id;
volatile.add(groupId);
volatile.add(group.body.group.created_at);

const item = await api(
	'POST /api/todo/groups/[id]/items',
	`/api/todo/groups/${groupId}/items`,
	json({ content: 'Task that must survive a restore #trip', video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
);
must('POST /api/todo/groups/[id]/items', item, (r) => r.status === 201 && !!r.body.item && r.body.item.video === 'dQw4w9WgXcQ', '201 with an item and a video id');
const itemId = item.body.item.id;
volatile.add(itemId);
volatile.add(item.body.item.created_at);
volatile.add(item.body.item.updated_at);

const itemVideo = await api(
	'PATCH /api/todo/items/[id] video',
	`/api/todo/items/${itemId}`,
	json({ video: 'https://www.youtube.com/watch?v=9bZkp7q19f0' }, 'PATCH')
);
must('PATCH /api/todo/items/[id] video', itemVideo, (r) => r.status === 200 && r.body.item?.video === '9bZkp7q19f0', '200 with the new video id');
volatile.add(itemVideo.body.item.updated_at);

const taskComment = await api(
	'POST /api/todo/items/[id]/comments',
	`/api/todo/items/${itemId}/comments`,
	json({ content: 'Task comment that must survive a restore' })
);
must('POST /api/todo/items/[id]/comments', taskComment, (r) => r.status === 201, '201');
volatile.add(taskComment.body.comment.id);
volatile.add(taskComment.body.comment.created_at);

const principle = await api(
	'POST /api/principles',
	'/api/principles',
	json({ content: 'Principle that must survive a restore #trip' })
);
must('POST /api/principles', principle, (r) => r.status === 201 && !!r.body.principle, '201 with a principle');
const principleId = principle.body.principle.id;
volatile.add(principleId);
volatile.add(principle.body.principle.created_at);

const principleComment = await api(
	'POST /api/principles/[id]/comments',
	`/api/principles/${principleId}/comments`,
	json({ content: 'Principle comment that must survive a restore' })
);
must('POST /api/principles/[id]/comments', principleComment, (r) => r.status === 201, '201');
volatile.add(principleComment.body.comment.id);
volatile.add(principleComment.body.comment.created_at);

// --- Stocks ---------------------------------------------------------------
// A 1x1 PNG. Small enough to stay inline, real enough to exercise the bytes.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const consumable = await api(
	'POST /api/stocks/items consumable',
	'/api/stocks/items',
	json({
		kind: 'consumable',
		name: 'Toothpaste',
		brand: 'Colgate',
		category: 'Toothpaste',
		note: 'Mint, sensitive',
		quantity: 2,
		package_size: 100,
		package_unit: 'g',
		photos: [TINY_PNG, TINY_PNG]
	})
);
must(
	'POST /api/stocks/items consumable',
	consumable,
	(r) =>
		r.status === 201 &&
		!!r.body.item &&
		r.body.item.kind === 'consumable' &&
		r.body.item.brand === 'Colgate' &&
		r.body.item.category === 'Toothpaste' &&
		r.body.item.group === '' &&
		r.body.item.package_size === 100 &&
		r.body.item.package_unit === 'g' &&
		r.body.item.price === null &&
		r.body.item.photos?.length === 2 &&
		r.body.item.hasPhoto === true,
	'201 with a consumable, package size and two photos'
);
const consumableId = consumable.body.item.id;
volatile.add(consumableId);
volatile.add(consumable.body.item.created_at);
volatile.add(consumable.body.item.updated_at);
for (const photo of consumable.body.item.photos ?? []) {
	volatile.add(photo.id);
	volatile.add(photo.created_at);
}

const categoryGroup = await api(
	'PUT /api/stocks/categories',
	'/api/stocks/categories',
	json({ category: 'Toothpaste', group: 'Food', goal: null }, 'PUT')
);
must(
	'PUT /api/stocks/categories',
	categoryGroup,
	(r) => r.status === 200 && r.body.category === 'Toothpaste' && r.body.group === 'Food' && r.body.goal === null,
	'200 with the category group and no goal'
);

const itemAfterGroup = await api(
	'GET /api/stocks/items/[id] after group',
	`/api/stocks/items/${consumableId}`
);
must(
	'GET /api/stocks/items/[id] after group',
	itemAfterGroup,
	(r) => r.status === 200 && r.body.item?.group === 'Food',
	'the item inherits the category group'
);

const durable = await api(
	'POST /api/stocks/items durable',
	'/api/stocks/items',
	json({ kind: 'durable', name: 'Watch', brand: 'Casio', category: 'Watch', note: 'Steel bracelet', price: 2500, currency: 'BRL', bought_where: 'Downtown shop' })
);
must(
	'POST /api/stocks/items durable',
	durable,
	(r) =>
		r.status === 201 &&
		!!r.body.item &&
		r.body.item.kind === 'durable' &&
		r.body.item.brand === 'Casio' &&
		r.body.item.category === 'Watch' &&
		r.body.item.currency === 'BRL' &&
		r.body.item.hasPhoto === false,
	'201 with a durable in BRL, brand and category'
);
const durableId = durable.body.item.id;
volatile.add(durableId);
volatile.add(durable.body.item.created_at);
volatile.add(durable.body.item.updated_at);

const consumablePatch = await api(
	'PATCH /api/stocks/items/[id]',
	`/api/stocks/items/${consumableId}`,
	json({ quantity: 1, expires_at: 1767225600000, removePhotos: [consumable.body.item.photos[1].id] }, 'PATCH')
);
must(
	'PATCH /api/stocks/items/[id]',
	consumablePatch,
	(r) => r.status === 200 && r.body.item?.quantity === 1 && r.body.item?.expires_at === 1767225600000 && r.body.item?.photos?.length === 1 && r.body.item?.hasPhoto === true,
	'200 with the new quantity and one photo removed'
);
volatile.add(consumablePatch.body.item.updated_at);
const keptPhotoId = consumablePatch.body.item.photos[0].id;

const stockPhoto = await fetch(`${base}/api/stocks/photos/${keptPhotoId}`);
const stockPhotoBytes = new Uint8Array(await stockPhoto.arrayBuffer());
results.push([
	'GET /api/stocks/photos/[photoId]',
	{ status: stockPhoto.status, contentType: stockPhoto.headers.get('content-type'), bytes: stockPhotoBytes.length }
]);
must(
	'GET /api/stocks/photos/[photoId]',
	{ status: stockPhoto.status, body: { contentType: stockPhoto.headers.get('content-type'), bytes: stockPhotoBytes.length } },
	(r) => r.status === 200 && r.body.contentType === 'image/png' && r.body.bytes > 0,
	'200 with the stored PNG bytes'
);

const consumed = await api(
	'POST /api/stocks/items/[id]/consume',
	`/api/stocks/items/${consumableId}/consume`,
	json({ amount: 50, unit: 'g', note: 'used half' }, 'POST')
);
must(
	'POST /api/stocks/items/[id]/consume',
	consumed,
	(r) =>
		r.status === 200 &&
		r.body.item?.quantity === 0.5 &&
		r.body.action?.kind === 'consume' &&
		r.body.action?.amount === 50 &&
		r.body.action?.unit === 'g' &&
		r.body.action?.packages === 0.5 &&
		r.body.action?.note === 'used half',
	'200 with half a package deducted and logged'
);
volatile.add(consumed.body.action.id);
volatile.add(consumed.body.action.created_at);
volatile.add(consumed.body.item.updated_at);

const consumeWrongUnit = await api(
	'POST /api/stocks/items/[id]/consume wrong unit',
	`/api/stocks/items/${consumableId}/consume`,
	json({ amount: 10, unit: 'ml' }, 'POST')
);
must(
	'POST /api/stocks/items/[id]/consume wrong unit',
	consumeWrongUnit,
	(r) => r.status === 400,
	'400 when the unit is in the other family'
);

const stockActions = await api('GET /api/stocks/items/[id]/actions', `/api/stocks/items/${consumableId}/actions`);
must(
	'GET /api/stocks/items/[id]/actions',
	stockActions,
	(r) =>
		r.status === 200 &&
		r.body.actions?.length === 1 &&
		r.body.actions[0].item_id === consumableId &&
		r.body.actions[0].kind === 'consume' &&
		r.body.actions[0].amount === 50 &&
		r.body.actions[0].packages === 0.5,
	'200 with the logged consumption'
);

const disposable = await api(
	'POST /api/stocks/items disposable',
	'/api/stocks/items',
	json({ kind: 'consumable', name: 'Floss', brand: 'colgate', category: 'Toothpaste', quantity: 1, package_size: 50, package_unit: 'g' })
);
must(
	'POST /api/stocks/items disposable',
	disposable,
	(r) => r.status === 201 && !!r.body.item && r.body.item.brand === 'Colgate' && r.body.item.category === 'Toothpaste',
	'201 with the existing brand reused case-insensitively'
);

const nameless = await api(
	'POST /api/stocks/items nameless',
	'/api/stocks/items',
	json({ kind: 'consumable', category: 'Toothpaste', quantity: 3, package_size: 25, package_unit: 'g' })
);
must(
	'POST /api/stocks/items nameless',
	nameless,
	(r) => r.status === 201 && r.body.item?.name === '' && r.body.item?.category === 'Toothpaste' && r.body.item?.package_size === 25,
	'201 with an empty name for a consumable'
);
const namelessId = nameless.body.item.id;
volatile.add(namelessId);
volatile.add(nameless.body.item.created_at);
volatile.add(nameless.body.item.updated_at);
const deletedNameless = await api('DELETE /api/stocks/items/[id] nameless', `/api/stocks/items/${namelessId}`, { method: 'DELETE' });
must('DELETE /api/stocks/items/[id] nameless', deletedNameless, (r) => r.status === 200, '200 with the nameless item gone');

const stockRegistries = await api('GET /api/stocks/registries', '/api/stocks/registries');
must(
	'GET /api/stocks/registries',
	stockRegistries,
	(r) =>
		r.status === 200 &&
		r.body.brands?.length === 2 &&
		r.body.brands.includes('Colgate') &&
		r.body.brands.includes('Casio') &&
		r.body.categories?.length === 2 &&
		r.body.categories.includes('Toothpaste') &&
		r.body.categories.includes('Watch') &&
		r.body.groups?.includes('Food'),
	'200 with deduplicated brands, categories and groups'
);

const watchGroup = await api(
	'PUT /api/stocks/categories durable group',
	'/api/stocks/categories',
	json({ category: 'Watch', group: 'Accessories', goal: null }, 'PUT')
);
must(
	'PUT /api/stocks/categories durable group',
	watchGroup,
	(r) => r.status === 200 && r.body.category === 'Watch' && r.body.group === 'Accessories' && r.body.goal === null,
	'200 with a group and no goal'
);

const watchItemGroup = await api(
	'GET /api/stocks/items/[id] durable after group',
	`/api/stocks/items/${durableId}`
);
must(
	'GET /api/stocks/items/[id] durable after group',
	watchItemGroup,
	(r) => r.status === 200 && r.body.item?.group === 'Accessories',
	'the durable inherits the category group'
);

const watchGroupDelete = await api(
	'DELETE /api/stocks/categories group',
	'/api/stocks/categories',
	json({ group: 'Accessories' }, 'DELETE')
);
must(
	'DELETE /api/stocks/categories group',
	watchGroupDelete,
	(r) => r.status === 200 && r.body.group === 'Accessories' && r.body.cleared === 1,
	'200 with the group cleared from every category'
);

const watchItemClear = await api(
	'GET /api/stocks/items/[id] durable after group delete',
	`/api/stocks/items/${durableId}`
);
must(
	'GET /api/stocks/items/[id] durable after group delete',
	watchItemClear,
	(r) => r.status === 200 && r.body.item?.group === '',
	'the durable loses the deleted group'
);

const disposableId = disposable.body.item.id;
volatile.add(disposableId);
volatile.add(disposable.body.item.created_at);
volatile.add(disposable.body.item.updated_at);

const stockGoalsDefault = await api('GET /api/stocks/goals default', '/api/stocks/goals');
must(
	'GET /api/stocks/goals default',
	stockGoalsDefault,
	(r) => r.status === 200 && Array.isArray(r.body.goals) && r.body.goals.length === 0,
	'200 with no category goals'
);

const stockGoalsSet = await api(
	'PUT /api/stocks/goals',
	'/api/stocks/goals',
	json(
		{
			goals: [
				{ category: 'Toothpaste', people: 2, amount: 100, unit: 'g', note: 'Goal represents 1 year of stock' },
				{ category: 'Oil', people: 1, amount: 2, unit: 'L', note: '' },
				{ category: 'Rice', people: 1, amount: 0.5, unit: 'kg', note: '' }
			]
		},
		'PUT'
	)
);
must(
	'PUT /api/stocks/goals',
	stockGoalsSet,
	(r) =>
		r.status === 200 &&
		r.body.goals?.length === 3 &&
		r.body.goals.some(
			(g) => g.category === 'Toothpaste' && g.people === 2 && g.amount === 100 && g.unit === 'g' && g.target === 200 && g.note === 'Goal represents 1 year of stock'
		) &&
		r.body.goals.some((g) => g.category === 'Oil' && g.unit === 'L' && g.target === 2) &&
		r.body.goals.some((g) => g.category === 'Rice' && g.unit === 'kg' && g.target === 0.5),
	'200 with per-person amounts and doubled targets in g, L and kg'
);
for (const g of stockGoalsSet.body.goals) volatile.add(g.category_id);

const stockGoalsBadUnit = await api(
	'PUT /api/stocks/goals invalid unit',
	'/api/stocks/goals',
	json({ goals: [{ category: 'Oil', people: 1, amount: 1, unit: 'litre', note: '' }] }, 'PUT')
);
must(
	'PUT /api/stocks/goals invalid unit',
	stockGoalsBadUnit,
	(r) => r.status === 400,
	'400 for a unit outside g, kg, ml, L'
);

const stockGoalsBad = await api(
	'PUT /api/stocks/goals invalid',
	'/api/stocks/goals',
	json({ goals: [{ category: 'Toothpaste', people: 1, amount: 0, unit: 'g', note: '' }] }, 'PUT')
);
must(
	'PUT /api/stocks/goals invalid',
	stockGoalsBad,
	(r) => r.status === 400,
	'400 for an amount of 0'
);

const deletedStock = await api(
	'DELETE /api/stocks/items/[id]',
	`/api/stocks/items/${disposableId}`,
	{ method: 'DELETE' }
);
must('DELETE /api/stocks/items/[id]', deletedStock, (r) => r.status === 200, '200 with the item gone');

// --- Note links -----------------------------------------------------------
// The label is never stored: it renders live from the target's first line.
const linkTarget = await api(
	'POST /api/notes link target',
	'/api/notes',
	json({ content: 'Link target note about kayaking trips' })
);
must('POST /api/notes link target', linkTarget, (r) => r.status === 201 && !!r.body.note, '201 with a note');
volatile.add(linkTarget.body.note.id);
volatile.add(linkTarget.body.note.created_at);
volatile.add(linkTarget.body.note.updated_at);
const linkTargetId = linkTarget.body.note.id;

const linkSource = await api(
	'POST /api/notes link source',
	'/api/notes',
	json({ content: `Note that links to [[${linkTargetId}]] and [[${principleId}]] for trips` })
);
must('POST /api/notes link source', linkSource, (r) => r.status === 201 && !!r.body.note, '201 with a note');
volatile.add(linkSource.body.note.id);
volatile.add(linkSource.body.note.created_at);
volatile.add(linkSource.body.note.updated_at);
volatile.add(linkSource.body.note.content);
const linkSourceId = linkSource.body.note.id;

const linked = await api('GET /api/notes/[id] linked', `/api/notes/${linkSourceId}`);
must(
	'GET /api/notes/[id] linked',
	linked,
	(r) =>
		r.status === 200 &&
		r.body.note?.linkedNotes?.length === 2 &&
		r.body.note.linkedNotes.some((l) => l.id === linkTargetId && l.kind === 'note' && l.label === 'Link target note about kayaking trips') &&
		r.body.note.linkedNotes.some((l) => l.id === principleId && l.kind === 'principle' && l.label === 'Principle that must survive a restore'),
	'the outgoing links with live labels and kinds'
);

const backlinks = await api('GET /api/principles/[id] backlinks', `/api/principles/${principleId}`);
must(
	'GET /api/principles/[id] backlinks',
	backlinks,
	(r) => r.status === 200 && r.body.principle?.id === principleId && r.body.mentionedIn?.some((n) => n.id === linkSourceId),
	'200 with the principle plus the note that mentions it'
);

// --- Library ---------------------------------------------------------------
// The API validates the zip magic and rejects a DRM marker, then stores the
// bytes verbatim. The EPUB parse itself is browser-only (epub.js), so a
// synthetic byte string is the honest smoke payload.
const epubBytes = new Uint8Array([...Buffer.from('PK\x03\x04'), ...Buffer.from(' smoke library book bytes')]);
const epubForm = new FormData();
epubForm.append('file', new Blob([epubBytes], { type: 'application/epub+zip' }), 'smoke.epub');
epubForm.append('title', 'Smoke Library Book');
epubForm.append('author', 'A. Tester');
const bookAdd = await api('POST /api/books', '/api/books', {
	method: 'POST',
	headers: { origin: base },
	body: epubForm
});
must('POST /api/books', bookAdd, (r) => r.status === 201 && !!r.body.book, '201 with the stored book');
const bookId = bookAdd.body.book.id;
volatile.add(bookId);
volatile.add(bookAdd.body.book.added_at);

const drmForm = new FormData();
drmForm.append(
	'file',
	new Blob([new Uint8Array([...Buffer.from('PK\x03\x04'), ...Buffer.from('encryption.xml')])], { type: 'application/epub+zip' }),
	'drm.epub'
);
drmForm.append('title', 'DRM book');
const drmAdd = await api('POST /api/books drm rejected', '/api/books', {
	method: 'POST',
	headers: { origin: base },
	body: drmForm
});
must('POST /api/books drm rejected', drmAdd, (r) => r.status === 400, '400 for a DRM-protected EPUB');

const booksList = await api('GET /api/books', '/api/books');
must(
	'GET /api/books',
	booksList,
	(r) =>
		r.status === 200 &&
		r.body.books?.some((b) => b.id === bookId && b.title === 'Smoke Library Book' && b.bytes === undefined),
	'200 listing the book without its bytes'
);

const bookFile = await fetch(`${base}/api/books/${bookId}/file`);
const bookFileBytes = new Uint8Array(await bookFile.arrayBuffer());
results.push(['GET /api/books/[id]/file', { status: bookFile.status, bytes: bookFileBytes.length }]);
must(
	'GET /api/books/[id]/file',
	{ status: bookFile.status, body: { bytes: bookFileBytes.length } },
	(r) => r.status === 200 && r.body.bytes === epubBytes.length,
	'200 with the exact stored bytes'
);

const bookPos = await api(
	'PUT /api/books/[id]/position',
	`/api/books/${bookId}/position`,
	json({ cfi: 'epubcfi(/6/4[xhtml]!/4/2/1:8)', pct: 0.42, chapter: 'Chapter One' }, 'PUT')
);
must(
	'PUT /api/books/[id]/position',
	bookPos,
	(r) => r.status === 200 && r.body.book?.lastPct === 0.42,
	'200 with the saved position'
);
volatile.add(bookPos.body.book.lastReadAt);

const bookNote = await api(
	'POST /api/books/[id]/notes',
	`/api/books/${bookId}/notes`,
	json({ cfi: 'epubcfi(/6/4[xhtml]!/4/2/1:8,/4/2/1:24)', excerpt: 'a highlighted sentence', note: 'first note' })
);
must('POST /api/books/[id]/notes', bookNote, (r) => r.status === 201 && !!r.body.note, '201 with the note');
const bookNoteId = bookNote.body.note.id;
volatile.add(bookNoteId);
volatile.add(bookNote.body.note.created_at);
volatile.add(bookNote.body.note.updated_at);

const noteEdit = await api(
	'PATCH /api/books/[id]/notes/[noteId]',
	`/api/books/${bookId}/notes/${bookNoteId}`,
	json({ note: 'edited note' }, 'PATCH')
);
must(
	'PATCH /api/books/[id]/notes/[noteId]',
	noteEdit,
	(r) => r.status === 200 && r.body.note?.note === 'edited note',
	'200 with the edited note'
);
volatile.add(noteEdit.body.note.updated_at);

const notesList = await api('GET /api/books/[id]/notes', `/api/books/${bookId}/notes`);
must(
	'GET /api/books/[id]/notes',
	notesList,
	(r) => r.status === 200 && r.body.notes?.length === 1 && r.body.notes[0].note === 'edited note' && r.body.total === 1,
	'200 with the one edited note and its total'
);

// A second note lets the cursor page walk; limit=1 must hand back exactly
// one row plus a nextCursor, then the tail.
const bookNote2 = await api(
	'POST /api/books/[id]/notes 2',
	`/api/books/${bookId}/notes`,
	json({ cfi: 'epubcfi(/6/6[xhtml2]!/4/2/1:8)', excerpt: 'second highlight', note: '' })
);
must('POST /api/books/[id]/notes 2', bookNote2, (r) => r.status === 201 && !!r.body.note, '201 with the second note');
volatile.add(bookNote2.body.note.id);
volatile.add(bookNote2.body.note.created_at);
volatile.add(bookNote2.body.note.updated_at);

const notesPage1 = await api('GET /api/books/[id]/notes page 1', `/api/books/${bookId}/notes?limit=1`);
must(
	'GET /api/books/[id]/notes page 1',
	notesPage1,
	(r) =>
		r.status === 200 &&
		r.body.notes?.length === 1 &&
		r.body.hasMore === true &&
		r.body.total === 2 &&
		r.body.nextCursor !== null,
	'200 with one note, hasMore and a cursor'
);
const notesCursor = notesPage1.body.nextCursor;
const notesPage2 = await api(
	'GET /api/books/[id]/notes page 2',
	`/api/books/${bookId}/notes?limit=1&before=${notesCursor.created_at}&before_id=${encodeURIComponent(notesCursor.id)}`
);
must(
	'GET /api/books/[id]/notes page 2',
	notesPage2,
	(r) => r.status === 200 && r.body.notes?.length === 1 && r.body.hasMore === false && r.body.notes[0].id !== notesPage1.body.notes[0].id,
	'200 with the second page and nothing after it'
);

// --- Holdings ---------------------------------------------------------------
const btc = await api(
	'POST /api/holdings btc',
	'/api/holdings',
	json({ ticker: 'BTC', amount: 0.5, price: null, currency: 'USD', category: 'btc', goal: null })
);
must(
	'POST /api/holdings btc',
	btc,
	(r) => r.status === 201 && r.body.holding?.price === null && r.body.holding?.category === 'btc' && r.body.holding?.price_updated_at === 0,
	'201 with an auto-price BTC holding and no price timestamp yet'
);
volatile.add(btc.body.holding.id);
volatile.add(btc.body.holding.created_at);
volatile.add(btc.body.holding.updated_at);
const btcId = btc.body.holding.id;

const fii = await api(
	'POST /api/holdings fii',
	'/api/holdings',
	json({ ticker: 'MXRF11', amount: 100, price: 10, currency: 'BRL', avgPrice: 9.5 })
);
must(
	'POST /api/holdings fii',
	fii,
	(r) =>
		r.status === 201 &&
		!!r.body.holding &&
		r.body.holding.price_updated_at > 0 &&
		r.body.holding.avgPrice === 9.5,
	'201 with a holding, its price timestamp and the opening average'
);
volatile.add(fii.body.holding.id);
volatile.add(fii.body.holding.created_at);
volatile.add(fii.body.holding.updated_at);
volatile.add(fii.body.holding.price_updated_at);
const fiiId = fii.body.holding.id;

const holdingsSummary = await api('GET /api/holdings', '/api/holdings');
must(
	'GET /api/holdings',
	holdingsSummary,
	(r) =>
		r.status === 200 &&
		r.body.holdings?.length === 2 &&
		r.body.holdings[0]?.ticker === 'MXRF11' &&
		r.body.totalUsd === 1000 &&
		r.body.previousTotalUsd === null &&
		r.body.totalChangePct === null &&
		r.body.stale === true &&
		r.body.actual?.fii === 100 &&
		r.body.displayTotals?.USD === 1000 &&
		r.body.displayTotals?.BRL === null &&
		r.body.displayTotals?.UYU === null,
	'highest value first, FII-only total at fallback rate, stale without rates'
);

const openingActions = rememberActions(await api('GET /api/holdings/[id]/actions', `/api/holdings/${fiiId}/actions`));
must(
	'GET /api/holdings/[id]/actions',
	openingActions,
	(r) =>
		r.status === 200 &&
		r.body.actions?.length === 1 &&
		r.body.actions[0]?.kind === 'opening' &&
		r.body.actions[0]?.amount === 100 &&
		r.body.actions[0]?.price === 9.5 &&
		r.body.actions[0]?.currency === 'BRL',
	'the create seeds one opening row with the average cost'
);

const bought = rememberActions(await api(
	'POST /api/holdings/[id]/actions buy',
	`/api/holdings/${fiiId}/actions`,
	json({ kind: 'buy', amount: 10, price: 12.5 })
));
must(
	'POST /api/holdings/[id]/actions buy',
	bought,
	(r) =>
		r.status === 201 &&
		r.body.action?.kind === 'buy' &&
		r.body.action?.amount === 10 &&
		r.body.action?.price === 12.5 &&
		r.body.holding?.amount === 110 &&
		r.body.summary?.totalUsd === 1100 &&
		r.body.actions?.length === 2,
	'a buy records the price paid, adds shares and returns the new history'
);
volatile.add(bought.body.holding.updated_at);
for (const h of bought.body.summary?.holdings ?? []) {
	volatile.add(h.updated_at);
	volatile.add(h.previous_value_at);
}

const badPrice = await api(
	'POST /api/holdings/[id]/actions bad price',
	`/api/holdings/${fiiId}/actions`,
	json({ kind: 'buy', amount: 1, price: -1 })
);
must(
	'POST /api/holdings/[id]/actions bad price',
	badPrice,
	(r) => r.status === 400,
	'400 for a negative trade price'
);

const sold = rememberActions(await api(
	'POST /api/holdings/[id]/actions sell',
	`/api/holdings/${fiiId}/actions`,
	json({ kind: 'sell', amount: 5 })
));
must(
	'POST /api/holdings/[id]/actions sell',
	sold,
	(r) =>
		r.status === 201 &&
		r.body.action?.kind === 'sell' &&
		r.body.action?.amount === 5 &&
		r.body.holding?.amount === 105 &&
		r.body.summary?.totalUsd === 1050 &&
		r.body.actions?.length === 3,
	'a sell subtracts shares and returns the new history'
);
volatile.add(sold.body.holding.updated_at);
for (const h of sold.body.summary?.holdings ?? []) {
	volatile.add(h.updated_at);
	volatile.add(h.previous_value_at);
}

const holdingHistory = await api('GET /api/holdings/[id]/history', `/api/holdings/${fiiId}/history`);
must(
	'GET /api/holdings/[id]/history',
	holdingHistory,
	(r) =>
		r.status === 200 &&
		r.body.points?.length === 1 &&
		r.body.points[0].amount === 105 &&
		r.body.points[0].value === 1050 &&
		r.body.points[0].value_usd === 1050,
	'one daily point holds the last value, not one row per action'
);
volatile.add(holdingHistory.body.points[0].recorded_at);

const portfolioHistory = await api('GET /api/holdings/history', '/api/holdings/history');
must(
	'GET /api/holdings/history',
	portfolioHistory,
	(r) => r.status === 200 && r.body.points?.length === 1 && r.body.points[0].value_usd === 1050,
	'one daily portfolio point holds the latest total'
);
volatile.add(portfolioHistory.body.points[0].recorded_at);

const fiiSummary = sold.body.summary.holdings.find((h) => h.id === fiiId);
must(
	'holding card trend',
	{ status: 200, body: fiiSummary },
	(r) => r.body.previous_value === 1050 && r.body.previous_value_at > 0 && r.body.changePct === 0,
	'the first day has no previous day and uses a neutral baseline'
);

const sameValue = await api(
	'PATCH /api/holdings/[id] same value',
	`/api/holdings/${fiiId}`,
	json({ amount: 105 }, 'PATCH')
);
must(
	'PATCH /api/holdings/[id] same value',
	sameValue,
	(r) => {
		const h = r.body.summary?.holdings?.find((x) => x.id === fiiId);
		return r.status === 200 && h?.previous_value === 1050 && h?.changePct === 0;
	},
	'same-day snapshots do not move the daily baseline'
);
volatile.add(sameValue.body.holding.updated_at);
volatile.add(sameValue.body.holding.previous_value_at);
for (const h of sameValue.body.summary?.holdings ?? []) {
	volatile.add(h.updated_at);
	volatile.add(h.previous_value_at);
}

must(
	'POST /api/holdings/[id]/actions oversell',
	await api(
		'POST /api/holdings/[id]/actions oversell',
		`/api/holdings/${fiiId}/actions`,
		json({ kind: 'sell', amount: 1000 })
	),
	(r) => r.status === 400,
	'400 when a sell is larger than the holding'
);

const tradePage1 = await api('GET /api/holdings/actions', '/api/holdings/actions?limit=1');
must(
	'GET /api/holdings/actions',
	tradePage1,
	(r) =>
		r.status === 200 &&
		r.body.count === 2 &&
		r.body.hasMore === true &&
		r.body.items?.length === 1 &&
		r.body.items[0]?.kind === 'sell' &&
		r.body.items[0]?.ticker === 'MXRF11' &&
		r.body.items[0]?.category === 'fii' &&
		r.body.items[0]?.amount === 5 &&
		r.body.items[0]?.price === 10 &&
		r.body.items[0]?.currency === 'BRL' &&
		r.body.nextCursor?.id === r.body.items[0].id,
	'newest trade first, opening rows excluded, one more page'
);
for (const t of tradePage1.body.items ?? []) {
	volatile.add(t.id);
	volatile.add(t.created_at);
}
if (tradePage1.body.nextCursor) {
	volatile.add(tradePage1.body.nextCursor.id);
	volatile.add(tradePage1.body.nextCursor.created_at);
}
const tradePage2 = await api(
	'GET /api/holdings/actions page 2',
	`/api/holdings/actions?limit=1&before=${tradePage1.body.nextCursor.created_at}&before_id=${encodeURIComponent(tradePage1.body.nextCursor.id)}`
);
must(
	'GET /api/holdings/actions page 2',
	tradePage2,
	(r) =>
		r.status === 200 &&
		r.body.hasMore === false &&
		r.body.items?.length === 1 &&
		r.body.items[0]?.kind === 'buy' &&
		r.body.items[0]?.amount === 10,
	'the cursor returns the older buy and stops'
);
for (const t of tradePage2.body.items ?? []) {
	volatile.add(t.id);
	volatile.add(t.created_at);
}

const amountOnly = await api(
	'PATCH /api/holdings/[id] amount',
	`/api/holdings/${fiiId}`,
	json({ amount: 101 }, 'PATCH')
);
must(
	'PATCH /api/holdings/[id] amount',
	amountOnly,
	(r) =>
		r.status === 200 &&
		r.body.holding?.amount === 101 &&
		r.body.holding?.price === 10 &&
		r.body.holding?.price_updated_at === fii.body.holding.price_updated_at,
	'an amount edit leaves the price timestamp alone'
);
volatile.add(amountOnly.body.holding.updated_at);

const retickered = await api(
	'PATCH /api/holdings/[id] ticker',
	`/api/holdings/${fiiId}`,
	json({ ticker: 'HGLG11' }, 'PATCH')
);
must(
	'PATCH /api/holdings/[id] ticker',
	retickered,
	(r) =>
		r.status === 200 &&
		r.body.holding?.ticker === 'HGLG11' &&
		r.body.holding?.price === null &&
		r.body.holding?.priceAuto === true &&
		r.body.holding?.price_updated_at === 0,
	'a ticker change drops the old quote and re-arms auto'
);
volatile.add(retickered.body.holding.updated_at);

const patchedHolding = await api(
	'PATCH /api/holdings/[id]',
	`/api/holdings/${fiiId}`,
	json({ ticker: 'MXRF11', amount: 100, price: 20 }, 'PATCH')
);
must(
	'PATCH /api/holdings/[id]',
	patchedHolding,
	(r) =>
		r.status === 200 &&
		r.body.holding?.price === 20 &&
		r.body.summary?.totalUsd === 2000 &&
		r.body.holding?.price_updated_at >= fii.body.holding.price_updated_at,
	'manual price, total follows, price timestamp moves'
);
volatile.add(patchedHolding.body.holding.updated_at);
volatile.add(patchedHolding.body.holding.price_updated_at);
const avgEdited = await api(
	'PATCH /api/holdings/[id] avgPrice',
	`/api/holdings/${fiiId}`,
	json({ avgPrice: 12 }, 'PATCH')
);
must(
	'PATCH /api/holdings/[id] avgPrice',
	avgEdited,
	(r) => r.status === 200 && r.body.holding?.avgPrice === 12 && r.body.summary?.totalUsd === 2000,
	'the average cost lives on the opening row and leaves the quote alone'
);
volatile.add(avgEdited.body.holding.updated_at);

const ledgerAfterEdits = rememberActions(await api(
	'GET /api/holdings/[id]/actions after edits',
	`/api/holdings/${fiiId}/actions`
));
must(
	'GET /api/holdings/[id]/actions after edits',
	ledgerAfterEdits,
	(r) =>
		r.status === 200 &&
		r.body.actions?.length === 3 &&
		r.body.actions.find((a) => a.kind === 'opening')?.amount === 95 &&
		r.body.actions.find((a) => a.kind === 'opening')?.price === 12 &&
		r.body.actions.some((a) => a.kind === 'buy' && a.price === 12.5) &&
		r.body.actions.some((a) => a.kind === 'sell' && a.price === 10),
	'an amount edit shifts the opening row so the ledger still sums to the total'
);

const deletedHolding = await api('DELETE /api/holdings/[id]', `/api/holdings/${btcId}`, { method: 'DELETE' });
must(
	'DELETE /api/holdings/[id]',
	deletedHolding,
	(r) => r.status === 200 && r.body.summary?.holdings?.length === 1 && r.body.summary?.totalUsd === 2000,
	'one holding left, total follows'
);

// Cash counts at face value: the ticker is derived from the bank name.
const cash = await api(
	'POST /api/holdings cash',
	'/api/holdings',
	json({ amount: 1000, currency: 'BRL', category: 'cash', bank: 'Nubank', country: 'BR' })
);
must(
	'POST /api/holdings cash',
	cash,
	(r) =>
		r.status === 201 &&
		r.body.holding?.ticker === 'NUBANK' &&
		r.body.holding?.price === 1 &&
		r.body.holding?.bank === 'Nubank' &&
		r.body.holding?.country === 'BR' &&
		r.body.holding?.price_updated_at > 0 &&
		r.body.holding?.avgPrice === 1 &&
		r.body.summary?.totalUsd === 3000,
	'cash holding with bank-derived ticker, face value, price timestamp and total'
);
volatile.add(cash.body.holding.id);
volatile.add(cash.body.holding.created_at);
volatile.add(cash.body.holding.updated_at);
volatile.add(cash.body.holding.price_updated_at);
const cashId = cash.body.holding.id;

const cashActions = rememberActions(
	await api('GET /api/holdings/[id]/actions cash', `/api/holdings/${cashId}/actions`)
);
must(
	'GET /api/holdings/[id]/actions cash',
	cashActions,
	(r) =>
		r.status === 200 &&
		r.body.actions?.length === 1 &&
		r.body.actions[0]?.amount === 1000 &&
		r.body.actions[0]?.price === 1,
	'the cash opening row counts at face value'
);

// The trades are recorded at the current time, so the day key is runtime
// data: mask it before the golden is written.
const heatmapWithTrades = await api('GET /api/stats/heatmap trades', '/api/stats/heatmap');
for (const t of heatmapWithTrades.body.trades ?? []) volatile.add(t.day);
must(
	'GET /api/stats/heatmap trades',
	heatmapWithTrades,
	(r) =>
		r.status === 200 &&
		r.body.trades?.length === 1 &&
		r.body.trades[0]?.buys === 1 &&
		r.body.trades[0]?.sells === 1,
	'one buy and one sell on the same day, opening rows excluded'
);

const goals = await api(
	'PUT /api/holdings/goals',
	'/api/holdings/goals',
	json({ btc: 50, fii: 20, cash: 30 }, 'PUT')
);
must(
	'PUT /api/holdings/goals',
	goals,
	(r) =>
		r.status === 200 &&
		r.body.summary?.goals?.cash === 30 &&
		Math.abs(r.body.summary?.actual?.fii - 66.67) < 0.01 &&
		r.body.summary?.drift?.length === 2 &&
		r.body.summary.drift.some((d) => d.category === 'fii') &&
		r.body.summary.drift.some((d) => d.category === 'btc'),
	'goals stored, off-target categories drift, cash within band'
);
must('PUT /api/holdings/goals bad sum', await api('PUT /api/holdings/goals bad sum', '/api/holdings/goals', json({ btc: 50, fii: 50, cash: 50 }, 'PUT')), (r) => r.status === 400, '400 unless goals add to 100');
must(
	'PUT /api/holdings/goals bad combined sum',
	await api(
		'PUT /api/holdings/goals bad combined sum',
		'/api/holdings/goals',
		json({ pct: { btc: 40, fii: 20, cash: 30 }, values: { btc: null, fii: null, cash: null } }, 'PUT')
	),
	(r) => r.status === 400,
	'400 unless the combined allocation goals add to 100'
);

// Value targets are independent: the FII allocation stays 20%, while its
// absolute target is R$ 250.000. No FX is available in this run, so the
// progress must be unknown rather than a made-up 1:1 rate.
const valueGoals = await api(
	'PUT /api/holdings/goals values',
	'/api/holdings/goals',
	json({ values: { btc: null, fii: 250000, cash: null } }, 'PUT')
);
must(
	'PUT /api/holdings/goals values',
	valueGoals,
	(r) =>
		r.status === 200 &&
		r.body.summary?.goals?.fii === 20 &&
		r.body.summary?.goals?.cash === 30 &&
		r.body.summary?.valueGoals?.fii?.amount === 250000 &&
		r.body.summary?.valueGoals?.fii?.currency === 'BRL' &&
		r.body.summary?.valueGoals?.btc === null &&
		r.body.summary?.valueGoals?.cash === null &&
		r.body.summary?.valueProgress?.length === 1 &&
		r.body.summary.valueProgress[0]?.category === 'fii' &&
		r.body.summary.valueProgress[0]?.target === 250000 &&
		r.body.summary.valueProgress[0]?.actual === null &&
		r.body.summary.valueProgress[0]?.gap === null &&
		r.body.summary.valueProgress[0]?.pct === null,
	'the FII target stored in BRL with null progress while the rate is missing'
);

// BTC targets use USD, so no FX is needed: the value is exact. The values
// object replaces every target, which clears FII when it is absent.
const usdValueTarget = await api(
	'PUT /api/holdings/goals usd value',
	'/api/holdings/goals',
	json({ values: { btc: 1000 } }, 'PUT')
);
must(
	'PUT /api/holdings/goals usd value',
	usdValueTarget,
	(r) =>
		r.status === 200 &&
		r.body.summary?.valueGoals?.btc?.amount === 1000 &&
		r.body.summary?.valueGoals?.btc?.currency === 'USD' &&
		r.body.summary?.valueGoals?.fii === null &&
		r.body.summary?.valueProgress?.length === 1 &&
		r.body.summary.valueProgress[0]?.category === 'btc' &&
		r.body.summary.valueProgress[0]?.actual === 0 &&
		r.body.summary.valueProgress[0]?.gap === 1000 &&
		r.body.summary.valueProgress[0]?.pct === 0,
	'USD target computed at rate 1 and the missing key cleared the FII target'
);
must(
	'PUT /api/holdings/goals bad value',
	await api(
		'PUT /api/holdings/goals bad value',
		'/api/holdings/goals',
		json({ values: { btc: -5, fii: null, cash: null } }, 'PUT')
	),
	(r) => r.status === 400,
	'400 unless each value target is null or greater than 0'
);

// Leave one value target behind so export and restore have to carry it.
const clearValueGoals = await api(
	'PUT /api/holdings/goals clear values',
	'/api/holdings/goals',
	json({ values: { btc: null, fii: null, cash: null } }, 'PUT')
);
must(
	'PUT /api/holdings/goals clear values',
	clearValueGoals,
	(r) => r.status === 200 && r.body.summary?.valueGoals === null && r.body.summary?.valueProgress?.length === 0,
	'a values-only write can clear every target'
);
const reseedValueGoal = await api(
	'PUT /api/holdings/goals reseed value',
	'/api/holdings/goals',
	json({ values: { btc: null, fii: 250000, cash: null } }, 'PUT')
);
must(
	'PUT /api/holdings/goals reseed value',
	reseedValueGoal,
	(r) => r.status === 200 && r.body.summary?.valueGoals?.fii?.amount === 250000 && r.body.summary?.goals?.fii === 20,
	'the FII target is restored without touching the allocation goals'
);

const color = await api('PUT /api/tags/[tag]', '/api/tags/garden', json({ color: 'violet' }, 'PUT'));
must('PUT /api/tags/[tag]', color, (r) => r.status === 200 && r.body.color === 'violet', '200 with violet');

const extraForm = (fields) =>
	new URLSearchParams(fields);
const addBatteries = await fetch(`${base}/api/stocks/print?scope=shopping`, {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
	body: extraForm({ intent: 'add', text: 'Batteries' }),
	redirect: 'manual'
});
must('POST /api/stocks/print extra', { status: addBatteries.status }, (r) => r.status === 303, '303 after adding an extra');

const shoppingWithExtra = await (await fetch(`${base}/api/stocks/print?scope=shopping`)).text();
must(
	'GET /api/stocks/print shopping extra',
	{ body: shoppingWithExtra },
	(r) => r.body.includes('Batteries') && r.body.includes('Extras'),
	'the shopping list shows the manual extra'
);
const extraId = /name="id" value="([^"]+)"/.exec(shoppingWithExtra)?.[1];
must('shopping extra id', { id: extraId }, (r) => typeof r.id === 'string' && r.id.length > 0, 'the remove form carries the extra id');

const removeBatteries = await fetch(`${base}/api/stocks/print?scope=shopping`, {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
	body: extraForm({ intent: 'remove', id: extraId }),
	redirect: 'manual'
});
must('POST /api/stocks/print remove extra', { status: removeBatteries.status }, (r) => r.status === 303, '303 after removing an extra');
const shoppingWithoutExtra = await (await fetch(`${base}/api/stocks/print?scope=shopping`)).text();
must(
	'GET /api/stocks/print shopping extra removed',
	{ body: shoppingWithoutExtra },
	(r) => !r.body.includes('Batteries'),
	'the removed extra leaves no trace'
);

const addBirthday = await fetch(`${base}/api/stocks/print?scope=shopping`, {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
	body: extraForm({ intent: 'add', text: 'Birthday card' }),
	redirect: 'manual'
});
must('POST /api/stocks/print restore extra', { status: addBirthday.status }, (r) => r.status === 303, '303 after adding the restore extra');

// --- Swing trading ------------------------------------------------------
// Mirror the spreadsheet: 2 × PETR4 @ 38.50 buy, then the full-position sale
// @ 40.00. Fees are 0.03% each way, dedo-duro 0.005% on the sale only.
const tradingTickers = await api('GET /api/trading/tickers', '/api/trading/tickers');
must(
	'GET /api/trading/tickers',
	tradingTickers,
	(r) =>
		r.status === 200 &&
		Array.isArray(r.body.tickers) &&
		r.body.tickers.includes('PETR4') &&
		r.body.tickers.includes('VALE3') &&
		r.body.tickers.includes('GGRC11') &&
		r.body.tickers.includes('MXRF11'),
	'200 with the seeded B3 universe'
);

const customTicker = await api(
	'POST /api/trading/tickers custom',
	'/api/trading/tickers',
	json({ ticker: 'ZZZZ11' })
);
must(
	'POST /api/trading/tickers custom',
	customTicker,
	(r) => r.status === 201 && r.body.ticker === 'ZZZZ11',
	'201 adding a custom ticker'
);

const badTicker = await api('POST /api/trading/tickers bad', '/api/trading/tickers', json({ ticker: 'NOPE' }));
must('POST /api/trading/tickers bad', badTicker, (r) => r.status === 400, '400 for a non-B3 ticker');

const badTradePrice = await api(
	'POST /api/trading/orders bad price',
	'/api/trading/orders',
	json({ orgId: 'b3', ticker: 'PETR4', side: 'BUY', qty: 2, unitPrice: '44.0.1' })
);
must('POST /api/trading/orders bad price', badTradePrice, (r) => r.status === 400, '400 for a malformed price');

const tradingOrgs = await api('GET /api/trading/orgs', '/api/trading/orgs');
must(
	'GET /api/trading/orgs',
	tradingOrgs,
	(r) =>
		r.status === 200 &&
		r.body.orgs?.some((o) => o.id === 'b3' && o.enabled && o.feeRate === 0.0003) &&
		r.body.orgs?.some((o) => o.id === 'ripio' && !o.enabled),
	'200 with B3 enabled and Ripio disabled'
);
for (const o of tradingOrgs.body.orgs ?? []) volatile.add(o.created_at);

const orgPatch = await api(
	'PATCH /api/trading/orgs/b3 noop',
	'/api/trading/orgs/b3',
	json({ exemptLimit: 20000 }, 'PATCH')
);
must('PATCH /api/trading/orgs/b3', orgPatch, (r) => r.status === 200 && r.body.org?.exemptLimit === 20000, '200 with the venue rules');

const badOrg = await api(
	'PATCH /api/trading/orgs/ripio blocked',
	'/api/trading/orgs/ripio',
	json({ exemptLimit: 20000 }, 'PATCH')
);
must('PATCH /api/trading/orgs/ripio', badOrg, (r) => r.status === 400, '400 while the venue is disabled');

const enableRipio = await api(
	'PATCH /api/trading/orgs/ripio enable',
	'/api/trading/orgs/ripio',
	json({ enabled: true }, 'PATCH')
);
must(
	'PATCH /api/trading/orgs/ripio enable',
	enableRipio,
	(r) => r.status === 200 && r.body.org?.enabled === true,
	'200 with the venue enabled for preview'
);

// Ripio now trades like B3: one openable BUY, a position that waits for a
// quote, and a clean delete before the venue goes back to disabled.
const ripioBuy = await api(
	'POST /api/trading/orders ripio',
	'/api/trading/orders',
	json({ orgId: 'ripio', ticker: 'BTC_USDC', side: 'BUY', qty: 0.01, unitPrice: 64000, date: Date.parse('2026-11-12T12:00:00') })
);
must('POST /api/trading/orders ripio', ripioBuy, (r) => r.status === 201 && r.body.order?.ticker === 'BTC_USDC', '201 with the ripio order');
const ripioOrderId = ripioBuy.body.order.id;
volatile.add(ripioOrderId);
volatile.add(ripioBuy.body.order.created_at);

const ripioSummary = await api('GET /api/trading/summary ripio', '/api/trading/summary?org=ripio');
must(
	'GET /api/trading/summary ripio',
	ripioSummary,
	(r) => {
		const pos = r.body.summary?.positions ?? [];
		return r.status === 200 && pos.length === 1 && pos[0].ticker === 'BTC_USDC' && pos[0].recommendation === 'waiting';
	},
	'the open ripio position waits for its quote'
);
for (const o of ripioSummary.body.summary?.orders ?? []) {
	volatile.add(o.id);
	volatile.add(o.created_at);
}
for (const d of ripioSummary.body.summary?.diary ?? []) {
	volatile.add(d.id);
	volatile.add(d.created_at);
}

const ripioOrderDel = await api('DELETE /api/trading/orders ripio', `/api/trading/orders/${ripioOrderId}`, { method: 'DELETE' });
must('DELETE /api/trading/orders ripio', ripioOrderDel, (r) => r.status === 200, '200 deleting the latest ripio order');
const ripioSummaryEmpty = await api('GET /api/trading/summary ripio empty', '/api/trading/summary?org=ripio');
must(
	'GET /api/trading/summary ripio empty',
	ripioSummaryEmpty,
	(r) => r.status === 200 && (r.body.summary?.positions?.length ?? 1) === 0,
	'no open ripio positions after the delete'
);

const disableRipio = await api(
	'PATCH /api/trading/orgs/ripio disable',
	'/api/trading/orgs/ripio',
	json({ enabled: false }, 'PATCH')
);
must(
	'PATCH /api/trading/orgs/ripio disable',
	disableRipio,
	(r) => r.status === 200 && r.body.org?.enabled === false,
	'200 with the venue disabled again'
);
volatile.add(enableRipio.body.org?.created_at);
volatile.add(disableRipio.body.org?.created_at);

// Live quote, offline-safe: the test child may block the network, so the
// shape (price or typed error) is asserted live but the entry never
// reaches the golden.
const ripioQuote = await api('GET /api/quotes/ripio', '/api/quotes/ripio?pair=BTC_USDC');
must(
	'GET /api/quotes/ripio',
	ripioQuote,
	(r) =>
		r.status === 200 &&
		((typeof r.body.priceUsd === 'number' && r.body.priceUsd > 0) || typeof r.body.error === 'string'),
	'200 with a BTC price or a typed error'
);
results.pop();

const badRipioPair = await api('GET /api/quotes/ripio bad pair', '/api/quotes/ripio?pair=NOPE');
must(
	'GET /api/quotes/ripio bad pair',
	badRipioPair,
	(r) => r.status === 200 && r.body.error === 'bad pair',
	'200 with a typed error, no network touched'
);
results.pop();

// The Coinbase comparison source: serves the stored daily fx_rates BTC row
// (refreshed by the holdings steps above), so this is the number the
// holdings card prices BTC with. Live drift means the golden keeps the
// shape only.
const globalBtc = await api('GET /api/quotes/btc-global', '/api/quotes/btc-global');
must(
	'GET /api/quotes/btc-global',
	globalBtc,
	(r) =>
		r.status === 200 &&
		((typeof r.body.priceUsd === 'number' && r.body.priceUsd > 0 && typeof r.body.fetchedAt === 'number') ||
			typeof r.body.error === 'string'),
	'200 with a Coinbase BTC price or a typed error'
);
results.pop();

const tradeBuy = await api(
	'POST /api/trading/orders buy',
	'/api/trading/orders',
	json({ orgId: 'b3', ticker: 'PETR4', side: 'BUY', qty: 2, unitPrice: 38.5, date: Date.parse('2026-11-03T12:00:00') })
);
must(
	'POST /api/trading/orders buy',
	tradeBuy,
	(r) =>
		r.status === 201 &&
		r.body.order?.value === 77 &&
		Math.abs(r.body.order?.fees - 0.0231) < 1e-9 &&
		r.body.order?.irrf === 0 &&
		Math.abs(r.body.order?.net - 77.0231) < 1e-9,
	'201 with value 77, fees 0.0231 and net 77.0231'
);
volatile.add(tradeBuy.body.order?.id);
volatile.add(tradeBuy.body.order?.created_at);

const partialSell = await api(
	'POST /api/trading/orders partial sell',
	'/api/trading/orders',
	json({ orgId: 'b3', ticker: 'PETR4', side: 'SELL', qty: 1, unitPrice: 40, date: Date.parse('2026-11-12T12:00:00') })
);
must('POST /api/trading/orders partial sell', partialSell, (r) => r.status === 400, '400: a sale must close the full position');

const tradeSell = await api(
	'POST /api/trading/orders sell',
	'/api/trading/orders',
	json({ orgId: 'b3', ticker: 'PETR4', side: 'SELL', qty: 2, unitPrice: 40, date: Date.parse('2026-11-12T12:00:00') })
);
must(
	'POST /api/trading/orders sell',
	tradeSell,
	(r) =>
		r.status === 201 &&
		r.body.order?.value === 80 &&
		Math.abs(r.body.order?.fees - 0.024) < 1e-9 &&
		Math.abs(r.body.order?.irrf - 0.004) < 1e-9 &&
		Math.abs(r.body.order?.net - 79.972) < 1e-9,
	'201 with value 80, fees 0.024, dedo-duro 0.004 and net 79.972'
);
volatile.add(tradeSell.body.order?.id);
volatile.add(tradeSell.body.order?.created_at);

const tradingSummary = await api('GET /api/trading/summary', '/api/trading/summary?org=b3');
must(
	'GET /api/trading/summary',
	tradingSummary,
	(r) =>
		r.status === 200 &&
		r.body.summary?.positions?.length === 0 &&
		Math.abs((r.body.summary?.orders?.find((o) => o.side === 'SELL')?.profit ?? 0) - 2.9489) < 1e-6 &&
		r.body.summary?.months?.some(
			(m) => m.month === '11/2026' && m.sales === 80 && Math.abs(m.fees - 0.0471) < 1e-9 && m.exempt === true
		),
	'the sale profits 2.9489, November pays 0.0471 in round-trip fees and stays exempt'
);

	const delSell = await api('DELETE /api/trading/orders/[id] latest', `/api/trading/orders/${tradeSell.body.order.id}`, {
		method: 'DELETE'
	});
must('DELETE /api/trading/orders latest', delSell, (r) => r.status === 200, '200 removing the latest order');

const delBuy = await api('DELETE /api/trading/orders/[id] now-latest', `/api/trading/orders/${tradeBuy.body.order.id}`, {
	method: 'DELETE'
});
must('DELETE /api/trading/orders now-latest', delBuy, (r) => r.status === 200, '200 removing the new latest order');

const rebuy = await api(
	'POST /api/trading/orders rebuy',
	'/api/trading/orders',
	json({ orgId: 'b3', ticker: 'PETR4', side: 'BUY', qty: 2, unitPrice: 38.5, date: Date.parse('2026-11-03T12:00:00') })
);
must('POST /api/trading/orders rebuy', rebuy, (r) => r.status === 201, '201 rebuilding the fixture position');
volatile.add(rebuy.body.order?.id);
volatile.add(rebuy.body.order?.created_at);

const resell = await api(
	'POST /api/trading/orders resell',
	'/api/trading/orders',
	json({ orgId: 'b3', ticker: 'PETR4', side: 'SELL', qty: 2, unitPrice: 40, date: Date.parse('2026-11-12T12:00:00') })
);
must('POST /api/trading/orders resell', resell, (r) => r.status === 201, '201 closing the fixture position again');
volatile.add(resell.body.order?.id);
volatile.add(resell.body.order?.created_at);

// Same-day position: buying today can never recommend a swing sale, even
// past target. A null quote keeps it on 'waiting', with sameDay true.
const nowMs = Date.now();
const todayBuy = await api(
	'POST /api/trading/orders same-day buy',
	'/api/trading/orders',
	json({ orgId: 'b3', ticker: 'VALE3', side: 'BUY', qty: 1, unitPrice: 60, date: nowMs })
);
must('POST /api/trading/orders same-day buy', todayBuy, (r) => r.status === 201, '201 opening a same-day position');
volatile.add(todayBuy.body.order?.id);
volatile.add(todayBuy.body.order?.created_at);
volatile.add(todayBuy.body.order?.date);

const todaySummary = await api('GET /api/trading/summary same-day', '/api/trading/summary?org=b3');
must(
	'GET /api/trading/summary same-day',
	todaySummary,
	(r) =>
		r.status === 200 &&
		r.body.summary?.positions?.length === 1 &&
		r.body.summary.positions[0].ticker === 'VALE3' &&
		r.body.summary.positions[0].sameDay === true &&
		r.body.summary.positions[0].recommendation === 'waiting' &&
		Math.abs((r.body.summary.positions[0].targetPrice ?? 0) - 61.84) < 0.01,
	'the same-day position waits, never sells, and prices the 3% goal'
);

const delToday = await api('DELETE /api/trading/orders/[id] same-day', `/api/trading/orders/${todayBuy.body.order.id}`, {
	method: 'DELETE'
});
must('DELETE /api/trading/orders/[id] same-day', delToday, (r) => r.status === 200, '200 removing the same-day order');

const strip = await api('GET /api/trading/strip', '/api/trading/strip');
must(
	'GET /api/trading/strip',
	strip,
	(r) => r.status === 200 && Array.isArray(r.body.positions),
	'200 with the open-ticker strip'
);

const tradeHistoryEmpty = await api('GET /api/trading/quotes/history empty', '/api/trading/quotes/history?org=b3&ticker=VALE3');
must(
	'GET /api/trading/quotes/history empty',
	tradeHistoryEmpty,
	(r) => r.status === 200 && Array.isArray(r.body.points),
	'200 with an array (no snapshots yet in the fixture)'
);

const quoteLog = await api('GET /api/quotes/log', '/api/quotes/log?limit=50');
must(
	'GET /api/quotes/log',
	quoteLog,
	(r) =>
		r.status === 200 &&
		Array.isArray(r.body.entries) &&
		r.body.entries.some((e) => e.ticker === 'BTC_USDC' && e.source === 'ripio'),
	'200 with the quote fetch history including the Ripio attempt'
);
for (const e of quoteLog.body.entries ?? []) {
	volatile.add(e.fetched_at);
	if (typeof e.price === 'number') volatile.add(e.price);
}

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
	const count = (table) => d.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
	exportCheck = {
		quickCheck: d.pragma('quick_check', { simple: true }),
		notes: count('notes'),
		vectors: count('note_vectors'),
		fts: count('notes_fts'),
		featured: d.prepare('SELECT COUNT(*) AS c FROM notes WHERE featured = 1').get().c,
		videos: d.prepare("SELECT COUNT(*) AS c FROM notes WHERE video != ''").get().c,
		noteComments: count('note_comments'),
		pinnedNoteComments: d.prepare('SELECT COUNT(*) AS c FROM note_comments WHERE pinned = 1').get().c,
		todoGroups: count('todo_groups'),
		todoItems: count('todo_items'),
		taskComments: count('task_comments'),
		principles: count('principles'),
		principleComments: count('principle_comments'),
		tagColors: count('tag_colors'),
		holdings: count('holdings'),
		holdingActions: count('holding_actions'),
		holdingValueHistory: count('holding_value_history'),
		portfolioValueHistory: count('portfolio_value_history'),
		goals: count('category_goals'),
		valueGoals: count('category_value_goals'),
		stocks: count('stock_items'),
		stockPhotos: d.prepare('SELECT COUNT(*) AS c FROM stock_item_photos').get().c,
		stockActions: count('stock_item_actions'),
		stockBrands: d.prepare("SELECT COUNT(*) AS c FROM stock_registries WHERE kind = 'brand'").get().c,
		stockCategories: d.prepare("SELECT COUNT(*) AS c FROM stock_registries WHERE kind = 'category'").get().c,
		shoppingExtras: count('shopping_extras'),
		tradingOrgs: count('trading_orgs'),
		tradingOrders: count('trading_orders'),
		tradingQuoteHistory: count('trading_quote_history'),
		b3Tickers: count('b3_tickers')
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
must(
	'POST /api/import',
	{
		status: imported.status,
		body: {
			errors: events.filter((e) => e.error).map((e) => e.error),
			done: events.find((e) => e.done)?.counts ?? null
		}
	},
	(r) =>
		r.status === 200 &&
		r.body.errors.length === 0 &&
		r.body.done?.todoGroups === 1 &&
		r.body.done?.todoItems === 1 &&
		r.body.done?.principles === 1 &&
		r.body.done?.holdings === 2 &&
		r.body.done?.goals === 3 &&
		r.body.done?.valueGoals === 1 &&
		r.body.done?.holdingValueHistory >= 1 &&
		r.body.done?.portfolioValueHistory >= 1 &&
		r.body.done?.shoppingExtras === 1 &&
		r.body.done?.tradingOrgs === 2 &&
		r.body.done?.tradingOrders === 2 &&
		r.body.done?.tradingQuoteHistory === 0 &&
		r.body.done?.b3Tickers >= 100 &&
		r.body.done?.stocks === 2 &&
		r.body.done?.stockGoal === 1 &&
		r.body.done?.books === 1,
	'200 with a count for every restored section'
);

// Read back every section through the API. The counts above prove the rows
// were copied; these checks prove the UI can see them.
const restoredNote = await api(
	'GET /api/notes/[id] after restore',
	`/api/notes/${noteIdForComment}`
);
must(
	'GET /api/notes/[id] after restore',
	restoredNote,
	(r) => r.status === 200 && r.body.note?.featured === true && r.body.note?.video === 'dQw4w9WgXcQ',
	'a featured note with its video'
);

const restoredNoteComments = await api(
	'GET /api/notes/[id]/comments after restore',
	`/api/notes/${noteIdForComment}/comments`
);
must(
	'GET /api/notes/[id]/comments after restore',
	restoredNoteComments,
	(r) => r.body.comments?.some((c) => c.content === 'Note comment that must survive a restore'),
	'the note comment'
);
must(
	'GET /api/notes/[id]/comments after restore',
	restoredNoteComments,
	(r) => r.body.comments?.[0]?.pinned === true && r.body.comments?.[0]?.content === 'Note comment that must survive a restore',
	'the pinned note comment first'
);

const restoredGroups = await api('GET /api/todo/groups after restore', '/api/todo/groups');
must(
	'GET /api/todo/groups after restore',
	restoredGroups,
	(r) => r.body.groups?.some((g) => g.id === groupId && g.name === 'Restore group'),
	'the todo group'
);

const restoredItems = await api(
	'GET /api/todo/groups/[id]/items after restore',
	`/api/todo/groups/${groupId}/items`
);
must(
	'GET /api/todo/groups/[id]/items after restore',
	restoredItems,
	(r) =>
		r.body.items?.some(
			(i) => i.id === itemId && i.content === 'Task that must survive a restore' && i.tags.includes('trip') && i.video === '9bZkp7q19f0'
		),
	'the todo item, its tag and its video'
);

const restoredTaskComments = await api(
	'GET /api/todo/items/[id]/comments after restore',
	`/api/todo/items/${itemId}/comments`
);
must(
	'GET /api/todo/items/[id]/comments after restore',
	restoredTaskComments,
	(r) => r.body.comments?.some((c) => c.content === 'Task comment that must survive a restore'),
	'the task comment'
);

const restoredPrinciples = await api('GET /api/principles after restore', '/api/principles');
must(
	'GET /api/principles after restore',
	restoredPrinciples,
	(r) =>
		r.body.principles?.some(
			(p) => p.id === principleId && p.content === 'Principle that must survive a restore' && p.tags.includes('trip')
		),
	'the principle and its tag'
);

const restoredPrincipleComments = await api(
	'GET /api/principles/[id]/comments after restore',
	`/api/principles/${principleId}/comments`
);
must(
	'GET /api/principles/[id]/comments after restore',
	restoredPrincipleComments,
	(r) => r.body.comments?.some((c) => c.content === 'Principle comment that must survive a restore'),
	'the principle comment'
);

const restoredColors = await api('GET /api/tags after restore', '/api/tags');
must(
	'GET /api/tags after restore',
	restoredColors,
	(r) => r.status === 200 && r.body.colors?.garden === 'violet',
	'the tag color'
);

const restoredHoldings = await api('GET /api/holdings after restore', '/api/holdings');
must(
	'GET /api/holdings after restore',
	restoredHoldings,
	(r) =>
		r.status === 200 &&
		r.body.holdings?.length === 2 &&
		r.body.holdings.some((h) => h.ticker === 'MXRF11' && h.price === 20 && h.price_updated_at > 0 && h.avgPrice === 12) &&
		r.body.holdings.some((h) => h.ticker === 'NUBANK' && h.bank === 'Nubank' && h.country === 'BR' && h.price === 1 && h.price_updated_at > 0 && h.avgPrice === 1) &&
		r.body.totalUsd === 3000 &&
		r.body.goals?.cash === 30 &&
		r.body.valueGoals?.fii?.amount === 250000 &&
		r.body.valueGoals?.fii?.currency === 'BRL' &&
		r.body.drift?.some((d) => d.category === 'fii'),
	'the FII with its average cost and the cash holding with bank and country intact'
);

const restoredActions = rememberActions(await api(
	'GET /api/holdings/[id]/actions after restore',
	`/api/holdings/${fiiId}/actions`
));
must(
	'GET /api/holdings/[id]/actions after restore',
	restoredActions,
	(r) =>
		r.status === 200 &&
		r.body.actions?.length === 3 &&
		r.body.actions.find((a) => a.kind === 'opening')?.amount === 95 &&
		r.body.actions.find((a) => a.kind === 'opening')?.price === 12 &&
		r.body.actions.some((a) => a.kind === 'buy' && a.amount === 10 && a.price === 12.5) &&
		r.body.actions.some((a) => a.kind === 'sell' && a.amount === 5 && a.price === 10),
	'the buy and sell history survives the export and import'
);

const restoredHoldingHistory = await api('GET /api/holdings/[id]/history after restore', `/api/holdings/${fiiId}/history`);
must(
	'GET /api/holdings/[id]/history after restore',
	restoredHoldingHistory,
	(r) => r.status === 200 && r.body.points?.length === 1 && r.body.points[0].value > 0,
	'holding value history survives the export and import'
);

const restoredPortfolioHistory = await api('GET /api/holdings/history after restore', '/api/holdings/history');
must(
	'GET /api/holdings/history after restore',
	restoredPortfolioHistory,
	(r) => r.status === 200 && r.body.points?.length === 1 && r.body.points[0].value_usd > 0,
	'portfolio value history survives the export and import'
);

const restoredTrades = await api('GET /api/holdings/actions after restore', '/api/holdings/actions?limit=50');
must(
	'GET /api/holdings/actions after restore',
	restoredTrades,
	(r) =>
		r.status === 200 &&
		r.body.count === 2 &&
		r.body.items?.length === 2 &&
		r.body.items.some((t) => t.kind === 'buy' && t.amount === 10 && t.ticker === 'MXRF11') &&
		r.body.items.some((t) => t.kind === 'sell' && t.amount === 5 && t.ticker === 'MXRF11'),
	'the trade list survives the export and import'
);
for (const t of restoredTrades.body.items ?? []) {
	volatile.add(t.id);
	volatile.add(t.created_at);
}

const stockPrintAll = await fetch(`${base}/api/stocks/print?scope=all`);
results.push(['GET /api/stocks/print?scope=all', { status: stockPrintAll.status, contentType: stockPrintAll.headers.get('content-type') }]);
must(
	'GET /api/stocks/print?scope=all',
	{ status: stockPrintAll.status, body: { contentType: stockPrintAll.headers.get('content-type') } },
	(r) => r.status === 200 && r.body.contentType === 'text/html; charset=utf-8',
	'200 with inline printable HTML'
);

const stockPrintAllText = await stockPrintAll.text();
must(
	'GET /api/stocks/print?scope=all shopping extra',
	{ body: stockPrintAllText },
	(r) => !r.body.includes('Birthday card'),
	'the detailed stock report does not include shopping extras'
);

const stockPrintShopping = await fetch(`${base}/api/stocks/print?scope=shopping`);
const stockPrintShoppingText = await stockPrintShopping.text();
must(
	'GET /api/stocks/print?scope=shopping',
	{ status: stockPrintShopping.status, text: stockPrintShoppingText },
	(r) =>
		r.status === 200 &&
		r.text.includes('<input type="checkbox"') &&
		r.text.includes('Shopping list') &&
		r.text.includes('Birthday card') &&
		!r.text.includes('Stock / target') &&
		!r.text.includes('Progress') &&
		!r.text.includes('Expires') &&
		!r.text.includes('people'),
	'200 with the simple checkbox shopping list and no stock report tables'
);

const restoredStocks = await api('GET /api/stocks/items after restore', '/api/stocks/items');
must(
	'GET /api/stocks/items after restore',
	restoredStocks,
	(r) =>
		r.status === 200 &&
		r.body.items?.length === 2 &&
		r.body.items.some((i) => i.id === consumableId && i.kind === 'consumable' && i.name === 'Toothpaste' && i.brand === 'Colgate' && i.category === 'Toothpaste' && i.group === 'Food' && i.quantity === 0.5 && i.duration_days === 0 && i.package_size === 100 && i.package_unit === 'g' && i.price === null && i.expires_at === 1767225600000 && i.photos?.length === 1 && i.photos[0]?.id === keptPhotoId) &&
		r.body.items.some((i) => i.id === durableId && i.kind === 'durable' && i.name === 'Watch' && i.brand === 'Casio' && i.category === 'Watch' && i.price === 2500 && i.currency === 'BRL' && i.bought_where === 'Downtown shop'),
	'the consumable with its one remaining photo and the durable with its brand, category and price'
);

const restoredStockPhoto = await fetch(`${base}/api/stocks/photos/${keptPhotoId}`);
const restoredStockPhotoBytes = new Uint8Array(await restoredStockPhoto.arrayBuffer());
results.push([
	'GET /api/stocks/photos/[photoId] after restore',
	{ status: restoredStockPhoto.status, contentType: restoredStockPhoto.headers.get('content-type'), bytes: restoredStockPhotoBytes.length }
]);
must(
	'GET /api/stocks/photos/[photoId] after restore',
	{ status: restoredStockPhoto.status, body: { contentType: restoredStockPhoto.headers.get('content-type'), bytes: restoredStockPhotoBytes.length } },
	(r) => r.status === 200 && r.body.contentType === 'image/png' && r.body.bytes > 0,
	'the photo bytes survive the export and import'
);

const restoredStockGoals = await api('GET /api/stocks/goals after restore', '/api/stocks/goals');
must(
	'GET /api/stocks/goals after restore',
	restoredStockGoals,
	(r) =>
		r.status === 200 &&
		r.body.goals?.length === 3 &&
		r.body.goals.some(
			(g) => g.category === 'Toothpaste' && g.people === 2 && g.amount === 100 && g.unit === 'g' && g.target === 200
		) &&
		r.body.goals.some((g) => g.category === 'Oil' && g.unit === 'L') &&
		r.body.goals.some((g) => g.category === 'Rice' && g.unit === 'kg'),
	'the category goals survive the export and import'
);

const restoredRegistries = await api('GET /api/stocks/registries after restore', '/api/stocks/registries');
must(
	'GET /api/stocks/registries after restore',
	restoredRegistries,
	(r) =>
		r.status === 200 &&
		r.body.brands?.includes('Colgate') &&
		r.body.brands?.includes('Casio') &&
		r.body.categories?.includes('Toothpaste') &&
		r.body.categories?.includes('Watch') &&
		r.body.groups?.includes('Food'),
	'the brand, category and group registry survives the export and import'
);

const restoredStockActions = await api('GET /api/stocks/items/[id]/actions after restore', `/api/stocks/items/${consumableId}/actions`);
must(
	'GET /api/stocks/items/[id]/actions after restore',
	restoredStockActions,
	(r) => r.status === 200 && r.body.actions?.length === 1 && r.body.actions[0].kind === 'consume' && r.body.actions[0].amount === 50 && r.body.actions[0].packages === 0.5,
	'the consumption log survives the export and import'
);

const restoredLink = await api('GET /api/notes/[id] link after restore', `/api/notes/${linkSourceId}`);
must(
	'GET /api/notes/[id] link after restore',
	restoredLink,
	(r) =>
		r.status === 200 &&
		r.body.note?.linkedNotes?.length === 2 &&
		r.body.note.linkedNotes.some((l) => l.id === linkTargetId && l.kind === 'note') &&
		r.body.note.linkedNotes.some((l) => l.id === principleId && l.kind === 'principle'),
	'the note and principle links resolve after restore'
);

const restoredBookFile = await fetch(`${base}/api/books/${bookId}/file`);
const restoredBookBytes = new Uint8Array(await restoredBookFile.arrayBuffer());
results.push(['GET /api/books/[id]/file after restore', { status: restoredBookFile.status, bytes: restoredBookBytes.length }]);
must(
	'GET /api/books/[id]/file after restore',
	{ status: restoredBookFile.status, body: { bytes: restoredBookBytes.length } },
	(r) => r.status === 200 && r.body.bytes === epubBytes.length,
	'the EPUB bytes survive the export/import round trip unchanged'
);
const restoredBook = await api('GET /api/books/[id] after restore', `/api/books/${bookId}`);
must(
	'GET /api/books/[id] after restore',
	restoredBook,
	(r) => r.status === 200 && r.body.book?.lastPct === 0.42 && r.body.book?.lastChapter === 'Chapter One',
	'the saved reading position survives the restore'
);

// Last: the global update runs against live markets after every fixture
// assertion, so its real rates and snapshots never pollute the export.
const marketRefresh = await api('POST /api/market/refresh', '/api/market/refresh', { method: 'POST' });
must(
	'POST /api/market/refresh',
	marketRefresh,
	(r) => r.status === 200 && r.body.summary !== null && Array.isArray(r.body.tickers) && Array.isArray(r.body.errors) && Array.isArray(r.body.quotes),
	'200 with the holdings summary, refreshed tickers, per-ticker quote results and errors'
);
// Live rates drift between runs, so the golden keeps the shape only:
// status, refreshed tickers and holding tickers. Quotes themselves are
// covered structurally, never byte-compared.
{
	const entry = results.find(([n]) => n === 'POST /api/market/refresh');
	if (entry) {
		entry[1] = {
			status: marketRefresh.status,
			tickers: marketRefresh.body.tickers,
			holdings: (marketRefresh.body.summary?.holdings ?? []).map((h) => h.ticker)
		};
	}
}

// --- Ripio API credentials -------------------------------------------------
// The keys live in the journal but the endpoints only ever report status:
// a token or secret must never make the round trip. Nothing here fetches a
// quote, so the log recorded above stays exactly as the public path wrote it.
const credSave = await api(
	'PUT /api/config/credentials/ripio',
	'/api/config/credentials/ripio',
	json({ token: 'smoke-token-123', secret: 'smoke-secret-456' }, 'PUT')
);
must(
	'PUT /api/config/credentials/ripio',
	credSave,
	(r) =>
		r.status === 200 &&
		r.body.configured === true &&
		r.body.updatedAt > 0 &&
		r.body.token === undefined &&
		r.body.secret === undefined,
	'200 configured status with no secret fields'
);
volatile.add(credSave.body.updatedAt);
const credBad = await api('PUT /api/config/credentials/ripio bad', '/api/config/credentials/ripio', json({ token: 'only-token' }, 'PUT'));
must('PUT /api/config/credentials/ripio bad', credBad, (r) => r.status === 400, '400 when either half is missing');
const credRead = await api('GET /api/config/credentials/ripio', '/api/config/credentials/ripio');
must(
	'GET /api/config/credentials/ripio',
	credRead,
	(r) => r.status === 200 && r.body.configured === true && !('token' in r.body) && !('secret' in r.body),
	'200 status only, never the stored values'
);
const credDel = await api('DELETE /api/config/credentials/ripio', '/api/config/credentials/ripio', { method: 'DELETE' });
must('DELETE /api/config/credentials/ripio', credDel, (r) => r.status === 200 && r.body.configured === false, '200 not configured after delete');

// --- Nostr -------------------------------------------------------------
// The nsec never leaves the server. The embedded relay is the backup store:
// the HTTP publish path signs and stores, a WebSocket REQ reads it back, and
// a foreign author is refused.
const nostrProfile = await api('GET /api/nostr/profile', '/api/nostr/profile');
must(
	'GET /api/nostr/profile',
	nostrProfile,
	(r) =>
		r.status === 200 &&
		r.body.configured === false &&
		!('nsec' in r.body) &&
		typeof r.body.relayUrl === 'string' &&
		r.body.relayUrl.endsWith('/relay'),
	'200 status only, no nsec, and a relay address'
);
const nostrPublishNoAccount = await api('POST /api/nostr/publish (no account)', '/api/nostr/publish', json({ content: 'hello' }));
must('POST /api/nostr/publish (no account)', nostrPublishNoAccount, (r) => r.status === 400, '400 without a configured account');
const nostrNoKey = await api('PUT /api/nostr/profile (no nsec)', '/api/nostr/profile', json({ name: 'Smoke' }, 'PUT'));
must('PUT /api/nostr/profile (no nsec)', nostrNoKey, (r) => r.status === 400, '400 without an nsec');
const nostrBadKey = await api('PUT /api/nostr/profile (bad nsec)', '/api/nostr/profile', json({ nsec: 'nsec1notakey' }, 'PUT'));
must('PUT /api/nostr/profile (bad nsec)', nostrBadKey, (r) => r.status === 400, '400 for an invalid nsec');

// NIP-11: what a client reads before adding the relay.
const nip11Res = await fetch(`${base}/relay`, { headers: { accept: 'application/nostr+json' } });
const nip11 = await nip11Res.json();
must(
	'GET /relay (NIP-11)',
	{ status: nip11Res.status, body: nip11 },
	(r) => r.status === 200 && Array.isArray(r.body.supported_nips) && r.body.supported_nips.includes(1),
	'200 with a NIP-11 document'
);
results.push([
	'GET /relay (NIP-11)',
	{
		status: nip11Res.status,
		body: {
			name: nip11.name,
			supported_nips: nip11.supported_nips,
			restricted_writes: nip11.limitation?.restricted_writes
		}
	}
]);

// A throwaway account: generated here, never written to a real relay.
const ownerSecret = generateSecretKey();
const ownerPubkey = getPublicKey(ownerSecret);
const ownerNsec = nip19.nsecEncode(ownerSecret);
const nostrAccount = await api('PUT /api/nostr/profile (owner)', '/api/nostr/profile', json({ nsec: ownerNsec }, 'PUT'));
must(
	'PUT /api/nostr/profile (owner)',
	nostrAccount,
	(r) => r.status === 200 && r.body.configured === true && r.body.npub.length > 0 && !('nsec' in r.body),
	'200 with the derived npub and no nsec'
);
volatile.add(nostrAccount.body.npub);
volatile.add(nostrAccount.body.updatedAt);
volatile.add(nostrAccount.body.stats?.lastStoredAt);

// Publish through the app: signs, stores, and sends to the account relays
// (which the test points at this same relay).
const publishRes = await fetch(`${base}/api/nostr/publish`, json({ content: 'smoke note from fermentario' }));
const publishBody = await publishRes.json();
must(
	'POST /api/nostr/publish',
	{ status: publishRes.status, body: publishBody },
	(r) => r.status === 200 && typeof r.body.event?.id === 'string' && r.body.publishedTo.length >= 1,
	'200 with a signed event and at least one relay'
);
volatile.add(publishBody.event.id);
volatile.add(publishBody.event.created_at);
volatile.add(publishBody.event.sig);
volatile.add(publishBody.stats?.lastStoredAt);
results.push([
	'POST /api/nostr/publish',
	{ status: publishRes.status, body: { signed: true, relayCount: publishBody.publishedTo.length, notes: publishBody.stats.notes } }
]);

// WebSocket client against the embedded relay.
function openRelay() {
	const socket = new WebSocket(`ws://127.0.0.1:${port}/relay`);
	const inbox = [];
	const used = new Set();
	const waiters = new Set();
	const flush = () => {
		for (const waiter of [...waiters]) {
			const index = inbox.findIndex((message, i) => !used.has(i) && waiter.predicate(message));
			if (index < 0) continue;
			used.add(index);
			waiters.delete(waiter);
			clearTimeout(waiter.timer);
			waiter.resolve(inbox[index]);
		}
	};
	socket.onmessage = (raw) => {
		inbox.push(JSON.parse(String(raw.data)));
		flush();
	};
	return {
		ready: new Promise((resolve, reject) => {
			socket.onopen = () => resolve();
			socket.onerror = () => reject(new Error('relay refused the connection'));
		}),
		send: (message) => socket.send(JSON.stringify(message)),
		take(predicate, ms = 8000) {
			return new Promise((resolve, reject) => {
				const waiter = {
					predicate,
					resolve,
					timer: setTimeout(() => {
						waiters.delete(waiter);
						reject(new Error('relay did not answer in time'));
					}, ms)
				};
				waiters.add(waiter);
				flush();
			});
		},
		close: () => {
			try {
				socket.close();
			} catch {}
		}
	};
}

const relay = openRelay();
await relay.ready;
relay.send(['REQ', 'smoke-read', { kinds: [1], authors: [ownerPubkey], limit: 10 }]);
const relayEvent = await relay.take((m) => m[0] === 'EVENT' && m[1] === 'smoke-read');
await relay.take((m) => m[0] === 'EOSE' && m[1] === 'smoke-read');
must(
	'relay REQ returns the published note',
	{ status: 200, body: relayEvent },
	(r) => r.body[2]?.content === 'smoke note from fermentario' && r.body[2]?.pubkey === ownerPubkey,
	'the published note for the owner pubkey'
);
results.push([
	'relay REQ returns the published note',
	{ status: 200, body: { content: relayEvent[2].content, authorMatches: relayEvent[2].pubkey === ownerPubkey } }
]);

// A different author cannot write: the relay is a backup of one account.
const foreignSecret = generateSecretKey();
const foreignEvent = finalizeEvent(
	{ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'not the owner' },
	foreignSecret
);
relay.send(['EVENT', foreignEvent]);
const rejected = await relay.take((m) => m[0] === 'OK' && m[1] === foreignEvent.id);
must(
	'relay rejects a foreign author',
	{ status: 200, body: rejected },
	(r) => r.body[2] === false && String(r.body[3]).startsWith('restricted'),
	'OK false with a restricted reason'
);
results.push(['relay rejects a foreign author', { status: 200, body: { accepted: rejected[2], restricted: true } }]);

// The owner writes over the socket, which is how Primal will publish here.
const ownerEvent = finalizeEvent(
	{ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'smoke note over the relay socket' },
	ownerSecret
);
relay.send(['EVENT', ownerEvent]);
const accepted = await relay.take((m) => m[0] === 'OK' && m[1] === ownerEvent.id);
must('relay accepts the owner', { status: 200, body: accepted }, (r) => r.body[2] === true, 'OK true for the owner');
results.push(['relay accepts the owner', { status: 200, body: { accepted: accepted[2] } }]);
relay.close();

// The section's switch: the status pair, then a real stop and start. Stopping
// must refuse the WebSocket handshake, not only flip a label; the NIP-11
// document keeps answering either way.
const relayStatus = await api('GET /api/nostr/relay', '/api/nostr/relay');
must(
	'GET /api/nostr/relay',
	relayStatus,
	(r) =>
		r.status === 200 &&
		r.body.running === true &&
		typeof r.body.url === 'string' &&
		r.body.url.endsWith('/relay'),
	'200, running, and a relay address'
);
const relayStop = await api('POST /api/nostr/relay (stop)', '/api/nostr/relay', json({ running: false }));
must('POST /api/nostr/relay (stop)', relayStop, (r) => r.status === 200 && r.body.running === false, '200 and running false');
const stoppedRefused = await openRelay()
	.ready.then(() => false)
	.catch(() => true);
must(
	'relay refuses the handshake while stopped',
	{ status: 0, body: { refused: stoppedRefused } },
	() => stoppedRefused,
	'a failed WebSocket handshake'
);
results.push(['relay refuses the handshake while stopped', { status: 0, body: { refused: true } }]);
const nip11WhileStopped = await fetch(`${base}/relay`, { headers: { accept: 'application/nostr+json' } });
must(
	'GET /relay while stopped',
	{ status: nip11WhileStopped.status, body: {} },
	(r) => r.status === 200,
	'200 with the NIP-11 document'
);
results.push(['GET /relay while stopped', { status: nip11WhileStopped.status, body: {} }]);
const relayStart = await api('POST /api/nostr/relay (start)', '/api/nostr/relay', json({ running: true }));
must('POST /api/nostr/relay (start)', relayStart, (r) => r.status === 200 && r.body.running === true, '200 and running true');
const relayAgain = openRelay();
const relayListening = await relayAgain.ready.then(() => true).catch(() => false);
relayAgain.close();
must(
	'relay accepts the handshake after start',
	{ status: 200, body: { listening: relayListening } },
	(r) => r.body.listening === true,
	'a WebSocket connection'
);
results.push(['relay accepts the handshake after start', { status: 200, body: { listening: true } }]);

// The backup loop pages backwards with `until`. These two calls prove the
// contract the section drives: a whole batch, then an older cursor. The relay
// is also the source here, so both events are already stored: imported is 0.
const syncNewest = await fetch(`${base}/api/nostr/sync`, json({}));
const syncNewestBody = await syncNewest.json();
must(
	'POST /api/nostr/sync',
	{ status: syncNewest.status, body: syncNewestBody },
	(r) =>
		r.status === 200 &&
		r.body.fetched === 2 &&
		r.body.imported === 0 &&
		r.body.hasMore === false &&
		typeof r.body.nextCursor === 'number' &&
		r.body.stats.total === 2 &&
		r.body.lastSyncAt > 0,
	'200 with the batch, no re-import, and a last sync time'
);
results.push([
	'POST /api/nostr/sync',
	{
		status: syncNewest.status,
		body: {
			fetched: syncNewestBody.fetched,
			imported: syncNewestBody.imported,
			hasMore: syncNewestBody.hasMore,
			statsTotal: syncNewestBody.stats.total,
			lastSyncAtRecorded: true
		}
	}
]);
const syncOlder = await fetch(`${base}/api/nostr/sync`, json({ until: 1 }));
const syncOlderBody = await syncOlder.json();
must(
	'POST /api/nostr/sync (before the first note)',
	{ status: syncOlder.status, body: syncOlderBody },
	(r) => r.status === 200 && r.body.fetched === 0 && r.body.imported === 0 && r.body.hasMore === false,
	'200 with no events older than the first note'
);
results.push([
	'POST /api/nostr/sync (before the first note)',
	{ status: syncOlder.status, body: { fetched: syncOlderBody.fetched, imported: syncOlderBody.imported, hasMore: syncOlderBody.hasMore } }
]);
const profileAfterSync = await fetch(`${base}/api/nostr/profile`);
const profileAfterSyncBody = await profileAfterSync.json();
must(
	'GET /api/nostr/profile (after sync)',
	{ status: profileAfterSync.status, body: profileAfterSyncBody },
	(r) => r.status === 200 && r.body.lastSyncAt > 0,
	'200 with the last sync time the card shows'
);
results.push([
	'GET /api/nostr/profile (after sync)',
	{ status: profileAfterSync.status, body: { lastSyncAtSet: profileAfterSyncBody.lastSyncAt > 0 } }
]);

// The stored events feed the section without paging.
const nostrEventsRes = await fetch(`${base}/api/nostr/events?limit=5`);
const nostrEvents = await nostrEventsRes.json();
must(
	'GET /api/nostr/events?limit=5',
	{ status: nostrEventsRes.status, body: nostrEvents },
	(r) => r.status === 200 && r.body.events.length === 2 && r.body.events.every((e) => e.pubkey === ownerPubkey),
	'200 with the two backed-up events'
);
results.push([
	'GET /api/nostr/events?limit=5',
	{ status: nostrEventsRes.status, body: { count: nostrEvents.events.length, allOwner: true } }
]);

// The heatmap keeps its two series.
const nostrHeatRes = await fetch(`${base}/api/nostr/heatmap`);
const nostrHeat = await nostrHeatRes.json();
must(
	'GET /api/nostr/heatmap',
	{ status: nostrHeatRes.status, body: nostrHeat },
	(r) => r.status === 200 && Array.isArray(r.body.published) && Array.isArray(r.body.replies),
	'200 with published and replies arrays'
);
results.push([
	'GET /api/nostr/heatmap',
	{
		status: nostrHeatRes.status,
		body: {
			publishedIsArray: Array.isArray(nostrHeat.published),
			repliesIsArray: Array.isArray(nostrHeat.replies),
			publishedTotal: nostrHeat.published.reduce((sum, day) => sum + day.count, 0)
		}
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
