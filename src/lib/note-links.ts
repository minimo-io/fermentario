import MarkdownIt from 'markdown-it';
import type { StateInline } from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { linkifyUrls } from '$lib/linkify-url';
import { noteLinkIds, noteLabel } from '$lib/platform/journal';
import type { LinkRef } from '$lib/platform/journal';

export { noteLinkIds, noteLabel };
export type { LinkRef };

const RENDER_RE = /\[\[([0-9a-fA-F-]{36})\]\]/g;
const NOTE_LINK_RE = /^\[\[([0-9a-fA-F-]{36})\]\]/;

type MarkdownEnvironment = {
	links: Record<string, LinkRef>;
	publicUi: boolean;
};

const markdown = new MarkdownIt({
	html: false,
	linkify: true,
	typographer: false
}).use(taskLists, { enabled: false });

markdown.validateLink = (url: string) => {
	const value = url.trim().toLowerCase();
	if (value.startsWith('//')) return false;
	const scheme = /^([a-z][a-z\d+.-]*):/.exec(value)?.[1];
	return !scheme || scheme === 'http' || scheme === 'https' || scheme === 'mailto';
};

// Markdown links open separately so a reader does not lose the note they are
// reading. Keep these attributes on links wherever the parser places them,
// including links rendered inside GFM tables.
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
	const token = tokens[index]!;
	token.attrSet('target', '_blank');
	token.attrSet('rel', 'noopener noreferrer');
	token.attrJoin('class', 'note-content-link');
	return self.renderToken(tokens, index, options);
};

// Keep note/principle references inside the Markdown parser's inline-token
// pipeline. A post-render regex would incorrectly turn `[[id]]` inside code
// spans and fenced code into links.
markdown.inline.ruler.before('link', 'note_link', (state: StateInline, silent: boolean) => {
	const match = NOTE_LINK_RE.exec(state.src.slice(state.pos));
	if (!match) return false;
	if (!silent) {
		const token = state.push('note_link', '', 0);
		token.meta = { id: match[1] };
	}
	state.pos += match[0].length;
	return true;
});

markdown.renderer.rules.note_link = (tokens, index, _options, env) => {
	const token = tokens[index]!;
	const id = String(token.meta?.id ?? '');
	const context = env as MarkdownEnvironment;
	const target = context.links[id];
	if (!target) {
		return `<span class="missing-note-link" title="Linked entry not found">⧉ ${esc(id.slice(0, 8))}…</span>`;
	}
	const href = linkHref(id, target.kind, { publicUi: context.publicUi });
	return `<a href="${escAttr(href)}" class="wiki-link">${esc(target.label)}</a>`;
};

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: string): string {
	return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Where a linked entry opens. Public surfaces must stay public, so a note
 *  link there points at `/notes/<id>`; principles have no public page.
 *  All note surfaces render through one body component, so the target is
 *  chosen per surface, never per component copy. */
export function linkHref(
	id: string,
	kind: LinkRef['kind'],
	opts: { publicUi?: boolean } = {}
): string {
	if (kind === 'principle') return `/admin/principles/${id}`;
	return opts.publicUi ? `/notes/${id}` : `/admin/notes/${id}`;
}

/** Inline link pill, shared by rendered note text and the header row. */
export const LINK_PILL_CLASS =
	'inline-flex max-w-full items-center rounded-full bg-stone-200 dark:bg-stone-700 px-2 py-px text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-300 dark:hover:bg-stone-600';

/** Turn escaped HTML with `[[id]]` markers into pills. `labels` maps id to
 *  the target's live label and kind; ids without a label (deleted target)
 *  render as muted text instead of a link. */
export function renderNoteLinks(
	html: string,
	labels: Record<string, LinkRef> | Map<string, LinkRef>,
	opts: { publicUi?: boolean } = {}
): string {
	const get = (id: string): LinkRef | undefined =>
		labels instanceof Map ? labels.get(id) : labels[id];
	return html.replace(RENDER_RE, (_m, id: string) => {
		const target = get(id);
		if (target === undefined) {
			return `<span class="text-stone-400 dark:text-stone-500" title="Linked entry not found">⧉ ${esc(id.slice(0, 8))}…</span>`;
		}
		return `<a href="${linkHref(id, target.kind, opts)}" class="${LINK_PILL_CLASS}">${esc(target.label)}</a>`;
	});
}

/** CommonMark/GFM renderer. Raw HTML is disabled and links use a strict
 *  protocol allowlist, so the parser output is safe without a Node-only
 *  sanitizer in this shared browser/server module. */
export function renderNoteContent(
	source: string,
	links?: LinkRef[],
	opts: { publicUi?: boolean } = {}
): string {
	const map: Record<string, LinkRef> = {};
	for (const l of links ?? []) map[l.id] = l;
	return markdown.render(source, { links: map, publicUi: opts.publicUi ?? false });
}

/** Links-only pipeline for surfaces that stay markdown-free (principles):
 *  escape, then bare URLs, then link pills. */
export function renderPlainLinks(source: string, links?: LinkRef[]): string {
	const map: Record<string, LinkRef> = {};
	for (const l of links ?? []) map[l.id] = l;
	return renderNoteLinks(linkifyUrls(esc(source)), map);
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
