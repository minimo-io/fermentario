const KEY = 'fermentario.draft';

export interface Draft {
	note: string;
	ask: string;
}

/** The composer's unsaved text, kept per tab so it survives SPA navigation
 *  (Heatmap, tag pages) and a full page reload. Cleared when the note or the
 *  question is actually saved. */
export function loadDraft(): Draft {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (raw) {
			const d = JSON.parse(raw) as Partial<Draft>;
			return { note: typeof d.note === 'string' ? d.note : '', ask: typeof d.ask === 'string' ? d.ask : '' };
		}
	} catch {
		// Corrupt or unavailable storage: start empty.
	}
	return { note: '', ask: '' };
}

export function saveDraft(draft: Draft): void {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(draft));
	} catch {
		// Storage full or blocked: the draft simply will not persist.
	}
}

export function clearDraft(): void {
	try {
		sessionStorage.removeItem(KEY);
	} catch {
		// Nothing to clear.
	}
}
