/** Subgroups inside a To-Do group, written as a leading `(name)` token:
 *  `(v1) Fix the login` assigns subgroup `v1` and stores `Fix the login`.
 *  Names accept letters and digits in any script (accents included), spaces,
 *  dots and dashes, up to 31 characters; anything else stays plain text. */

// Capture the parenthetical first, then validate the normalized name.
// Trimming and collapsing inner spaces is easier after the match than inside
// the pattern, and the first capture stays the exact text the user typed.
const LEADING_PAREN_RE = /^\(([^)]{1,40})\)\s*/u;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} .\-]{0,30}$/u;

export function normalizeSubgroup(name: string): string {
	return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Split a leading `(subgroup)` token from item text. No token → empty subgroup. */
export function splitLeadingSubgroup(raw: string): { subgroup: string; content: string } {
	const text = raw.trimStart();
	const m = text.match(LEADING_PAREN_RE);
	if (!m) return { subgroup: '', content: raw };
	const subgroup = normalizeSubgroup(m[1]);
	if (!NAME_RE.test(subgroup)) return { subgroup: '', content: raw };
	return { subgroup, content: text.slice(m[0].length) };
}

/** Recompose for editing, so the prefix stays visible and movable. */
export function withSubgroupPrefix(subgroup: string, content: string): string {
	return subgroup ? `(${subgroup}) ${content}` : content;
}
