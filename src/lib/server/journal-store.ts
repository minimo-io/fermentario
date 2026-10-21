import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { createJournal } from '$lib/platform/journal';
import {
	LATEST_SCHEMA_VERSION,
	SchemaTooNewError,
	getSchemaVersion,
	runMigrations
} from '$lib/platform/migrations';
import type { SqlDb } from '$lib/platform/sqlite';
import { createNodeDb } from './node-db';
import {
	DATA_DIR,
	clearActiveJournal,
	deleteJournal,
	ensureRegistry,
	getActiveJournal,
	getJournal as getJournalRecord,
	getMeta,
	insertJournal,
	listJournals,
	setActiveJournal,
	setJournalVersion,
	setMeta,
	updateJournal,
	type JournalRecord
} from './journal-registry';
import { emitJournalChange } from './journal-events';

/**
 * Lazy owner of the active journal.
 *
 * The old `db.ts` opened a file and created the schema at module load. That
 * makes "no journal" impossible. Here the registry is opened first, the active
 * journal is opened on demand, and the existing `fermentario.db` is imported
 * once into the normal journal layout.
 */

export type JournalApi = ReturnType<typeof createJournal>;

export class NoActiveJournalError extends Error {
	readonly code = 'NO_JOURNAL';
	constructor() {
		super('No journal is active yet.');
		this.name = 'NoActiveJournalError';
	}
}

export class JournalExistsError extends Error {
	readonly code = 'JOURNAL_EXISTS';
	constructor() {
		super('A journal is already active.');
		this.name = 'JournalExistsError';
	}
}

export class JournalUnavailableError extends Error {
	readonly code = 'JOURNAL_UNAVAILABLE';
	constructor(message: string, readonly cause?: unknown) {
		super(message);
		this.name = 'JournalUnavailableError';
	}
}

export interface JournalHandle {
	id: string;
	name: string;
	path: string;
	absPath: string;
	db: SqlDb;
	journal: JournalApi;
	schemaVersion: number;
}

export interface JournalInfo {
	id: string;
	name: string;
	schemaVersion: number;
	latestSchemaVersion: number;
	createdAt: number;
}

export interface JournalStatus {
	state: 'none' | 'active' | 'error';
	journal: JournalInfo | null;
	error?: string;
}

export interface JournalScaffold {
	id: string;
	name: string;
	path: string;
	absPath: string;
	db: SqlDb;
	schemaVersion: number;
}

const LEGACY_DB = resolve(DATA_DIR, 'fermentario.db');
const BACKUPS_DIR = resolve(DATA_DIR, 'backups');
const LEGACY_IMPORT_KEY = 'legacy_import_done';
const LEGACY_ERROR_KEY = 'legacy_import_error';
const JOURNAL_ERROR_KEY = 'journal_error';
const BACKUP_LIMIT = 5;

let initialized = false;
let initError: Error | null = null;
let active: JournalHandle | null = null;
let onboardingBusy = false;

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

export function resolveJournalPath(relativePath: string): string {
	const abs = resolve(DATA_DIR, relativePath);
	if (abs !== DATA_DIR && !abs.startsWith(DATA_DIR + sep)) {
		throw new Error('Journal path escapes the data directory.');
	}
	return abs;
}

function relativeJournalPath(id: string): string {
	return `journals/${id}/journal.db`;
}

function removeSqliteFiles(path: string): void {
	for (const suffix of ['', '-wal', '-shm', '-journal']) {
		rmSync(`${path}${suffix}`, { force: true });
	}
}

function verifyDatabase(path: string, label: string): void {
	const db = createNodeDb(path);
	try {
		db.pragma('journal_mode = WAL');
		const check = db.pragma('quick_check', true);
		if (check !== 'ok') throw new Error(`${label} is damaged (${String(check)}).`);
		const notes = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'")
			.get<{ name: string }>();
		if (!notes) throw new Error(`${label} is not a fermentario journal.`);
	} finally {
		db.close();
	}
}

function pruneBackups(journalId: string): void {
	const dir = resolve(BACKUPS_DIR, journalId);
	if (!existsSync(dir)) return;
	const files = readdirSync(dir)
		.filter((name) => name.endsWith('.db'))
		.sort()
		.reverse();
	for (const old of files.slice(BACKUP_LIMIT)) {
		rmSync(resolve(dir, old), { force: true });
	}
}

