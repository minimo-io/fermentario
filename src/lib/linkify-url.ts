/**
 * URL autolinking for rendered note text. Pure string work, no imports —
 * safe to execute directly under `node --experimental-strip-types`.
 *
 * Runs on already-escaped HTML (escaping happens first, upstream), so the
 * only `<...>` sequences present are tags this app injected itself. The
 * input is split on tags and only text runs are touched: existing markup
 * can never be double-linked, and `"` is excluded from matches so an
 * attribute can never break out.
 *
 * Trailing `.,;:!?` and one unmatched `)`, `]` or `}` are left outside the
 * link (balanced pairs, e.g. Wikipedia titles, are kept whole). Display
 * text is the URL itself with `break-all` so long links wrap on mobile
 * instead of overflowing the card.
 */
const URL_RE = /https?:\/\/[^\s<"]+/g;
const TRAIL_PUNCT = /[.,;:!?]+$/;
const TRAIL_QUOTE = /['”’]+$/;

function trimTrailing(raw: string): string {
	let url = raw.replace(TRAIL_PUNCT, '').replace(TRAIL_QUOTE, '');
	// Drop trailing closers that outnumber their openers: "(see
	// https://x/y)" loses the wrapper paren, while ".../wiki/A_(B)"
	// stays balanced and whole.
	const pairs = [[')', '('], [']', '['], ['}', '{']];
	for (const [close, open] of pairs) {
		while (url.endsWith(close)) {
			let opens = 0;
			let closes = 0;
			for (const ch of url) {
				if (ch === open) opens++;
			else if (ch === close) closes++;
			}
			if (closes <= opens) break;
			url = url.slice(0, -1);
		}
	}
	return url;
}

export function linkifyUrls(html: string): string {
	const parts = html.split(/(<[^>]*>)/g);
	for (let i = 0; i < parts.length; i += 2) {
		const text = parts[i]!;
		let out = '';
		let last = 0;
		URL_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = URL_RE.exec(text)) !== null) {
			const url = trimTrailing(m[0]);
			if (!url) continue;
			const after = text.slice(m.index + url.length, m.index + m[0].length);
			out += text.slice(last, m.index);
			out += `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-sky-600 dark:text-sky-400 underline underline-offset-2 break-all">${url}</a>${after}`;
			last = m.index + m[0].length;
		}
		out += text.slice(last);
		parts[i] = out;
	}
	return parts.join('');
}
