/** A small journal-note editor that any route can open. The existing Composer
 *  is part of the admin shell; commands need a capture surface that works on
 *  public pages too. */

import type { Note } from '$lib/types';
import { showToast } from '$lib/toast.svelte';
import { invalidateTagChoices } from '$lib/tag-suggest';
import { splitHashtags } from '$lib/hashtags';

class NewNoteStore {
	open = $state(false);
	text = $state('');
	saving = $state(false);
	error = $state('');

	openModal() {
		this.text = '';
		this.error = '';
		this.open = true;
	}

	close() {
		if (this.saving) return;
		this.open = false;
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
			const res = await fetch('/api/notes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: raw })
			});
			const data = (await res.json()) as { note?: Note; error?: string };
			if (!res.ok || !data.note) throw new Error(data?.error ?? 'Failed to save note.');
			const note = data.note;
			this.text = '';
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
