export interface HashtagSplit {
	content: string;
	tags: string[];
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

const TRAILING_TAG = /(?:\s|^)(#[\p{L}\p{N}][\p{L}\p{N}_-]{0,29})$/u;
const TAG_TOKEN = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}$/u;

/** Split a note into its text and the hashtags typed at the end of it.
 *
 *  Only a trailing run counts: every remaining token after the last prose must
 *  be a hashtag, otherwise nothing is extracted. The `#` must follow
 *  whitespace or start the content, so `url.com/#anchor` and `# Heading` are
 *  left alone. Returns lowercase, deduped tags and the text with the hashtag
 *  run removed. */
export function splitTrailingHashtags(input: string): HashtagSplit {
	const trimmed = input.replace(/\s+$/, '');
	if (!trimmed) return { content: input.trim(), tags: [] };

	const tags: string[] = [];
	let rest = trimmed;
	for (;;) {
		const m = TRAILING_TAG.exec(rest);
		if (!m) break;
		const tag = m[1].slice(1).toLowerCase();
		if (tag.length <= MAX_TAG_LENGTH && !tags.includes(tag)) tags.unshift(tag);
		rest = rest.slice(0, m.index);
		if (tags.length >= MAX_TAGS) break;
		if (!rest.trim()) break;
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