/** Consistent backup through SQLite itself, so WAL pages are included. */
function backupBeforeMigrate(
	db: SqlDb,
	journalId: string,
	fromVersion: number,
	toVersion: number
): string {
	const dir = resolve(BACKUPS_DIR, journalId);
	mkdirSync(dir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const path = resolve(dir, `${stamp}-pre-v${fromVersion}-to-v${toVersion}.db`);
	removeSqliteFiles(path);
	db.exec(`VACUUM INTO ${sqlString(path)}`);
	pruneBackups(journalId);
	return path;
}

function handleFrom(
	record: JournalRecord,
	db: SqlDb,
	version: number,
	journal: JournalApi
): JournalHandle {
	return {
		id: record.id,
		name: record.name,
		path: record.path,
		absPath: resolveJournalPath(record.path),
		db,
		journal,
		schemaVersion: version
	};
}

function openRecord(record: JournalRecord): JournalHandle {
	const absPath = resolveJournalPath(record.path);
	if (!existsSync(absPath)) {
		throw new JournalUnavailableError(`The journal file is missing: ${record.path}`);
	}

	const db = createNodeDb(absPath);
	try {
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		db.pragma('busy_timeout = 5000');
		const version = runMigrations(db, {
			beforeMigrate: (from, to) => {
				backupBeforeMigrate(db, record.id, from, to);
			}
		});
		const journal = createJournal(db);
		updateJournal(record.id, {
			schema_version: version,
			state: 'active',
			last_opened_at: Date.now()
		});
		return handleFrom(record, db, version, journal);
	} catch (err) {
		try {
			db.close();
		} catch {
			// Already closed.
		}
		throw err;
	}
}

function setActiveHandle(next: JournalHandle | null): void {
	const previous = active;
	if (previous && previous.id !== next?.id) {
		try {
			previous.db.close();
		} catch {
			// Already closed.
		}
	}
	active = next;
	if (next) {
		// A successful activation is a new, valid state even if the previous
		// attempt left an error behind (restore from the journal-error page).
		initError = null;
		setActiveJournal(next.id);
		setMeta(JOURNAL_ERROR_KEY, '');
		setMeta(LEGACY_ERROR_KEY, '');
		emitJournalChange(next.id);
	} else {
		clearActiveJournal();
		emitJournalChange(null);
	}
}

function recoverIncompleteJournals(): void {
	if (getActiveJournal()) return;
	for (const row of listJournals().filter((journal) => journal.state === 'migrating')) {
		const abs = resolveJournalPath(row.path);
		if (existsSync(abs)) {
			try {
				verifyDatabase(abs, 'Incomplete journal');
				const handle = openRecord(row);
				setActiveHandle(handle);
				return;
			} catch (err) {
				console.error('Could not recover incomplete journal:', err);
			}
		}
		rmSync(resolve(DATA_DIR, `journals/${row.id}`), { recursive: true, force: true });
		deleteJournal(row.id);
	}
}

/**
 * One-time import of the pre-registry database into a normal journal folder.
 *
 * The source is copied with VACUUM INTO (which includes WAL pages), the copy is
 * migrated, and only then is it registered and made active. The old file is
 * removed only after the new file is valid.
 */
function importLegacyJournal(): void {
	if (!existsSync(LEGACY_DB)) {
		setMeta(LEGACY_IMPORT_KEY, '1');
		return;
	}

	const id = randomUUID();
	const relPath = relativeJournalPath(id);
	const absPath = resolveJournalPath(relPath);
	const targetDir = resolve(DATA_DIR, `journals/${id}`);
	const tempPath = `${absPath}.tmp`;
	const backupPath = resolve(BACKUPS_DIR, id, 'pre-migration-v0.db');
	let source: SqlDb | null = null;
	let temp: SqlDb | null = null;

	try {
		verifyDatabase(LEGACY_DB, 'The existing journal');
		insertJournal({
			id,
			name: 'My journal',
			path: relPath,
			schemaVersion: 0,
			state: 'migrating'
		});
		mkdirSync(targetDir, { recursive: true });
		mkdirSync(resolve(BACKUPS_DIR, id), { recursive: true });
		removeSqliteFiles(backupPath);
		removeSqliteFiles(tempPath);

		source = createNodeDb(LEGACY_DB);
		source.pragma('journal_mode = WAL');
		source.pragma('foreign_keys = ON');
		// Checkpoint first for a clean backup, then let SQLite make the copies.
		// Stop the old server before this first boot: the import assumes there is
		// no second writer. The copy itself is still a consistent snapshot.
		try {
			source.pragma('wal_checkpoint(TRUNCATE)');
		} catch {
			// A busy checkpoint is not fatal for VACUUM INTO.
		}
		source.exec(`VACUUM INTO ${sqlString(backupPath)}`);
		source.exec(`VACUUM INTO ${sqlString(tempPath)}`);
		source.close();
		source = null;

		temp = createNodeDb(tempPath);
		temp.pragma('journal_mode = WAL');
		temp.pragma('foreign_keys = ON');
		temp.pragma('busy_timeout = 5000');
		const version = runMigrations(temp);
		const check = temp.pragma('quick_check', true);
		if (check !== 'ok') throw new Error(`The imported journal is damaged (${String(check)}).`);
		temp.pragma('wal_checkpoint(TRUNCATE)');
		temp.close();
		temp = null;
		// Remove only the sidecars, not the copied database itself.
		rmSync(`${tempPath}-wal`, { force: true });
		rmSync(`${tempPath}-shm`, { force: true });
		renameSync(tempPath, absPath);

		const row = getJournalRecord(id)!;
		const handle = openRecord({ ...row, schema_version: version, state: 'active' });
		setActiveHandle(handle);
		setJournalVersion(id, version);
		setMeta(LEGACY_IMPORT_KEY, '1');
		setMeta(LEGACY_ERROR_KEY, '');

		// The new file has passed quick_check and migrations. The old file is
		// now redundant data. Keep the pre-migration backup above. A failed
		// cleanup must not roll back a successful migration.
		try {
			removeSqliteFiles(LEGACY_DB);
		} catch (err) {
			console.error('The old journal file could not be removed:', err);
		}
	} catch (err) {
		try {
			source?.close();
		} catch {
			// Already closed.
		}
		try {
			temp?.close();
		} catch {
			// Already closed.
		}
		removeSqliteFiles(tempPath);
		rmSync(targetDir, { recursive: true, force: true });
		if (getJournalRecord(id)) deleteJournal(id);
		const message = `The existing journal could not be migrated: ${errorMessage(err)}`;
		setMeta(LEGACY_ERROR_KEY, message);
		throw new JournalUnavailableError(message, err);
	}
}

function initialize(): void {
	if (initialized) {
		if (initError) throw initError;
		return;
	}
	initialized = true;
	try {
		ensureRegistry();
		recoverIncompleteJournals();

		const activeRow = getActiveJournal();
		if (activeRow) {
			if (!existsSync(resolveJournalPath(activeRow.path))) {
				updateJournal(activeRow.id, { state: 'missing' });
				setMeta(JOURNAL_ERROR_KEY, `The journal file is missing: ${activeRow.path}`);
				return;
			}
			try {
				const handle = openRecord(activeRow);
				setActiveHandle(handle);
				setMeta(JOURNAL_ERROR_KEY, '');
			} catch (err) {
				const message = `The journal could not be opened: ${errorMessage(err)}`;
				updateJournal(activeRow.id, { state: 'error' });
				setMeta(JOURNAL_ERROR_KEY, message);
				throw new JournalUnavailableError(message, err);
			}
			return;
		}

		if (getMeta(LEGACY_IMPORT_KEY) !== '1' && existsSync(LEGACY_DB)) {
			importLegacyJournal();
			return;
		}
		if (!existsSync(LEGACY_DB)) setMeta(LEGACY_IMPORT_KEY, '1');
	} catch (err) {
		initError = err instanceof Error ? err : new Error(String(err));
		throw initError;
	}
}

/** Serialize create/restore from onboarding. Uploads are async, so two
 *  requests could otherwise both pass the "no journal" check and race. */
export function beginOnboarding(): boolean {
	if (onboardingBusy) return false;
	onboardingBusy = true;
	return true;
}

export function endOnboarding(): void {
	onboardingBusy = false;
}

export function resetJournalStore(): void {
	if (active) {
		try {
			active.db.close();
		} catch {
			// Already closed.
		}
	}
	active = null;
	initialized = false;
	initError = null;
	setMeta(JOURNAL_ERROR_KEY, '');
	// Do not clear the active id. A retry should open the same journal again.
}

export function getJournalStatus(): JournalStatus {
	try {
		initialize();
	} catch (err) {
		return { state: 'error', journal: null, error: errorMessage(err) };
	}

	if (active) {
		const row = getJournalRecord(active.id);
		return {
			state: 'active',
			journal: {
				id: active.id,
				name: active.name,
				schemaVersion: active.schemaVersion,
				latestSchemaVersion: LATEST_SCHEMA_VERSION,
				createdAt: row?.created_at ?? 0
			}
		};
	}

	const row = getActiveJournal();
	if (row) {
		const message = getMeta(JOURNAL_ERROR_KEY) ?? `The journal could not be opened: ${row.path}`;
		return { state: 'error', journal: null, error: message };
	}

	const journalError = getMeta(JOURNAL_ERROR_KEY);
	if (journalError) return { state: 'error', journal: null, error: journalError };

	const legacyError = getMeta(LEGACY_ERROR_KEY);
	if (legacyError) return { state: 'error', journal: null, error: legacyError };

	return { state: 'none', journal: null };
}

export function getActiveJournalInfo(): JournalInfo | null {
	const status = getJournalStatus();
	return status.state === 'active' ? status.journal : null;
}

/**
 * The query facade. Future login changes this one lookup to an
 * AsyncLocalStorage journal id set in hooks; the named delegates in db.ts and
 * the API routes stay as they are.
 */
export function getJournal(): JournalApi {
	initialize();
	if (!active) throw new NoActiveJournalError();
	return active.journal;
}

export function getDb(): SqlDb {
	initialize();
	if (!active) throw new NoActiveJournalError();
	return active.db;
}

/** Open an existing journal and make it active. */
export function activateJournal(id: string): JournalInfo {
	ensureRegistry();
	const row = getJournalRecord(id);
	if (!row) throw new JournalUnavailableError('Journal not found.');
	const handle = openRecord(row);
	setActiveHandle(handle);
	return getActiveJournalInfo()!;
}

export function createBlankJournal(name = 'My journal'): JournalInfo {
	initialize();
	if (active) throw new JournalExistsError();
	if (getJournalStatus().state !== 'none') {
		throw new JournalExistsError();
	}

	const id = randomUUID();
	const relPath = relativeJournalPath(id);
	const absPath = resolveJournalPath(relPath);
	const targetDir = resolve(DATA_DIR, `journals/${id}`);
	let db: SqlDb | null = null;
	try {
		mkdirSync(targetDir, { recursive: true });
		db = createNodeDb(absPath);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		db.pragma('busy_timeout = 5000');
		const version = runMigrations(db);
		const journal = createJournal(db);
		insertJournal({ id, name, path: relPath, schemaVersion: version, state: 'active' });
		const row = getJournalRecord(id)!;
		setActiveHandle(handleFrom(row, db, version, journal));
		db = null;
		return getActiveJournalInfo()!;
	} catch (err) {
		try {
			db?.close();
		} catch {
			// Already closed.
		}
		removeSqliteFiles(absPath);
		rmSync(targetDir, { recursive: true, force: true });
		if (getJournalRecord(id)) deleteJournal(id);
		throw new JournalUnavailableError(`The new journal could not be created: ${errorMessage(err)}`, err);
	}
}

/**
 * Create a migrated journal file without registering it yet. Used by
 * restore-at-onboarding, so a failed import never becomes the active journal.
 */
export function createJournalScaffold(name = 'My journal'): JournalScaffold {
	// Do not call initialize() here: onboarding restore must still work when
	// the previous active journal is broken. The route decides whether a new
	// journal is allowed.
	ensureRegistry();
	if (getJournalStatus().state === 'active') throw new JournalExistsError();
	const id = randomUUID();
	const relPath = relativeJournalPath(id);
	const absPath = resolveJournalPath(relPath);
	const targetDir = resolve(DATA_DIR, `journals/${id}`);
	let db: SqlDb | null = null;
	try {
		mkdirSync(targetDir, { recursive: true });
		db = createNodeDb(absPath);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		db.pragma('busy_timeout = 5000');
		const version = runMigrations(db);
		return { id, name, path: relPath, absPath, db, schemaVersion: version };
	} catch (err) {
		try {
			db?.close();
		} catch {
			// Already closed.
		}
		removeSqliteFiles(absPath);
		rmSync(targetDir, { recursive: true, force: true });
		throw new JournalUnavailableError(`The new journal could not be created: ${errorMessage(err)}`, err);
	}
}

export function finishJournalScaffold(scaffold: JournalScaffold): JournalInfo {
	try {
		scaffold.db.pragma('wal_checkpoint(TRUNCATE)');
		const journal = createJournal(scaffold.db);
		insertJournal({
			id: scaffold.id,
			name: scaffold.name,
			path: scaffold.path,
			schemaVersion: scaffold.schemaVersion,
			state: 'active'
		});
		const row = getJournalRecord(scaffold.id)!;
		setActiveHandle(handleFrom(row, scaffold.db, scaffold.schemaVersion, journal));
		return getActiveJournalInfo()!;
	} catch (err) {
		discardJournalScaffold(scaffold);
		throw new JournalUnavailableError(`The journal could not be activated: ${errorMessage(err)}`, err);
	}
}

export function discardJournalScaffold(scaffold: JournalScaffold): void {
	try {
		scaffold.db.close();
	} catch {
		// Already closed.
	}
	removeSqliteFiles(scaffold.absPath);
	rmSync(resolve(DATA_DIR, `journals/${scaffold.id}`), { recursive: true, force: true });
	if (getJournalRecord(scaffold.id)) deleteJournal(scaffold.id);
}

export function getJournalFileName(): string | null {
	return active ? active.absPath : null;
}

export { LATEST_SCHEMA_VERSION, SchemaTooNewError, getSchemaVersion };
