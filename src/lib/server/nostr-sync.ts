import { getMeta, setMeta } from './journal-registry';

/**
 * State for the automatic backup. The guard lives in the server process, so
 * two tabs that open the Nostr section cannot fetch the same pages in
 * parallel and double the load on the relays. adapter-node runs one process;
 * a dev reload resets the flag, which is harmless.
 */
let running = false;

export function isSyncRunning(): boolean {
	return running;
}

export function setSyncRunning(value: boolean): void {
	running = value;
}

/** Last finished batch, stored in the registry so the section still reports
 *  it after a restart, even when that run imported nothing. */
const LAST_SYNC_KEY = 'nostr_last_sync_at';

export function getLastSyncAt(): number {
	try {
		const at = Number(getMeta(LAST_SYNC_KEY));
		return Number.isFinite(at) && at > 0 ? at : 0;
	} catch {
		return 0;
	}
}

export function setLastSyncAt(at = Date.now()): number {
	try {
		setMeta(LAST_SYNC_KEY, String(at));
	} catch {}
	return at;
}
