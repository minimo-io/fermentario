/**
 * Onboarding smoke test.
 *
 * Starts the production build three times with throwaway data directories:
 *  1. no journal -> welcome -> create empty -> normal app
 *  2. no journal -> restore the frozen fixture -> notes are present
 *  3. no journal -> a bad upload -> still no journal
 *
 * `pnpm test` stays the "nothing regressed" web gate. This script is the
 * companion for the state transitions that the golden run cannot cover because
 * it starts with a journal already present.
 *
 *   node scripts/onboarding-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'tests/fixtures/journal.db');

if (!existsSync(join(ROOT, 'build/index.js'))) {
	console.error('No production build. Run `pnpm run build` first.');
	process.exit(1);
}
if (!existsSync(FIXTURE)) {
	console.error('No fixture. Run `node scripts/make-fixture.mjs` first.');
	process.exit(1);
}

function freePort() {
	return new Promise((res, rej) => {
		const server = createServer();
		server.on('error', rej);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => res(port));
		});
	});
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function start(dataDir) {
	const port = await freePort();
	const base = `http://127.0.0.1:${port}`;
	const child = spawn(process.execPath, ['--unhandled-rejections=warn', join(ROOT, 'build/index.js')], {
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
			FERMENTARIO_MODEL_CACHE: join(dataDir, 'models'),
			NODE_OPTIONS: `--import ${join(ROOT, 'scripts/offline-guard.mjs')}`
		}
	});
	let log = '';
	child.stdout.on('data', (d) => (log += d));
	child.stderr.on('data', (d) => (log += d));

	const deadline = Date.now() + 30_000;
	for (;;) {
		try {
			const res = await fetch(`${base}/api/status`);
			if (res.ok) break;
		} catch {
			// Not listening yet.
		}
		if (Date.now() > deadline) {
			child.kill('SIGKILL');
			throw new Error(`Server never came up:\n${log}`);
		}
		await new Promise((r) => setTimeout(r, 150));
	}

	return {
		base,
		async stop() {
			if (!child.killed) child.kill('SIGKILL');
			await new Promise((r) => child.once('exit', r));
		}
	};
}

function makeDataDir() {
	const work = mkdtempSync(join(tmpdir(), 'ferm-onboarding-'));
	const dataDir = join(work, 'data');
	mkdirSync(dataDir, { recursive: true });
	return { work, dataDir };
}

async function sceneEmpty() {
	const { work, dataDir } = makeDataDir();
	const server = await start(dataDir);
	try {
		const root = await fetch(`${server.base}/`, { redirect: 'manual' });
		assert(root.status === 307, `GET / should redirect, got ${root.status}`);
		assert(
			root.headers.get('location') === '/welcome',
			`GET / should redirect to /welcome, got ${root.headers.get('location')}`
		);

		const welcome = await fetch(`${server.base}/welcome`);
		const html = await welcome.text();
		assert(welcome.status === 200, `GET /welcome returned ${welcome.status}`);
		assert(
			html.includes('Create an empty journal'),
			'welcome page should offer an empty journal'
		);

		const blocked = await fetch(`${server.base}/api/notes`);
		assert(blocked.status === 409, `GET /api/notes should be 409, got ${blocked.status}`);
		const blockedBody = await blocked.json();
		assert(blockedBody.code === 'NO_JOURNAL', 'blocked API should report NO_JOURNAL');

		const status = await fetch(`${server.base}/api/status`);
		const statusBody = await status.json();
		assert(status.status === 200, `GET /api/status returned ${status.status}`);
		assert(statusBody.notes === 0, 'status should report zero notes without a journal');

		const create = await fetch(`${server.base}/api/journal`, { method: 'POST' });
		const created = await create.json();
		assert(create.status === 201, `POST /api/journal returned ${create.status}`);
		assert(created.state === 'active', 'create should activate the new journal');
		assert(created.journal?.schemaVersion === 1, 'new journal should be at schema version 1');

		const journalPath = join(dataDir, 'journals', created.journal.id, 'journal.db');
		assert(existsSync(journalPath), 'new journal file should exist');
		const db = new Database(journalPath, { readonly: true });
		const tables = new Set(
			db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all()
				.map((row) => row.name)
		);
		for (const table of [
			'notes',
			'note_tags',
			'todo_groups',
			'todo_items',
			'principles',
			'note_comments',
			'schema_migrations'
		]) {
			assert(tables.has(table), `new journal is missing ${table}`);
		}
		for (const table of [
			'notes',
			'note_tags',
			'weekly_recaps',
			'ask_history',
			'todo_groups',
			'todo_items',
			'principles',
			'note_comments',
			'tag_colors'
		]) {
			const count = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
			assert(count === 0, `new journal ${table} should be empty, got ${count}`);
		}
		db.close();

		const second = await fetch(`${server.base}/api/journal`, { method: 'POST' });
		assert(second.status === 409, `second create should be 409, got ${second.status}`);

		const home = await fetch(`${server.base}/`);
		assert(home.status === 200, `GET / after create returned ${home.status}`);
		const notes = await fetch(`${server.base}/api/notes`);
		const notesBody = await notes.json();
		assert(notes.status === 200, `GET /api/notes after create returned ${notes.status}`);
		assert(notesBody.count === 0, 'new journal should have zero notes');
	} finally {
		await server.stop();
		rmSync(work, { recursive: true, force: true });
	}
}

async function sse(body) {
	const text = await body.text();
	const events = [];
	for (const block of text.split('\n\n')) {
		for (const line of block.split('\n')) {
			if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
		}
	}
	return events;
}

async function sceneRestore() {
	const { work, dataDir } = makeDataDir();
	const server = await start(dataDir);
	try {
		const form = new FormData();
		form.append('file', new Blob([readFileSync(FIXTURE)]), 'journal.db');
		const restore = await fetch(`${server.base}/api/journal/restore`, {
			method: 'POST',
			headers: { origin: server.base },
			body: form
		});
		assert(restore.status === 200, `restore returned ${restore.status}`);
		const events = await sse(restore);
		const done = events.find((event) => event.done);
		assert(done, `restore did not finish: ${JSON.stringify(events)}`);
		assert(done.counts.notes === 5, `restore should copy 5 notes, got ${done.counts.notes}`);

		const journal = await (await fetch(`${server.base}/api/journal`)).json();
		assert(journal.state === 'active', 'restore should activate the new journal');
		assert(existsSync(join(dataDir, 'registry.db')), 'registry should exist');

		const notes = await (await fetch(`${server.base}/api/notes`)).json();
		assert(notes.count === 5, `restored journal should report 5 notes, got ${notes.count}`);
		assert(notes.notes.length === 5, 'restored journal should return five note rows');
	} finally {
		await server.stop();
		rmSync(work, { recursive: true, force: true });
	}
}

async function sceneBrokenRestore() {
	const { work, dataDir } = makeDataDir();
	mkdirSync(join(dataDir, 'journals', 'broken'), { recursive: true });
	const brokenPath = join(dataDir, 'journals', 'broken', 'journal.db');
	writeFileSync(brokenPath, 'this is not sqlite');
	const registry = new Database(join(dataDir, 'registry.db'));
	registry.exec(`
		CREATE TABLE journals (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL, schema_version INTEGER NOT NULL DEFAULT 0,
			state TEXT NOT NULL DEFAULT 'active', last_opened_at INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
	`);
	registry
		.prepare('INSERT INTO journals (id,name,path,created_at,schema_version,state,last_opened_at) VALUES (?,?,?,?,?,?,?)')
		.run('broken', 'Broken', 'journals/broken/journal.db', Date.now(), 1, 'active', 0);
	registry
		.prepare("INSERT INTO app_state (key,value) VALUES ('active_journal_id','broken'),('legacy_import_done','1')")
		.run();
	registry.close();

	const server = await start(dataDir);
	try {
		const root = await fetch(`${server.base}/`, { redirect: 'manual' });
		assert(root.status === 307, `broken journal GET / returned ${root.status}`);
		assert(
			root.headers.get('location') === '/journal-error',
			`broken journal should go to /journal-error, got ${root.headers.get('location')}`
		);
		const blocked = await fetch(`${server.base}/api/notes`);
		assert(blocked.status === 503, `broken journal API should be 503, got ${blocked.status}`);

		const form = new FormData();
		form.append('file', new Blob([readFileSync(FIXTURE)]), 'journal.db');
		const restore = await fetch(`${server.base}/api/journal/restore`, {
			method: 'POST',
			headers: { origin: server.base },
			body: form
		});
		const events = await sse(restore);
		assert(events.some((event) => event.done), 'broken-state restore should finish');
		const status = await (await fetch(`${server.base}/api/journal`)).json();
		assert(status.state === 'active', 'broken-state restore should activate the new journal');
		const notes = await (await fetch(`${server.base}/api/notes`)).json();
		assert(notes.count === 5, `broken-state restore should have 5 notes, got ${notes.count}`);
	} finally {
		await server.stop();
		rmSync(work, { recursive: true, force: true });
	}
}

async function sceneBadRestore() {
	const { work, dataDir } = makeDataDir();
	const server = await start(dataDir);
	try {
		const form = new FormData();
		form.append('file', new Blob([Buffer.from('this is not sqlite')]), 'bad.db');
		const restore = await fetch(`${server.base}/api/journal/restore`, {
			method: 'POST',
			headers: { origin: server.base },
			body: form
		});
		const events = await sse(restore);
		assert(
			events.some((event) => event.error),
			'bad restore should report an error'
		);
		const status = await (await fetch(`${server.base}/api/journal`)).json();
		assert(status.state === 'none', `bad restore should leave no journal, got ${status.state}`);
		assert(!existsSync(join(dataDir, 'journals')), 'bad restore should not leave a journal directory');
	} finally {
		await server.stop();
		rmSync(work, { recursive: true, force: true });
	}
}

await sceneEmpty();
await sceneRestore();
await sceneBrokenRestore();
await sceneBadRestore();
console.log('onboarding smoke: welcome, create, restore, broken-state restore and failed restore passed.');
