/**
 * Apply pending schema migrations to every journal in the registry.
 *
 * Development opens the active journal and migrates it automatically. A
 * production deployment can run this before starting the new build so that
 * every journal is ready even if only one of them is opened at a time.
 *
 *   pnpm run db:migrate:all
 *
 * It backs up each journal before touching it, runs the same migration list as
 * the app, and updates `registry.db` afterwards. It refuses a journal written
 * by a newer app version.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { createNodeDb } from '../src/lib/server/node-db.ts';
import {
	LATEST_SCHEMA_VERSION,
	SchemaTooNewError,
	getSchemaVersion,
	runMigrations
} from '../src/lib/platform/migrations.ts';
import type { SqlDb } from '../src/lib/platform/sqlite.ts';

const DATA_DIR = resolve(process.env['FERMENTARIO_DATA_DIR'] ?? './data');
const REGISTRY = resolve(DATA_DIR, 'registry.db');
const BACKUP_LIMIT = 5;

interface JournalRow {
	id: string;
	name: string;
	path: string;
	schema_version: number;
}

function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function resolveJournalPath(relativePath: string): string {
	const abs = resolve(DATA_DIR, relativePath);
	if (abs !== DATA_DIR && !abs.startsWith(DATA_DIR + sep)) {
		throw new Error(`Journal path escapes the data directory: ${relativePath}`);
	}
	return abs;
}

function pruneBackups(journalId: string): void {
	const dir = resolve(DATA_DIR, 'backups', journalId);
	if (!existsSync(dir)) return;
	const files = readdirSync(dir)
		.filter((name) => name.endsWith('.db'))
		.sort()
		.reverse();
	for (const old of files.slice(BACKUP_LIMIT)) rmSync(resolve(dir, old), { force: true });
}

function backupBeforeMigrate(db: SqlDb, journalId: string, from: number, to: number): void {
	const dir = resolve(DATA_DIR, 'backups', journalId);
	mkdirSync(dir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const path = resolve(dir, `${stamp}-pre-v${from}-to-v${to}.db`);
	for (const suffix of ['', '-wal', '-shm', '-journal']) {
		rmSync(`${path}${suffix}`, { force: true });
	}
	db.exec(`VACUUM INTO ${sqlString(path)}`);
	pruneBackups(journalId);
	console.log(`  backup: ${path}`);
}

function main(): void {
	if (!existsSync(REGISTRY)) {
		console.log(`No journal registry at ${REGISTRY}; nothing to migrate.`);
		return;
	}

	const registry = new Database(REGISTRY);
	registry.pragma('busy_timeout = 5000');
	const journals = registry
		.prepare('SELECT id, name, path, schema_version FROM journals ORDER BY created_at ASC')
		.all() as JournalRow[];

	if (journals.length === 0) {
		console.log('The registry has no journals; nothing to migrate.');
		registry.close();
		return;
	}

	let failed = 0;
	for (const row of journals) {
		const abs = resolveJournalPath(row.path);
		if (!existsSync(abs)) {
			console.error(`${row.name}: missing file ${row.path}`);
			failed++;
			continue;
		}

		const db = createNodeDb(abs);
		try {
			db.pragma('journal_mode = WAL');
			db.pragma('foreign_keys = ON');
			db.pragma('busy_timeout = 5000');
			const current = getSchemaVersion(db);
			if (current > LATEST_SCHEMA_VERSION) {
				throw new SchemaTooNewError(current, LATEST_SCHEMA_VERSION);
			}
			if (current < LATEST_SCHEMA_VERSION) {
				console.log(`${row.name}: migrating v${current} -> v${LATEST_SCHEMA_VERSION}`);
				const version = runMigrations(db, {
					beforeMigrate: (from, to) => backupBeforeMigrate(db, row.id, from, to)
				});
				registry
					.prepare('UPDATE journals SET schema_version = ?, last_opened_at = ? WHERE id = ?')
					.run(version, Date.now(), row.id);
			} else {
				console.log(`${row.name}: already at v${current}`);
				registry
					.prepare('UPDATE journals SET schema_version = ?, last_opened_at = ? WHERE id = ?')
					.run(current, Date.now(), row.id);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`${row.name}: ${message}`);
			failed++;
		} finally {
			db.close();
		}
	}
	registry.close();

	if (failed > 0) {
		console.error(`${failed} journal(s) could not be migrated.`);
		process.exitCode = 1;
	}
}

main();
