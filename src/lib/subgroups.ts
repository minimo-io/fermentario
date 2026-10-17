/** Subgroups inside a To-Do group, written as a leading `(name)` token:
 *  `(v1) Fix the login` assigns subgroup `v1` and stores `Fix the login`.
 *  Names are lowercase letters, digits, dots, and dashes; anything else is
 *  left alone as plain text. */

const SUBGROUP_RE = /^\(([a-z0-9][a-z0-9.\-]{0,30})\)\s*/i;

export function normalizeSubgroup(name: string): string {
	return name.trim().toLowerCase();
}

/** Split a leading `(subgroup)` token from item text. No token → empty subgroup. */
export function splitLeadingSubgroup(raw: string): { subgroup: string; content: string } {
	const text = raw.trimStart();
	const m = text.match(SUBGROUP_RE);
	if (!m) return { subgroup: '', content: raw };
	return { subgroup: normalizeSubgroup(m[1]), content: text.slice(m[0].length) };
}

/** Recompose for editing, so the prefix stays visible and movable. */
export function withSubgroupPrefix(subgroup: string, content: string): string {
	return subgroup ? `(${subgroup}) ${content}` : content;
}
