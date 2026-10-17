/**
 * Inline markdown for note text — bold and italic only, one level, no
 * nesting. The source is escaped FIRST, so the only tags present in the
 * result are the ones this function injects (`<strong>`, `<em>`). Feed the
 * output to `{@html}`; feed the raw markdown to the editor and the clipboard.
 *
 * CommonMark-ish rule: the asterisks may not hug a space (`a * b` stays
 * literal) and must sit on one line. No lookbehind (older Safari).
 */
export function inlineMarkdown(source: string): string {
	const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return escaped
		// bold wins over italic: `**x**` for `x`, including `x *y*`
		.replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, '<strong>$1</strong>')
		// italic on the remaining single asterisks
		.replace(/\*(\S(?:[^*\n]*\S)?)\*(?!\*)/g, '<em>$1</em>');
}
