import type { Note } from '$lib/types';
import { youTubeWatchUrl } from '$lib/youtube';

export interface FormattedNoteLine {
	day: string;
	header: string;
	time: string;
	text: string;
	tags: string[];
}

/** Split notes into day groups ordered oldest day first, with the notes inside
 *  each day in chronological order. Day keys match Timeline's `en-CA` grouping
 *  so the two views always agree on what belongs to which day. */
export function groupNotesByDay(
	notes: Note[]
): { day: string; date: Date; items: Note[] }[] {
	const byDay = new Map<string, Note[]>();
	for (const n of notes) {
		const day = new Date(n.created_at).toLocaleDateString('en-CA');
		const list = byDay.get(day);
		if (list) list.push(n);
		else byDay.set(day, [n]);
	}
	return [...byDay.keys()]
		.sort()
		.map((day) => {
			const items = (byDay.get(day) ?? []).slice().sort((a, b) => a.created_at - b.created_at);
			return { day, date: new Date(items[0].created_at), items };
		});
}

/** Plain-text export of notes, grouped by day, one line per note.
 *
 *  Tags are appended at the end of the line: since task 004 the note text no
 *  longer contains its hashtags, so a copy without them loses information. */
export function formatNotesForClipboard(notes: Note[], locale = 'en-GB'): string {
	if (notes.length === 0) return '';
	const blocks = groupNotesByDay(notes).map(({ date, items }) => {
		const header = date.toLocaleDateString(locale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		const lines = items.map((n) => {
			const time = new Date(n.created_at).toLocaleTimeString(locale, {
				hour: '2-digit',
				minute: '2-digit'
			});
			const tags = (n.tags ?? []).map((t) => `#${t}`).join(' ');
			const video = n.video ? `  ${youTubeWatchUrl(n.video)}` : '';
			return `${time}  ${n.content}${tags ? `  ${tags}` : ''}${video}`;
		});
		return `${header}\n${lines.join('\n')}`;
	});
	return blocks.join('\n\n');
}
