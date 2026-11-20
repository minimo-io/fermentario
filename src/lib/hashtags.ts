export interface HashtagSplit {
	content: string;
	tags: string[];
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

export const TAG_TOKEN = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}$/u;

// A tag starts the line or follows whitespace, so `url.com/#anchor` and
// `foo#bar` stay text. It ends at whitespace or the end of the line, so
// `# Heading` and `## Heading` stay text as well.
const TAG_ANYWHERE = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{0,29})(?=\s|$)/gu;

/** Split text into its prose and its hashtags. A tag counts anywhere: at the
 *  start, in the middle or at the end. The `#` must start the line or follow
 *  whitespace, and the tag must end at whitespace or the end of the line.
 *  `url.com/#anchor`, `foo#bar`, `# Heading` and `## Heading` stay prose.
 *
 *  Removes each tag token from its line and collapses the leftover spaces.
 *  A line that held only tags disappears. Other blank lines stay. Returns
 *  lowercase, deduped tags (at most 8) and the cleaned text. */
export function splitHashtags(input: string): HashtagSplit {
	const tags: string[] = [];
	const kept: string[] = [];
	let changed = false;

	for (const line of input.split('\n')) {
		let found = false;
		const next = line.replace(TAG_ANYWHERE, (_match, _lead: string, raw: string) => {
			found = true;
			const tag = raw.toLowerCase();
			if (tags.length < MAX_TAGS && !tags.includes(tag)) tags.push(tag);
			return '';
		});
		if (!found) {
			kept.push(line);
			continue;
		}
		changed = true;
		const tidy = next.replace(/\s+/g, ' ').trim();
		if (tidy) kept.push(tidy);
	}

	if (!changed) return { content: input.trim(), tags: [] };
	return { content: kept.join('\n').trim(), tags };
}

const TRAILING_TAG = /(?:\s|^)(#[\p{L}\p{N}][\p{L}\p{N}_-]{0,29})$/u;

/** Frozen parser for migration 38. It must replay the old rule exactly:
 *  trailing hashtags first, then a leading run, and nothing from prose. New
 *  saves use `splitHashtags`. Do not change this to match new behavior. */
export function splitTimeEntryHashtags(input: string): HashtagSplit {
	const tags: string[] = [];
	let rest = input.replace(/\s+$/, '');
	for (;;) {
		const m = TRAILING_TAG.exec(rest);
		if (!m) break;
		const tag = m[1].slice(1).toLowerCase();
		if (tag.length <= MAX_TAG_LENGTH && !tags.includes(tag)) tags.unshift(tag);
		rest = rest.slice(0, m.index);
		if (tags.length >= MAX_TAGS) break;
		if (!rest.trim()) break;
	}
	if (tags.length > 0) return { content: rest.trim(), tags };

	rest = input.trim();
	while (tags.length < MAX_TAGS) {
		const m = /^#[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}(?=\s|$)/u.exec(rest);
		if (!m) break;
		const tag = m[0].slice(1).toLowerCase();
		if (!tags.includes(tag)) tags.push(tag);
		rest = rest.slice(m[0].length).trimStart();
	}
	if (tags.length === 0) return { content: input.trim(), tags: [] };
	return { content: rest.trim(), tags };
}

/** Rebuild the editable text for an item whose tags live outside its body.
 *
 *  Tags go back as a trailing `#tag` run, the same syntax that created them.
 *  If any tag cannot be one hashtag token, return the body unchanged: writing
 *  a multi-word tag from an older note as `#short phrase` would store `phrase`
 *  and leave `short` in the text. */
export function withTrailingHashtags(content: string, tags: string[] | undefined): string {
	const list = (tags ?? []).filter(Boolean);
	if (list.length === 0 || !list.every((tag) => TAG_TOKEN.test(tag))) return content;
	const body = content.trimEnd();
	const suffix = list.map((tag) => `#${tag}`).join(' ');
	return body ? `${body} ${suffix}` : suffix;
}
