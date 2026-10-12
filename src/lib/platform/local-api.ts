import { createJournal, type Journal, type Note } from './journal';
import { createWasmDb, JOURNAL_FILE } from './wasm-db';
import { SEED_SQL } from './seed.generated';
import { splitTrailingHashtags } from '$lib/hashtags';
import type { Ask } from './journal';

/**
 * The same API the web app serves, answered from the device.
 *
 * The pages call `fetch('/api/…')` in both builds. In the web build those
 * requests reach the Node server. In the Tauri build there is no server, so
 * this module answers them from a SQLite database in OPFS instead. Keeping the
 * seam at `fetch` means the pages are identical in both, and the web app's
 * behaviour is provably untouched by the port.
 *
 * Models are not on the device yet, so `/api/chat` and `/api/summary` report
 * the same shape the pages already handle rather than throwing.
 */

let journalPromise: Promise<Journal> | null = null;
let seeded = false;

async function getJournal(): Promise<Journal> {
	journalPromise ??= (async () => {
		const db = await createWasmDb(JOURNAL_FILE);
		const journal = createJournal(db);
		journal.db.exec(journal.Schema);
		// An empty database is seeded once from the copy of the web app's
		// journal that `scripts/make-seed.mjs` turned into SQL. It runs
		// afterwards, so a database that already has notes is never touched.
		if (journal.countNotes() === 0 && SEED_SQL.trim().length > 0) {
			journal.db.transaction(() => {
				journal.db.exec(SEED_SQL);
			});
			seeded = true;
		}
		// Which VFS answered, and whether this database will still be here after
		// a restart. A wrong VFS reads and writes perfectly and loses everything,
		// so it is reported on the console, in /api/status and on /diagnostics.
		console.log(
			`[fermentario] journal at ${journal.db.filename} on vfs "${journal.db.vfsName}" — ${journal.countNotes()} notes${seeded ? ' (seeded)' : ''}`
		);
		return journal;
	})();
	return journalPromise;
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

/** The SSE shape the import overlay already parses. */
function sse(events: unknown[]): Response {
	const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
	return new Response(body, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache'
		}
	});
}

