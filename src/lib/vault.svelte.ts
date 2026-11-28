export type VaultRow = { id: string; title: string; username: string; url: string; group: string };
export type VaultDetail = { id: string; password: string; notes: string };

const IDLE_MS = 5 * 60_000;
const HIDDEN_MS = 60_000;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

class VaultStore {
	open = $state(false);
	unlocked = $state(false);
	loading = $state(false);
	error = $state('');
	rows = $state<VaultRow[]>([]);
	query = $state('');
	selected = $state('');
	detail = $state<VaultDetail | null>(null);
	private worker: Worker | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
	private unlockTimer: ReturnType<typeof setTimeout> | null = null;
	private hiddenAt = 0;
	private lastActivity = 0;
	private listening = false;

	openModal() { this.open = true; }
	closeModal() { this.open = false; }

	async unlock(file: File, password: string) {
		if (this.loading) return;
		this.error = '';
		if (!file.size || file.size > MAX_FILE_BYTES) {
			this.error = 'Choose a KDBX file smaller than 32 MB.';
			return;
		}
		this.lock();
		this.loading = true;
		const worker = new Worker(new URL('./vault.worker.ts', import.meta.url), { type: 'module' });
		this.worker = worker;
		this.unlockTimer = setTimeout(() => {
			if (this.worker !== worker) return;
			this.lock();
			this.error = 'Unlock timed out. This database may require too many resources.';
		}, 60_000);
		worker.onmessage = (event) => {
			if (worker !== this.worker) return;
			const message = event.data;
			if (message.type === 'unlocked') {
				if (this.unlockTimer) clearTimeout(this.unlockTimer);
				this.unlockTimer = null;
				this.rows = message.rows;
				this.unlocked = true;
				this.loading = false;
				this.startTimers();
			} else if (message.type === 'entry' && message.id === this.selected) {
				this.detail = { id: message.id, password: message.password, notes: message.notes };
			} else if (message.type === 'error') {
				this.lock();
				this.error = message.message;
			}
		};
		worker.onerror = () => {
			if (worker !== this.worker) return;
			this.lock();
			this.error = 'Could not open the vault. Try again.';
		};
		try {
			const data = await file.arrayBuffer();
			if (worker !== this.worker) return;
			worker.postMessage({ type: 'unlock', data, password }, [data]);
		} catch {
			if (worker !== this.worker) return;
			this.lock();
			this.error = 'Could not read the file.';
		}
	}

	select(id: string) {
		this.selected = id;
		this.detail = null;
		this.worker?.postMessage({ type: 'entry', id });
	}

	lock() {
		this.worker?.terminate();
		this.worker = null;
		this.unlocked = false;
		this.loading = false;
		this.rows = [];
		this.query = '';
		this.selected = '';
		this.detail = null;
		this.error = '';
		if (this.idleTimer) clearTimeout(this.idleTimer);
		if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
		if (this.unlockTimer) clearTimeout(this.unlockTimer);
		this.idleTimer = null;
		this.hiddenTimer = null;
		this.unlockTimer = null;
		this.hiddenAt = 0;
		if (this.listening) {
			document.removeEventListener('pointerdown', this.activity);
			document.removeEventListener('keydown', this.activity);
			document.removeEventListener('visibilitychange', this.visibility);
			window.removeEventListener('pagehide', this.onPageHide);
			this.listening = false;
		}
	}

	private activity = () => {
		if (!this.unlocked || document.hidden) return;
		if (Date.now() - this.lastActivity >= IDLE_MS) { this.lock(); return; }
		this.lastActivity = Date.now();
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => this.lock(), IDLE_MS);
	};
	private visibility = () => {
		if (document.hidden) {
			this.hiddenAt = Date.now();
			this.hiddenTimer = setTimeout(() => this.lock(), HIDDEN_MS);
		} else {
			if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
			this.hiddenTimer = null;
			if ((this.hiddenAt && Date.now() - this.hiddenAt >= HIDDEN_MS) || Date.now() - this.lastActivity >= IDLE_MS) {
				this.lock();
				return;
			}
			this.hiddenAt = 0;
		}
	};
	private onPageHide = () => this.lock();
	private startTimers() {
		this.lastActivity = Date.now();
		this.idleTimer = setTimeout(() => this.lock(), IDLE_MS);
		document.addEventListener('pointerdown', this.activity);
		document.addEventListener('keydown', this.activity);
		document.addEventListener('visibilitychange', this.visibility);
		window.addEventListener('pagehide', this.onPageHide);
		this.listening = true;
		if (document.hidden) this.visibility();
	}
}

export const vault = new VaultStore();
