import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNodeDb } from './node-db';
import type { SqlDb } from '$lib/platform/sqlite';

/**
 * The journal registry is a tiny SQLite database next to the journals. It holds
 * the list of journal files and the active journal. It is NOT a journal and is
 * never exported or restored. Keeping this metadata in SQLite gives the future
 * login system one place for users, memberships, sessions and per-database
 * migration state.
 */

export const DATA_DIR = resolve(process.env['FERMENTARIO_DATA_DIR'] ?? './data');
export const REGISTRY_FILE = resolve(DATA_DIR, 'registry.db');

export interface JournalRecord {
	id: string;
	name: string;
	/** Path relative to DATA_DIR. Never taken from a request. */
	path: string;
	created_at: number;
	schema_version: number;
	state: 'active' | 'creating' | 'migrating' | 'error' | 'missing';
	last_opened_at: number;
}

let registry: SqlDb | null = null;

function openRegistry(): SqlDb {
	if (registry) return registry;
	mkdirSync(DATA_DIR, { recursive: true });
	const db = createNodeDb(REGISTRY_FILE);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	db.exec(`
		CREATE TABLE IF NOT EXISTS journals (
			id             TEXT PRIMARY KEY,
			name           TEXT NOT NULL,
			path           TEXT NOT NULL UNIQUE,
			created_at     INTEGER NOT NULL,
			schema_version INTEGER NOT NULL DEFAULT 0,
			state          TEXT NOT NULL DEFAULT 'active',
			last_opened_at INTEGER NOT NULL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS app_state (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`);
	db.exec('PRAGMA user_version = 1');
	registry = db;
	return db;
}

export function ensureRegistry(): SqlDb {
	return openRegistry();
}

export function closeRegistry(): void {
	registry?.close();
	registry = null;
}

export function getMeta(key: string): string | null {
	const row = openRegistry()
		.prepare('SELECT value FROM app_state WHERE key = ?')
		.get<{ value: string }>(key);
	return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
	openRegistry()
		.prepare(
			`INSERT INTO app_state (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`
		)
		.run(key, value);
}

export function deleteMeta(key: string): void {
	openRegistry().prepare('DELETE FROM app_state WHERE key = ?').run(key);
}

export function listJournals(): JournalRecord[] {
	return openRegistry()
		.prepare('SELECT * FROM journals ORDER BY created_at ASC, id ASC')
		.all<JournalRecord>();
}

export function getJournal(id: string): JournalRecord | null {
	return (
		openRegistry().prepare('SELECT * FROM journals WHERE id = ?').get<JournalRecord>(id) ?? null
	);
}

export function getActiveJournal(): JournalRecord | null {
	const id = getMeta('active_journal_id');
	if (!id) return null;
	const found = getJournal(id);
	if (!found) {
		deleteMeta('active_journal_id');
		return null;
	}
	return found;
}

export function setActiveJournal(id: string): void {
	setMeta('active_journal_id', id);
}

export function clearActiveJournal(): void {
	deleteMeta('active_journal_id');
}

export function insertJournal(input: {
	id: string;
	name: string;
	path: string;
	schemaVersion: number;
	state?: JournalRecord['state'];
}): JournalRecord {
	const now = Date.now();
	openRegistry()
		.prepare(
			`INSERT INTO journals (id, name, path, created_at, schema_version, state, last_opened_at)
			 VALUES (?, ?, ?, ?, ?, ?, 0)`
		)
		.run(input.id, input.name, input.path, now, input.schemaVersion, input.state ?? 'active');
	return getJournal(input.id)!;
}

export function updateJournal(
	id: string,
	patch: Partial<Pick<JournalRecord, 'name' | 'schema_version' | 'state' | 'last_opened_at'>>
): void {
	const fields: string[] = [];
	const values: (string | number)[] = [];
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		fields.push(`${key} = ?`);
		values.push(value);
	}
	if (fields.length === 0) return;
	openRegistry()
		.prepare(`UPDATE journals SET ${fields.join(', ')} WHERE id = ?`)
		.run(...values, id);
}

export function deleteJournal(id: string): void {
	openRegistry().prepare('DELETE FROM journals WHERE id = ?').run(id);
	if (getMeta('active_journal_id') === id) clearActiveJournal();
}

export function setJournalVersion(id: string, version: number): void {
	updateJournal(id, { schema_version: version, last_opened_at: Date.now() });
}
