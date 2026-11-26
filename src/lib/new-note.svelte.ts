/** The journal-note editor that any route can open. It is the only way to
 *  create a note: the command, the shortcut and the mini app all open it.
 *  The unsaved draft lives in sessionStorage so a reload does not lose it. */

import type { Note } from '$lib/types';
import { showToast } from '$lib/toast.svelte';
import { invalidateTagChoices } from '$lib/tag-suggest';
import { splitHashtags } from '$lib/hashtags';

const KEY = 'fermentario.newNoteDraft';

interface Draft {
	text: string;
	createdAt: number | null;
}

function readDraft(): Draft {
	if (typeof sessionStorage === 'undefined') return { text: '', createdAt: null };
	try {
		const raw = sessionStorage.getItem(KEY);
		if (raw) {
			const d = JSON.parse(raw) as Partial<Draft>;
			return {
				text: typeof d.text === 'string' ? d.text : '',
				createdAt: typeof d.createdAt === 'number' && Number.isFinite(d.createdAt) ? d.createdAt : null
			};
		}
	} catch {
		// Corrupt or unavailable storage: start empty.
	}
	return { text: '', createdAt: null };
}

function writeDraft(draft: Draft): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(KEY, JSON.stringify(draft));
	} catch {
		// Storage full or blocked: the draft simply will not persist.
	}
}

function clearStoredDraft(): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		// Nothing to clear.
	}
}

class NewNoteStore {
	open = $state(false);
	text = $state('');
	createdAt = $state<number | null>(null);
	saving = $state(false);
	error = $state('');

	/** The mini-app button shows a dot while an unsaved note is waiting. */
	get hasDraft(): boolean {
		return this.text.trim().length > 0 || this.createdAt !== null;
	}

	loadDraft() {
		const d = readDraft();
		this.text = d.text;
		this.createdAt = d.createdAt;
	}

	openModal() {
		if (!this.open) this.loadDraft();
		this.error = '';
		this.open = true;
	}

	setText(value: string) {
		this.text = value;
		this.persist();
	}

	setCreatedAt(value: number | null) {
		this.createdAt = value;
		this.persist();
	}

	private persist() {
		writeDraft({ text: this.text, createdAt: this.createdAt });
	}

	close() {
		if (this.saving) return;
		this.error = '';
		this.open = false;
	}

	/** Throw the draft away, for example after the user clears the field. */
	discard() {
		this.text = '';
		this.createdAt = null;
		this.error = '';
		clearStoredDraft();
	}

	async save() {
		if (this.saving) return;
		const raw = this.text.trim();
		if (!raw) return;
		const { content } = splitHashtags(raw);
		if (!content) {
			this.error = 'A note needs text besides its hashtags.';
			return;
		}
		this.saving = true;
		this.error = '';
		try {
			const now = Date.now();
			const createdAt =
				this.createdAt !== null && Number.isFinite(this.createdAt)
					? Math.min(this.createdAt, now)
					: undefined;
			const res = await fetch('/api/notes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: raw, created_at: createdAt })
			});
			const data = (await res.json()) as { note?: Note; error?: string };
			if (!res.ok || !data.note) throw new Error(data?.error ?? 'Failed to save note.');
			const note = data.note;
			this.text = '';
			this.createdAt = null;
			clearStoredDraft();
			this.open = false;
			showToast('Note saved.', 'success');
			invalidateTagChoices();
			window.dispatchEvent(new CustomEvent<Note>('notes:created', { detail: note }));
		} catch (e) {
			this.error = (e as Error)?.message ?? 'Failed to save note.';
		} finally {
			this.saving = false;
		}
	}
}

export const newNote = new NewNoteStore();
