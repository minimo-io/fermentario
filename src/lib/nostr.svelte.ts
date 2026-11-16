import type { NostrStatus } from '$lib/types';

/** Shared Nostr account status, read by the admin shell and both Nostr panels.
 *  Saving or refreshing the account writes here so the backup reacts without a
 *  page reload. */
class NostrAccountStore {
	status = $state<NostrStatus | null>(null);
	loaded = $state(false);

	get configured(): boolean {
		return this.status?.configured === true;
	}

	async load(): Promise<NostrStatus | null> {
		try {
			const res = await fetch('/api/nostr/profile');
			if (res.ok) this.status = (await res.json()) as NostrStatus;
		} catch {
			// Keep the last known state when offline.
		} finally {
			this.loaded = true;
		}
		return this.status;
	}

	set(status: NostrStatus | null) {
		this.status = status;
		this.loaded = true;
	}
}

export const nostrAccount = new NostrAccountStore();
