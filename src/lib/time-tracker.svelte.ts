import type { TimeEntry } from '$lib/types';
import { playChime } from '$lib/sound';

const ALERT_KEY = 'fermentario.time-alerts';
const ALERT_MODE_KEY = 'fermentario.time-alert-mode';

/** `once` chimes one time per mark; `30s` repeats for 30 seconds; `stop`
 *  repeats until the user stops it. */
export type AlertMode = 'once' | '30s' | 'stop';

const REPEAT_MS = 2500;
const TIMED_ALERT_MS = 30_000;

function storedAlertMs(): number {
	if (typeof localStorage === 'undefined') return 0;
	const ms = Number(localStorage.getItem(ALERT_KEY));
	return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

function storedAlertMode(): AlertMode {
	if (typeof localStorage === 'undefined') return 'once';
	const mode = localStorage.getItem(ALERT_MODE_KEY);
	return mode === '30s' || mode === 'stop' ? mode : 'once';
}

class TimeTrackerStore {
	running = $state<TimeEntry | null>(null);
	entries = $state<TimeEntry[]>([]);
	loaded = $state(false);
	now = $state(Date.now());
	/** Chime interval in ms for every timer; 0 turns it off. Persisted in this browser.
	 *  Starts at 0 so the server and the first client render agree; `load` reads it. */
	alertEveryMs = $state(0);
	/** How long each mark sounds. Persisted in this browser next to the interval. */
	alertMode = $state<AlertMode>('once');
	/** True while a repeat alert sounds; the card shows a stop button then. */
	alerting = $state(false);
	/** True for a moment on every chime, so the bars and badges can animate. */
	chiming = $state(false);
	/** Wall clock when a stop request left the browser. Until the server answers,
	 *  the counter reads this instant instead of `now`, so it does not keep
	 *  counting during the round trip. Null when no stop is in flight. */
	pendingStopAt = $state<number | null>(null);
	#timer: ReturnType<typeof setInterval> | undefined;
	#chimeTimer: ReturnType<typeof setTimeout> | undefined;
	#alertTimer: ReturnType<typeof setInterval> | undefined;
	#alertDeadline = 0;
	/** Interval marks already sounded, so one mark never chimes twice. */
	#lastCrossed = 0;

	get elapsedMs(): number {
		if (!this.running) return 0;
		return Math.max(0, (this.pendingStopAt ?? this.now) - this.running.startedAt);
	}

	/** Wall-clock time of the next chime, or null when alerts are off or idle. */
	get nextAlertAt(): number | null {
		if (!this.running || this.alertEveryMs <= 0) return null;
		const crossed = Math.floor(this.elapsedMs / this.alertEveryMs);
		return this.running.startedAt + (crossed + 1) * this.alertEveryMs;
	}

	/** Move the anchor to the current mark, so changing the interval skips old ones. */
	#anchorAlerts() {
		this.#lastCrossed = this.running && this.alertEveryMs > 0
			? Math.floor(Math.max(0, Date.now() - this.running.startedAt) / this.alertEveryMs)
			: 0;
	}

	setAlertEveryMs(ms: number) {
		this.alertEveryMs = Math.max(0, Math.round(ms));
		this.#anchorAlerts();
		try {
			localStorage.setItem(ALERT_KEY, String(this.alertEveryMs));
		} catch {
			// Private mode: keep the setting for this session only.
		}
	}

	setAlertMode(mode: AlertMode) {
		this.alertMode = mode;
		if (mode === 'once') this.stopAlert();
		try {
			localStorage.setItem(ALERT_MODE_KEY, mode);
		} catch {
			// Private mode: keep the setting for this session only.
		}
	}

	/** End a repeating alert, whether it ran for 30 s or until now. */
	stopAlert() {
		this.#clearAlertTimer();
		this.alerting = false;
		if (this.#chimeTimer) clearTimeout(this.#chimeTimer);
		this.#chimeTimer = undefined;
		this.chiming = false;
	}

	/** One short visual flash per chime, in every alert mode. */
	#flashChime() {
		this.chiming = true;
		if (this.#chimeTimer) clearTimeout(this.#chimeTimer);
		this.#chimeTimer = setTimeout(() => {
			this.chiming = false;
			this.#chimeTimer = undefined;
		}, 1600);
	}

	#clearAlertTimer() {
		if (this.#alertTimer) clearInterval(this.#alertTimer);
		this.#alertTimer = undefined;
		this.#alertDeadline = 0;
	}

	#startAlert() {
		this.#clearAlertTimer();
		playChime();
		this.#flashChime();
		if (this.alertMode === 'once') return;
		this.alerting = true;
		this.#alertDeadline = this.alertMode === '30s' ? Date.now() + TIMED_ALERT_MS : 0;
		this.#alertTimer = setInterval(() => {
			playChime();
			if (this.#alertDeadline > 0 && Date.now() >= this.#alertDeadline) this.stopAlert();
		}, REPEAT_MS);
	}

	#tick() {
		// A stop is in flight: the counter is frozen at the click time.
		if (this.pendingStopAt !== null) return;
		this.now = Date.now();
		if (this.alerting && this.#alertDeadline > 0 && this.now >= this.#alertDeadline) this.stopAlert();
		if (!this.running || this.alertEveryMs <= 0) return;
		const crossed = Math.floor((this.now - this.running.startedAt) / this.alertEveryMs);
		if (crossed <= this.#lastCrossed) return;
		// A throttled background tab can jump several marks; sound once, not a burst.
		this.#lastCrossed = crossed;
		this.#startAlert();
	}

	#syncTicker() {
		if (this.running) {
			if (!this.#timer) {
				this.now = Date.now();
				// Start counting from now, so a reload never chimes for marks already passed.
				this.#anchorAlerts();
				this.#timer = setInterval(() => this.#tick(), 1000);
			}
		} else if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = undefined;
			this.#lastCrossed = 0;
			this.pendingStopAt = null;
			this.stopAlert();
		}
	}

	async load(): Promise<void> {
		this.alertEveryMs = storedAlertMs();
		this.alertMode = storedAlertMode();
		try {
			const res = await fetch('/api/time-tracker');
			if (!res.ok) return;
			const d = (await res.json()) as { running?: TimeEntry | null; entries?: TimeEntry[] };
			this.running = d.running ?? null;
			this.pendingStopAt = null;
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
			this.pendingStopAt = null;
			this.entries = [this.running, ...this.entries.filter((e) => e.id !== this.running!.id)];
			this.#syncTicker();
			return { ok: true };
		} catch {
			return { ok: false, error: 'Could not start the timer.' };
		}
	}

	async stop(id?: string): Promise<{ ok: true } | { ok: false; error: string }> {
		// Freeze the visible counter at the click, before the request:
		// the work ends when the user asks, not when the server replies.
		if (!id || this.running?.id === id) {
			this.pendingStopAt ??= Date.now();
			this.stopAlert();
		}
		try {
			const res = await fetch('/api/time-tracker/stop', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(id ? { id } : {})
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) {
				// The server still runs the timer: restore live counting.
				this.pendingStopAt = null;
				return { ok: false, error: d?.error ?? 'Could not stop the timer.' };
			}
			const entry = d.entry as TimeEntry;
			this.running = null;
			this.entries = this.entries.map((e) => (e.id === entry.id ? entry : e));
			if (!this.entries.some((e) => e.id === entry.id)) this.entries = [entry, ...this.entries];
			this.#syncTicker();
			return { ok: true };
		} catch {
			this.pendingStopAt = null;
			return { ok: false, error: 'Could not stop the timer.' };
		}
	}

	async update(id: string, comment: string): Promise<{ ok: true } | { ok: false; error: string }> {
		try {
			const res = await fetch(`/api/time-tracker/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ comment })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) return { ok: false, error: d?.error ?? 'Could not save the time entry.' };
			const entry = d.entry as TimeEntry;
			if (this.running?.id === entry.id) this.running = entry;
			this.entries = this.entries.map((e) => (e.id === entry.id ? entry : e));
			return { ok: true };
		} catch {
			return { ok: false, error: 'Could not save the time entry.' };
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
