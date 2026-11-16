import { nostrAccount } from './nostr.svelte';

const BACKUP_PAUSE_MS = 2000;
const BACKUP_MAX_PAGES = 100;

type RunResult = { imported: number; error: string; owned: boolean };

/** Client-side driver for the paged Nostr backup. Owned by the admin layout so
 *  it starts on page load and when the account becomes configured, not when the
 *  Nostr section mounts. */
class NostrBackupStore {
	running = $state(false);
	events = $state(0);
	lastSyncAt = $state(0);
	error = $state('');

	/** Start or continue the backup. No request runs without a configured
	 *  account, and a running loop is never duplicated. */
	async start(manual = false): Promise<RunResult> {
		const status = nostrAccount.status;
		if (!status?.configured || this.running) {
			return { imported: 0, error: '', owned: false };
		}
		this.running = true;
		this.error = '';
		this.events = status.stats.total;
		this.lastSyncAt = status.lastSyncAt || 0;
		let imported = 0;
		let until: number | undefined;
		let owned = true;
		try {
			for (let page = 0; page < BACKUP_MAX_PAGES; page++) {
				const res = await fetch('/api/nostr/sync', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(until ? { until } : {})
				});
				const d = await res.json().catch(() => ({}));
				if (res.status === 409) {
					owned = false;
					break;
				}
				if (!res.ok) throw new Error(d?.error ?? 'Could not read the relays.');
				imported += Number(d.imported) || 0;
				this.events = Number(d?.stats?.total) || this.events;
				const lastSyncAt = Number(d.lastSyncAt) || this.lastSyncAt || Date.now();
				this.lastSyncAt = lastSyncAt;
				if (nostrAccount.status) {
					nostrAccount.status = {
						...nostrAccount.status,
						stats: d.stats ?? nostrAccount.status.stats,
						lastSyncAt
					};
				}
				if (!d.hasMore || !d.nextCursor) break;
				until = d.nextCursor;
				await new Promise((resolve) => setTimeout(resolve, BACKUP_PAUSE_MS));
			}
		} catch (e) {
			this.error = (e as Error)?.message ?? 'Could not read the relays.';
		} finally {
			this.running = false;
		}
		return { imported, error: this.error, owned };
	}

	nudge() {
		return this.start(true);
	}
}

export const nostrBackup = new NostrBackupStore();
