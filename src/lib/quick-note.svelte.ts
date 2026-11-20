/** The quick note is a local scratchpad. Every keystroke is written to this
 *  browser's local storage, so a reload never loses text. It never leaves the
 *  browser unless the user presses Back up, and that button stays disabled
 *  until a login exists. */

const STORAGE_KEY = 'fermentario.quickNote';
const FULL_KEY = 'fermentario.quickNote.full';

type Stored = { content: string; updatedAt: number };

function readStored(): Stored {
	if (typeof localStorage === 'undefined') return { content: '', updatedAt: 0 };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { content: '', updatedAt: 0 };
		const parsed = JSON.parse(raw) as { content?: unknown; updatedAt?: unknown };
		return {
			content: typeof parsed?.content === 'string' ? parsed.content : '',
			updatedAt: Number(parsed?.updatedAt) || 0
		};
	} catch {
		return { content: '', updatedAt: 0 };
	}
}

class QuickNoteStore {
	open = $state(false);
	content = $state('');
	updatedAt = $state(0);
	/** `local` means the last keystroke is on this device. */
	status = $state<'idle' | 'local' | 'error'>('idle');
	error = $state('');
	mode = $state<'edit' | 'view'>('edit');
	full = $state(false);

	/** The server copy is a user-triggered backup. Admin is unprotected today,
	 *  so backup is allowed; when the login lands, this flag follows the session
	 *  and the button is enabled only for a signed-in user. */
	backupEnabled = $state(true);
	backupStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	backupError = $state('');

	#loaded = false;

	/** Read the local copy once. There is no server read: the server copy is a
	 *  backup, never the source of truth. */
	#ensureLoaded() {
		if (this.#loaded) return;
		const stored = readStored();
		this.content = stored.content;
		this.updatedAt = stored.updatedAt;
		// The full-screen choice belongs to this browser: reopening the app
		// returns the modal the size it was left.
		try {
			this.full = localStorage.getItem(FULL_KEY) === '1';
		} catch {}
		this.#loaded = true;
	}

	openModal() {
		this.#ensureLoaded();
		this.open = true;
		// An empty note has nothing to read, so it starts ready to type. A note
		// with text starts in view: `e` (or the Edit tab) switches to editing.
		this.mode = this.content.trim() ? 'view' : 'edit';
	}

	setFull(value: boolean) {
		this.full = value;
		try {
			localStorage.setItem(FULL_KEY, value ? '1' : '0');
		} catch {}
	}

	close() {
		this.open = false;
	}

	/** Called on every keystroke. The write is synchronous, so a reload after
	 *  any keystroke sees the text. */
	setContent(value: string) {
		this.content = value;
		try {
			const updatedAt = Date.now();
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ content: value, updatedAt }));
			this.updatedAt = updatedAt;
			this.status = 'local';
			this.error = '';
		} catch {
			this.status = 'error';
			this.error = 'This browser blocks local storage.';
		}
	}

	/** Explicit backup of the local copy to the server. Gated on a login. */
	async backup() {
		if (!this.backupEnabled || this.backupStatus === 'saving') return;
		this.backupStatus = 'saving';
		this.backupError = '';
		try {
			const res = await fetch('/api/quick-note', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: this.content })
			});
			if (!res.ok) throw new Error('Could not back up the note.');
			const data = (await res.json()) as { updatedAt?: number };
			this.updatedAt = Number(data.updatedAt) || this.updatedAt;
			this.backupStatus = 'saved';
		} catch (e) {
			this.backupStatus = 'error';
			this.backupError = (e as Error)?.message ?? 'Could not back up the note.';
		}
	}
}

export const quickNote = new QuickNoteStore();