function num(v: string | null): number | null {
	if (v === null || v.trim() === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function heatmap(j: Journal) {
	const days = j.db
		.prepare(
			`SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
			 FROM notes GROUP BY day ORDER BY day`
		)
		.all() as unknown as { day: string; count: number }[];
	return { days, notes: j.countNotes() };
}

function status(j: Journal) {
	return {
		notes: j.countNotes(),
		// The embedder and the chat model are not on the device yet.
		embedding: false,
		chat: false,
		chatModel: '0.5b',
		chatReady: false,
		chatDownloaded: false,
		modelCache: 'not on the device yet',
		progress: {
			embedder: { phase: 'idle', pct: null, message: 'Not started', error: null, updatedAt: 0 },
			chat: { phase: 'idle', pct: null, message: 'Not started', error: null, updatedAt: 0 }
		},
		local: true,
		seeded,
		// The VFS decides whether writes survive a restart. A wrong one reads and
		// writes perfectly and loses everything, so it is reported.
		database: { file: j.db.filename, vfs: j.db.vfsName }
	};
}

/** A note as the pages expect it, tags included. */
function withTags(j: Journal, note: Note): Note {
	return j.getNote(note.id) ?? note;
}

async function handle(url: URL, init: RequestInit): Promise<Response | null> {
	const path = url.pathname;
	if (!path.startsWith('/api/')) return null;
	const method = (init.method ?? 'GET').toUpperCase();
	const j = await getJournal();
	const body = async () => {
		try {
			return (await init.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
		} catch {
			return {} as Record<string, unknown>;
		}
	};

	// --- notes -------------------------------------------------------------
	if (path === '/api/notes' && method === 'GET') {
		const limit = num(url.searchParams.get('limit')) ?? 50;
		const before = num(url.searchParams.get('before'));
		const beforeId = url.searchParams.get('before_id');
		const rawTag = (url.searchParams.get('tag') ?? '').trim().toLowerCase();
		if (rawTag) {
			const tag = rawTag.slice(0, 60);
			const page = j.listNotesPage({ limit, before, beforeId, tag });
			return json({ ...page, count: j.countNotesByTag(tag), tag });
		}
		const page = j.listNotesPage({ limit, before, beforeId });
		return json({ ...page, count: j.countNotes(), tag: null });
	}

	if (path === '/api/notes' && method === 'POST') {
		const b = await body();
		const raw = String(b['content'] ?? '').trim();
		if (!raw) return json({ error: 'empty note' }, 400);
		const { content, tags } = splitTrailingHashtags(raw);
		if (!content) return json({ error: 'empty note' }, 400);
		const createdAt = Number(b['created_at']) || Date.now();
		const note = j.createNote(content, createdAt);
		if (tags.length > 0) j.setNoteTags(note.id, tags);
		return json({ note: withTags(j, note) }, 201);
	}

	const noteTagMatch = /^\/api\/notes\/([^/]+)\/tags\/(.+)$/.exec(path);
	if (noteTagMatch && method === 'DELETE') {
		const id = decodeURIComponent(noteTagMatch[1]);
		const tag = decodeURIComponent(noteTagMatch[2]);
		if (!j.getNote(id)) return json({ error: 'not found' }, 404);
		if (!j.removeNoteTag(id, tag)) return json({ error: 'tag not found on this note' }, 404);
		return json({ ok: true, tag: tag.trim().toLowerCase() });
	}

	const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(path);
	if (noteMatch && (method === 'PATCH' || method === 'DELETE')) {
		const id = decodeURIComponent(noteMatch[1]);
		if (method === 'DELETE') {
			if (!j.deleteNote(id)) return json({ error: 'not found' }, 404);
			return json({ ok: true });
		}
		const b = await body();
		const raw = String(b['content'] ?? '').trim();
		if (!raw) return json({ error: 'empty note' }, 400);
		const { content, tags } = splitTrailingHashtags(raw);
		if (!content) return json({ error: 'empty note' }, 400);
		const note = j.updateNote(id, content);
		if (!note) return json({ error: 'not found' }, 404);
		// The model does not tag on the device yet, so the note keeps the tags
		// the user typed and loses the ones the old text had.
		j.setNoteTags(note.id, tags);
		return json({ note: withTags(j, note) });
	}

	// --- asks --------------------------------------------------------------
	if (path === '/api/asks' && method === 'GET') return json({ asks: j.listAsks() });

	const askMatch = /^\/api\/asks\/([^/]+)$/.exec(path);
	if (askMatch && method === 'DELETE') {
		return json({ ok: j.deleteAsk(decodeURIComponent(askMatch[1])) });
	}

	// --- reads -------------------------------------------------------------
	if (path === '/api/stats/heatmap') return json(heatmap(j));
	if (path === '/api/status' && method === 'GET') return json(status(j));
	if (path === '/api/status' && method === 'POST') return json({ ok: true });

	// --- models: not on the device yet -------------------------------------
	if (path === '/api/summary') return json({ exists: false, week: null });
	if (path === '/api/chat' && method === 'POST') {
		return sse([{ error: 'The model is not on the device yet. Task 023.' }]);
	}

	// --- backup ------------------------------------------------------------
	// The database leaves as SQL, because the WebAssembly engine cannot
	// deserialize a WAL-mode image. It replays back in unchanged.
	if (path === '/api/export') {
		const sql = dumpSql(j);
		return new Response(sql, {
			headers: {
				'content-type': 'application/sql; charset=utf-8',
				'content-disposition': 'attachment; filename="fermentario.sql"',
				'cache-control': 'no-store'
			}
		});
	}

	if (path === '/api/import' && method === 'POST') {
		const form = await (init as Request).formData?.().catch(() => null);
		const file = form?.get('file');
		if (!(file instanceof Blob) || file.size === 0) {
			return sse([{ error: 'Choose a file to restore.' }]);
		}
		const text = await file.text();
		if (!/^\s*(--|INSERT|PRAGMA|CREATE|BEGIN)/im.test(text)) {
			return sse([
				{
					error:
						'That is a .db file. This build restores the SQL export — regenerate it with: node scripts/make-seed.mjs'
				}
			]);
		}
		try {
			j.db.transaction(() => {
				j.db.exec('DELETE FROM notes; DELETE FROM notes_fts; DELETE FROM note_tags;');
				j.db.exec('DELETE FROM note_vectors; DELETE FROM weekly_recaps; DELETE FROM ask_history;');
				j.db.exec(text);
			});
		} catch (err) {
			return sse([{ error: `Restore failed: ${(err as Error)?.message ?? err}` }]);
		}
		seeded = false;
		return sse([
			{ phase: 'uploading' },
			{ phase: 'validating' },
			{ phase: 'replacing' },
			{ phase: 'search' },
			{ phase: 'finishing' },
			{
				done: true,
				counts: {
					notes: j.countNotes(),
					tags: j.db.prepare('SELECT COUNT(*) AS c FROM note_tags').get() as { c: number },
					recaps: j.db.prepare('SELECT COUNT(*) AS c FROM weekly_recaps').get() as { c: number },
					asks: j.db.prepare('SELECT COUNT(*) AS c FROM ask_history').get() as { c: number }
				}
			}
		]);
	}

	return json({ error: `no local route for ${method} ${path}` }, 404);
}

/** The database as replayable SQL, in the same shape `make-seed.mjs` emits. */
function dumpSql(j: Journal): string {
	const q = (v: unknown) => `'${String(v).replace(/'/g, "''")}'`;
	const blob = (v: unknown) => {
		const b = v as Uint8Array;
		return `x'${Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.byteLength ?? b.length).toString('hex')}'`;
	};
	const out: string[] = [];
	for (const n of j.db.prepare('SELECT * FROM notes').all() as unknown as Note[]) {
		out.push(
			`INSERT INTO notes (id, content, created_at, updated_at) VALUES (${q(n.id)}, ${q(n.content)}, ${n.created_at}, ${n.updated_at});`,
			`INSERT INTO notes_fts (content, note_id) VALUES (${q(n.content)}, ${q(n.id)});`
		);
	}
	for (const t of j.db.prepare('SELECT * FROM note_tags').all() as unknown as { note_id: string; tag: string }[]) {
		out.push(`INSERT INTO note_tags (note_id, tag) VALUES (${q(t.note_id)}, ${q(t.tag)});`);
	}
	for (const v of j.db
		.prepare('SELECT * FROM note_vectors')
		.all() as unknown as { note_id: string; vector: unknown }[]) {
		out.push(`INSERT INTO note_vectors (note_id, vector) VALUES (${q(v.note_id)}, ${blob(v.vector)});`);
	}
	for (const a of j.listAsks() as Ask[]) {
		out.push(
			`INSERT INTO ask_history (id, question, answer, sources, created_at) VALUES (${q(a.id)}, ${q(a.question)}, ${q(a.answer)}, ${q(JSON.stringify(a.sources))}, ${a.created_at});`
		);
	}
	return out.join('\n') + '\n';
}

let installed = false;

/** Answer `/api/*` from the device instead of the network. */
export function installLocalApi(): void {
	if (installed) return;
	installed = true;
	const real = globalThis.fetch.bind(globalThis);
	globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: (input as Request).url,
			globalThis.location?.href ?? 'http://localhost/'
		);
		if (url.pathname.startsWith('/api/')) {
			try {
				const answer = await handle(url, init ?? {});
				if (answer) return answer;
			} catch (err) {
				return json({ error: String((err as Error)?.message ?? err) }, 500);
			}
		}
		return real(input as RequestInfo, init);
	};
}
