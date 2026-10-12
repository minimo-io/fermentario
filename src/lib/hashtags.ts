export interface HashtagSplit {
	content: string;
	tags: string[];
}

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

const TRAILING_TAG = /(?:\s|^)(#[\p{L}\p{N}][\p{L}\p{N}_-]{0,29})$/u;

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
