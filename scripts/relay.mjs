/**
 * Embedded Nostr relay (NIP-01 subset) at `/relay`.
 *
 * It is the backup store: events that clients send here and events the app
 * syncs from other relays land in the active journal's `nostr_events` table,
 * so one query answers both the admin section and a REQ from Primal.
 *
 * Policy: writes are restricted to the configured account's pubkey. Reads are
 * open (the notes are public anyway). There is no AUTH handshake; the pubkey
 * check is the gate.
 *
 * The HTTP server belongs to `scripts/start.mjs`; this module only attaches an
 * upgrade listener. `GET /relay` (NIP-11) is a normal SvelteKit route.
 */
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { WebSocketServer } from 'ws';
import { verifyEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';

const MAX_EVENT_BYTES = 64 * 1024;
const MAX_SUBS_PER_CONNECTION = 20;
const MAX_LIMIT = 500;
const MAX_EVENTS_PER_REQ = 2000;

/** @param {any} value */
function isEvent(value) {
	return (
		value &&
		typeof value === 'object' &&
		typeof value.id === 'string' &&
		typeof value.pubkey === 'string' &&
		typeof value.sig === 'string' &&
		typeof value.content === 'string' &&
		typeof value.kind === 'number' &&
		typeof value.created_at === 'number' &&
		Array.isArray(value.tags)
	);
}

/**
 * @param {any} event
 * @param {any} filter
 */
function matchFilter(event, filter) {
	if (!filter || typeof filter !== 'object') return false;
	if (Array.isArray(filter.ids) && !filter.ids.includes(event.id)) return false;
	if (Array.isArray(filter.authors) && !filter.authors.includes(event.pubkey)) return false;
	if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
	if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
	if (typeof filter.until === 'number' && event.created_at > filter.until) return false;
	for (const [key, values] of Object.entries(filter)) {
		if (key[0] !== '#' || !Array.isArray(values)) continue;
		const name = key.slice(1);
		if (!event.tags.some((/** @type {any} */ tag) => Array.isArray(tag) && tag[0] === name && values.includes(tag[1]))) {
			return false;
		}
	}
	return true;
}

/**
 * Owns the active journal connection. The journal can change under us (restore
 * or switch), so every operation checks the registry first and reopens when the
 * active id or path differ.
 *
 * @param {string} dataDir
 */
function createStore(dataDir) {
	/** @type {{ id: string, file: string, db: import('better-sqlite3').Database } | null} */
	let current = null;

	function readActive() {
		const registryFile = resolve(dataDir, 'registry.db');
		let registry;
		try {
			registry = new Database(registryFile, { readonly: true, fileMustExist: true });
		} catch {
			return null;
		}
		try {
			// better-sqlite3 types `get()` as unknown; the row shape is known here.
			const id = /** @type {{ value?: string } | undefined} */ (
				registry.prepare("SELECT value FROM app_state WHERE key = 'active_journal_id'").get()
			)?.value;
			if (!id) return null;
			const row = /** @type {{ id: string, path: string, state: string } | undefined} */ (
				registry.prepare('SELECT id, path, state FROM journals WHERE id = ?').get(id)
			);
			if (!row || row.state !== 'active') return null;
			return { id: row.id, file: resolve(dataDir, row.path) };
		} catch {
			return null;
		} finally {
			registry.close();
		}
	}

	function db() {
		const active = readActive();
		if (!active) return null;
		if (current && current.id === active.id && current.file === active.file) return current.db;
		try {
			current?.db.close();
		} catch {}
		try {
			const handle = new Database(active.file);
			handle.pragma('busy_timeout = 5000');
			current = { ...active, db: handle };
			return handle;
		} catch {
			current = null;
			return null;
		}
	}

	function ownerNpub() {
		const handle = db();
		if (!handle) return '';
		try {
			const row = /** @type {{ nsec?: string, npub?: string } | undefined} */ (
				handle.prepare('SELECT nsec, npub FROM nostr_profile WHERE id = 1').get()
			);
			if (!row?.nsec) return '';
			// The column holds bech32; filters and event authors are hex.
			const value = String(row.npub ?? '').trim();
			if (!value.startsWith('npub1')) return value;
			const decoded = nip19.decode(value);
			return decoded.type === 'npub' && typeof decoded.data === 'string' ? decoded.data : '';
		} catch {
			return '';
		}
	}

	/** The Nostr section's switch. Stored in the registry so the listener and
	 *  the API route read the same value across processes and restarts. */
	function enabled() {
		let registry;
		try {
			registry = new Database(resolve(dataDir, 'registry.db'), {
				readonly: true,
				fileMustExist: true
			});
			const row = /** @type {{ value?: string } | undefined} */ (
				registry.prepare("SELECT value FROM app_state WHERE key = 'relay_enabled'").get()
			);
			return row?.value !== '0';
		} catch {
			return true;
		} finally {
			try {
				registry?.close();
			} catch {}
		}
	}

	/**
	 * @param {any} event
	 * @param {string} accountId
	 */
	function insert(event, accountId) {
		const handle = db();
		if (!handle) return false;
		const tags = Array.isArray(event.tags) ? event.tags : [];
		const isReply = tags.some((/** @type {any} */ tag) => Array.isArray(tag) && tag[0] === 'e') ? 1 : 0;
		try {
			handle
				.prepare(
					`INSERT OR IGNORE INTO nostr_events
						(id, account_id, pubkey, kind, content, tags, created_at, published_at, source_note_id, is_reply, raw_event)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
				)
				.run(
					event.id,
					accountId,
					event.pubkey,
					event.kind,
					event.content,
					JSON.stringify(tags),
					event.created_at * 1000,
					Date.now(),
					isReply,
					JSON.stringify(event)
				);
			return true;
		} catch {
			// Schema not migrated yet, or the journal closed mid-write.
			return false;
		}
	}

	/** @param {any} filter */
	function query(filter) {
		const handle = db();
		if (!handle) return [];
		const where = [];
		const params = [];
		if (Array.isArray(filter.ids) && filter.ids.length) {
			where.push(`id IN (${filter.ids.map(() => '?').join(',')})`);
			params.push(...filter.ids);
		}
		if (Array.isArray(filter.authors) && filter.authors.length) {
			where.push(`pubkey IN (${filter.authors.map(() => '?').join(',')})`);
			params.push(...filter.authors);
		}
		if (Array.isArray(filter.kinds) && filter.kinds.length) {
			where.push(`kind IN (${filter.kinds.map(() => '?').join(',')})`);
			params.push(...filter.kinds);
		}
		if (typeof filter.since === 'number') {
			where.push('created_at >= ?');
			params.push(filter.since * 1000);
		}
		if (typeof filter.until === 'number') {
			where.push('created_at <= ?');
			params.push(filter.until * 1000);
		}
		for (const [key, values] of Object.entries(filter)) {
			if (key[0] !== '#' || !Array.isArray(values) || values.length === 0) continue;
			const name = key.slice(1);
			where.push(
				`EXISTS (SELECT 1 FROM json_each(nostr_events.tags) AS tag
					WHERE json_extract(tag.value, '$[0]') = ?
					  AND json_extract(tag.value, '$[1]') IN (${values.map(() => '?').join(',')}))`
			);
			params.push(name, ...values);
		}
		const rawLimit = typeof filter.limit === 'number' ? filter.limit : MAX_LIMIT;
		const limit = Math.min(Math.max(Math.trunc(rawLimit) || 0, 1), MAX_LIMIT);
		const sql = `SELECT raw_event FROM nostr_events
			${where.length ? `WHERE ${where.join(' AND ')}` : ''}
			ORDER BY created_at DESC, id DESC
			LIMIT ?`;
		try {
			return /** @type {Array<{ raw_event: string }>} */ (
				handle.prepare(sql).all(...params, limit)
			)
				.map((row) => {
					try {
						return JSON.parse(row.raw_event);
					} catch {
						return null;
					}
				})
				.filter(Boolean);
		} catch {
			return [];
		}
	}

	function close() {
		try {
			current?.db.close();
		} catch {}
		current = null;
	}

	return { ownerNpub, insert, query, enabled, close };
}

/**
 * Attach the relay to an HTTP server.
 *
 * `strictPaths` (the default) closes any upgrade for a path other than
 * `/relay`. The dev server shares its HTTP server with Vite's HMR socket, so
 * there it must be `false`: the listener then steps aside and leaves the
 * upgrade to the next handler.
 *
 * @param {import('node:http').Server} server
 * @param {{ dataDir?: string, strictPaths?: boolean }} [options]
 */
export function attachRelay(server, options = {}) {
	const dataDir = resolve(options.dataDir ?? process.env.FERMENTARIO_DATA_DIR ?? './data');
	const strictPaths = options.strictPaths !== false;
	const store = createStore(dataDir);
	const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_EVENT_BYTES });

	/** @type {Map<import('ws').WebSocket, Map<string, any[]>>} */
	const subscriptions = new Map();

	server.on('upgrade', (request, socket, head) => {
		let pathname = '';
		try {
			pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
		} catch {
			if (strictPaths) socket.destroy();
			return;
		}
		if (pathname !== '/relay' && pathname !== '/relay/') {
			if (strictPaths) socket.destroy();
			return;
		}
		if (!store.enabled()) {
			// The section's Stop button. Refusing the handshake is what a
			// stopped relay looks like to a client.
			socket.destroy();
			return;
		}
		wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
	});

	wss.on('connection', (ws) => {
		subscriptions.set(ws, new Map());

		/** @param {any} message */
		const send = (message) => {
			if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
		};
		/** @param {any} message */
		const notice = (message) => send(['NOTICE', message]);

		ws.on('message', (data) => {
			let message;
			try {
				message = JSON.parse(String(data));
			} catch {
				notice('invalid: message is not valid JSON');
				return;
			}
			if (!Array.isArray(message) || typeof message[0] !== 'string') {
				notice('invalid: expected a NIP-01 message array');
				return;
			}

			switch (message[0]) {
				case 'EVENT': {
					const event = message[1];
					if (!isEvent(event)) {
						notice('invalid: malformed event');
						return;
					}
					if (!verifyEvent(event)) {
						send(['OK', event.id, false, 'invalid: bad signature']);
						return;
					}
					const owner = store.ownerNpub();
					if (!owner) {
						send(['OK', event.id, false, 'restricted: no account configured']);
						return;
					}
					if (event.pubkey !== owner) {
						send(['OK', event.id, false, 'restricted: not the owner']);
						return;
					}
					if (!store.insert(event, owner)) {
						send(['OK', event.id, false, 'error: could not store the event']);
						return;
					}
					send(['OK', event.id, true, '']);
					for (const [subId, filters] of subscriptions.get(ws) ?? []) {
						if (filters.some((filter) => matchFilter(event, filter))) {
							send(['EVENT', subId, event]);
						}
					}
					break;
				}
				case 'REQ': {
					const subId = message[1];
					const filters = message.slice(2);
					if (typeof subId !== 'string' || subId.length === 0 || subId.length > 64) {
						notice('invalid: bad subscription id');
						return;
					}
					const own = subscriptions.get(ws);
					if (!own) return;
					if (!own.has(subId) && own.size >= MAX_SUBS_PER_CONNECTION) {
						send(['CLOSED', subId, 'error: too many subscriptions']);
						return;
					}
					own.set(subId, filters);
					const seen = new Set();
					let sent = 0;
					for (const filter of filters) {
						for (const event of store.query(filter)) {
							if (seen.has(event.id)) continue;
							seen.add(event.id);
							send(['EVENT', subId, event]);
							sent += 1;
							if (sent >= MAX_EVENTS_PER_REQ) break;
						}
						if (sent >= MAX_EVENTS_PER_REQ) break;
					}
					send(['EOSE', subId]);
					break;
				}
				case 'CLOSE': {
					const subId = message[1];
					if (typeof subId === 'string') subscriptions.get(ws)?.delete(subId);
					break;
				}
				default:
					notice(`unsupported: ${message[0]}`);
			}
		});

		ws.on('close', () => subscriptions.delete(ws));
		ws.on('error', () => subscriptions.delete(ws));
	});

	return {
		close() {
			for (const ws of subscriptions.keys()) {
				try {
					ws.close();
				} catch {}
			}
			subscriptions.clear();
			store.close();
			wss.close();
		}
	};
}
