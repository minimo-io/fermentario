import type { TimeEntry } from '$lib/types';

class TimeTrackerStore {
	running = $state<TimeEntry | null>(null);
	entries = $state<TimeEntry[]>([]);
	loaded = $state(false);
	now = $state(Date.now());
	#timer: ReturnType<typeof setInterval> | undefined;

	get elapsedMs(): number {
		if (!this.running) return 0;
		return Math.max(0, this.now - this.running.startedAt);
	}

	#syncTicker() {
		if (this.running) {
			if (!this.#timer) {
				this.now = Date.now();
				this.#timer = setInterval(() => (this.now = Date.now()), 1000);
			}
		} else if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = undefined;
		}
	}

	async load(): Promise<void> {
		try {
			const res = await fetch('/api/time-tracker');
			if (!res.ok) return;
			const d = (await res.json()) as { running?: TimeEntry | null; entries?: TimeEntry[] };
			this.running = d.running ?? null;
			this.entries = Array.isArray(d.entries) ? d.entries : [];
		} catch {
			// Keep last known state when offline.
		} finally {
			this.loaded = true;
			this.#syncTicker();
		}
	}

	async start(comment: string): Promise<{ ok: true } | { ok: false; error: string }> {
		try {
			const res = await fetch('/api/time-tracker/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ comment })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) return { ok: false, error: d?.error ?? 'Could not start the timer.' };
			this.running = d.entry as TimeEntry;
			this.entries = [this.running, ...this.entries.filter((e) => e.id !== this.running!.id)];
			this.#syncTicker();
			return { ok: true };
		} catch {
			return { ok: false, error: 'Could not start the timer.' };
		}
	}

	async stop(id?: string): Promise<{ ok: true } | { ok: false; error: string }> {
		try {
			const res = await fetch('/api/time-tracker/stop', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(id ? { id } : {})
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) return { ok: false, error: d?.error ?? 'Could not stop the timer.' };
			const entry = d.entry as TimeEntry;
			this.running = null;
			this.entries = this.entries.map((e) => (e.id === entry.id ? entry : e));
			if (!this.entries.some((e) => e.id === entry.id)) this.entries = [entry, ...this.entries];
			this.#syncTicker();
			return { ok: true };
		} catch {
			return { ok: false, error: 'Could not stop the timer.' };
		}
	}

	async remove(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
		try {
			const res = await fetch(`/api/time-tracker/${encodeURIComponent(id)}`, { method: 'DELETE' });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) return { ok: false, error: d?.error ?? 'Could not delete the time entry.' };
			this.entries = this.entries.filter((e) => e.id !== id);
			if (this.running?.id === id) this.running = null;
			this.#syncTicker();
			return { ok: true };
		} catch {
			return { ok: false, error: 'Could not delete the time entry.' };
		}
	}
}

export const timeTracker = new TimeTrackerStore();

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
