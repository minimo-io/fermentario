import { inlineMarkdown } from '$lib/markdown-inline';
import { noteLinkIds, noteLabel } from '$lib/platform/journal';
import type { LinkRef } from '$lib/platform/journal';

export { noteLinkIds, noteLabel };
export type { LinkRef };

const RENDER_RE = /\[\[([0-9a-fA-F-]{36})\]\]/g;

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function linkHref(id: string, kind: LinkRef['kind']): string {
	return kind === 'principle' ? `/principles/${id}` : `/notes/${id}`;
}

/** Inline link pill, shared by rendered note text and the header row. */
export const LINK_PILL_CLASS =
	'inline-flex max-w-full items-center rounded-full bg-stone-200 dark:bg-stone-700 px-2 py-px text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-300 dark:hover:bg-stone-600';

/** Turn escaped HTML with `[[id]]` markers into pills. `labels` maps id to
 *  the target's live label and kind; ids without a label (deleted target)
 *  render as muted text instead of a link. */
export function renderNoteLinks(
	html: string,
	labels: Record<string, LinkRef> | Map<string, LinkRef>
): string {
	const get = (id: string): LinkRef | undefined =>
		labels instanceof Map ? labels.get(id) : labels[id];
	return html.replace(RENDER_RE, (_m, id: string) => {
		const target = get(id);
		if (target === undefined) {
			return `<span class="text-stone-400 dark:text-stone-500" title="Linked entry not found">⧉ ${esc(id.slice(0, 8))}…</span>`;
		}
		return `<a href="${linkHref(id, target.kind)}" class="${LINK_PILL_CLASS}">${esc(target.label)}</a>`;
	});
}

/** Full pipeline for note body text: markdown, then link pills. */
export function renderNoteContent(source: string, links?: LinkRef[]): string {
	const map: Record<string, LinkRef> = {};
	for (const l of links ?? []) map[l.id] = l;
	return renderNoteLinks(inlineMarkdown(source), map);
}

/** Links-only pipeline for surfaces that stay markdown-free (principles):
 *  escape, then link pills. */
export function renderPlainLinks(source: string, links?: LinkRef[]): string {
	const map: Record<string, LinkRef> = {};
	for (const l of links ?? []) map[l.id] = l;
	return renderNoteLinks(esc(source), map);
}

/** Find an open `[[query` immediately before the caret. The query may be
 *  empty (bare `[[`); it stops at whitespace, parens, newlines and `]`. */
export function linkQueryAt(value: string, caret: number): { start: number; query: string } | null {
	const before = value.slice(0, caret);
	const m = /(^|[\s(])\[\[([^\s()[\]\n]{0,60})$/.exec(before);
	if (!m) return null;
	return { start: (m.index ?? 0) + m[1].length, query: m[2] };
}

/** Splice the picked id over the open `[[query`. */
export function insertNoteLink(
	value: string,
	caret: number,
	id: string
): { value: string; caret: number } {
	const q = linkQueryAt(value, caret);
	if (!q) return { value, caret };
	const head = value.slice(0, q.start);
	const tail = value.slice(caret);
	const insert = `[[${id}]]`;
	return { value: head + insert + tail, caret: head.length + insert.length };
}
