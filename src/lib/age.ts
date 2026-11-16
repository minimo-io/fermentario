export type AgeLang = 'en' | 'es' | 'pt';

interface Span {
	years: number;
	months: number;
	days: number;
}

/** Full calendar years, months and days between two timestamps. Borrows
 *  days from the previous month, then months from years; no 30-day months. */
export function calendarSpan(fromMs: number, toMs: number): Span | null {
	if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
	const from = new Date(fromMs);
	const to = new Date(toMs);
	let years = to.getFullYear() - from.getFullYear();
	let months = to.getMonth() - from.getMonth();
	let days = to.getDate() - from.getDate();
	if (days < 0) {
		months -= 1;
		// Day 0 of the target month is the last day of the previous one.
		days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
	}
	if (months < 0) {
		years -= 1;
		months += 12;
	}
	return {
		years: Math.max(0, years),
		months: Math.max(0, months),
		days: Math.max(0, days)
	};
}

const LABELS: Record<
	AgeLang,
	{ years: [string, string]; months: [string, string]; days: [string, string]; and: string }
> = {
	en: {
		years: ['year', 'years'],
		months: ['month', 'months'],
		days: ['day', 'days'],
		and: 'and'
	},
	es: {
		years: ['año', 'años'],
		months: ['mes', 'meses'],
		days: ['día', 'días'],
		and: 'y'
	},
	pt: {
		years: ['ano', 'anos'],
		months: ['mês', 'meses'],
		days: ['dia', 'dias'],
		and: 'e'
	}
};

function part(n: number, forms: [string, string]): string {
	return `${n} ${n === 1 ? forms[0] : forms[1]}`;
}

/** “1 año, 2 meses y 3 días”, dropping zero units. Empty when same day. */
export function durationText(span: Span, lang: AgeLang): string {
	const labels = LABELS[lang] ?? LABELS.en;
	const parts: string[] = [];
	if (span.years > 0) parts.push(part(span.years, labels.years));
	if (span.months > 0) parts.push(part(span.months, labels.months));
	if (span.days > 0) parts.push(part(span.days, labels.days));
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0];
	if (parts.length === 2) return `${parts[0]} ${labels.and} ${parts[1]}`;
	return `${parts[0]}, ${parts[1]} ${labels.and} ${parts[2]}`;
}

/** Bare duration without wrapper words: `7 days`, `3 h`, `5 min`.
 *  The diary table and other tight spots use this — no verb, so no language
 *  can leak through a hardcoded English one. */
export function shortDuration(atMs: number, lang: AgeLang = 'en', now = Date.now()): string {
	if (!Number.isFinite(atMs) || atMs <= 0) return '';
	const mins = Math.max(0, Math.floor((now - atMs) / 60000));
	if (mins < 1) return lang === 'es' ? 'ahora' : lang === 'pt' ? 'agora' : 'now';
	if (mins < 60) return `${mins} min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} h`;
	const days = Math.floor(hours / 24);
	if (days < 30) {
		const unit = lang === 'es' ? (days === 1 ? 'día' : 'días') : lang === 'pt' ? (days === 1 ? 'dia' : 'dias') : days === 1 ? 'day' : 'days';
		return `${days} ${unit}`;
	}
	const months = Math.floor(days / 30);
	if (months < 12) {
		const unit = lang === 'es' ? (months === 1 ? 'mes' : 'meses') : lang === 'pt' ? (months === 1 ? 'mês' : 'meses') : months === 1 ? 'month' : 'months';
		return `${months} ${unit}`;
	}
	const years = Math.floor(months / 12);
	const unit =
		lang === 'es' ? (years === 1 ? 'año' : 'años') : lang === 'pt' ? (years === 1 ? 'ano' : 'anos') : years === 1 ? 'year' : 'years';
	return `${years} ${unit}`;
}

/** Position age as a full phrase: `open 3 days ago`, `abierta hace 3
 *  días`, `aberta há 3 dias`. */
export function openAge(atMs: number, lang: AgeLang = 'en', now = Date.now()): string {
	if (!Number.isFinite(atMs) || atMs <= 0) return '';
	const mins = Math.max(0, Math.floor((now - atMs) / 60000));
	if (mins < 1) return lang === 'es' ? 'abierta ahora' : lang === 'pt' ? 'aberta agora' : 'just opened';
	const short = shortDuration(atMs, lang, now);
	if (lang === 'es') return `abierta hace ${short}`;
	if (lang === 'pt') return `aberta há ${short}`;
	return `open ${short} ago`;
}

/** Split age: `prefix` is the status word (neutral), `duration` is the time
 *  span (highlighted). */
export interface DurableAge {
	prefix: string;
	duration: string;
}

/** Human-readable age of a durable. Active items count to now; ended items
 *  count purchase → end. Returns null without a usable purchase date. */
export function durableAge(
	boughtAt: number,
	endedAt: number | null,
	lang: AgeLang,
	now = Date.now()
): DurableAge | null {
	if (!Number.isFinite(boughtAt) || boughtAt <= 0) return null;
	const span = calendarSpan(boughtAt, endedAt ?? now);
	if (!span) return null;
	const body = durationText(span, lang);
	const ended = endedAt !== null;
	if (lang === 'es') {
		if (!body) return { prefix: ended ? 'Duró menos de un día' : 'Hoy', duration: '' };
		return { prefix: ended ? 'Duró' : 'Hace', duration: body };
	}
	if (lang === 'pt') {
		if (!body) return { prefix: ended ? 'Durou menos de um dia' : 'Hoje', duration: '' };
		return { prefix: ended ? 'Durou' : 'Tem', duration: body };
	}
	if (!body) return { prefix: ended ? 'Lasted less than a day' : 'Today', duration: '' };
	return { prefix: ended ? 'Lasted' : 'Owned', duration: body };
}
