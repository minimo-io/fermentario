import { TAG_PALETTE, DEFAULT_TAG_COLOR, isTagColorKey, type TagColorKey } from '$lib/tag-palette';

/** One shared registry: every chip reads from here, so one change recolors
 *  the tag everywhere. Loaded once per page mount; SSR renders gray. */
class TagColorStore {
	colors = $state<Record<string, string>>({});
	private loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.loading ??= (async () => {
			try {
				const d = await (await fetch('/api/tags')).json();
				const raw = (d?.colors ?? {}) as Record<string, unknown>;
				const clean: Record<string, string> = {};
				for (const [t, c] of Object.entries(raw)) {
					if (isTagColorKey(c)) clean[t] = c;
				}
				this.colors = clean;
			} catch {}
		})();
		return this.loading;
	}

	/** A restore can replace the whole table, so drop the cached promise. */
	async reload(): Promise<void> {
		this.loading = null;
		await this.load();
	}

	key(tag: string): TagColorKey {
		const c = this.colors[tag];
		return isTagColorKey(c) ? c : DEFAULT_TAG_COLOR;
	}

	chip(tag: string): string {
		return TAG_PALETTE[this.key(tag)].chip;
	}

	dot(tag: string): string {
		return TAG_PALETTE[this.key(tag)].dot;
	}

	async set(tag: string, color: TagColorKey): Promise<void> {
		const prev = this.colors[tag];
		this.colors = { ...this.colors, [tag]: color };
		try {
			const res = await fetch(`/api/tags/${encodeURIComponent(tag)}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ color })
			});
			if (!res.ok) throw new Error('Failed to save color.');
		} catch (e) {
			if (prev === undefined) {
				const next = { ...this.colors };
				delete next[tag];
				this.colors = next;
			} else {
				this.colors = { ...this.colors, [tag]: prev };
			}
			throw e;
		}
	}
}

export const tagColors = new TagColorStore();
