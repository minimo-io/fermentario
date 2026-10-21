import { getChatModelReady, chat } from '$lib/server/models';
import { getNote, notesMissingTags, setNoteTags } from '$lib/server/db';
import { onJournalChange } from './journal-events';

const TAG_SYSTEM = 'You assign short tags to private journal notes.';

const REFUSAL = /\b(I'?m sorry|(can'?t|cannot)\s+(assist|help|do)|I\s+can'?t\s+(assist|help))\b/i;

/** Clean raw model output into a short tag list. Returns [] on refusal or
 *  anything unparseable (never stores garbage). */
export function cleanTags(raw: string): string[] {
	let t = raw.trim();
	if (!t || REFUSAL.test(t)) return [];
	// strip a "tags:" / "here are the tags:" style preamble line
	const head = t.match(/^[^\n]+:\s*\n\n?/);
	if (head) t = t.slice(head[0].length);
	t = t.split(/\n\s*\n/)[0].trim();
	t = t.split('\n')[0];
	const tags: string[] = [];
	for (const part of t.split(',')) {
		const s = part
			.replace(/^[\s"'#:\-\d.]*/, '')
			.replace(/[\s"'#\d.]*$/, '')
			.trim()
			.toLowerCase();
		if (!s || s.includes('"') || s.length > 40 || s.split(/\s+/).length > 4) continue;
		if (!tags.includes(s)) tags.push(s);
		if (tags.length === 5) break;
	}
	// a single leftover token is almost always prose, not a tag
	return tags.length >= 2 ? tags : [];
}

/** Generate tags for one note's content. Best-effort: returns [] on failure. */
export async function generateTagsForNote(content: string): Promise<string[]> {
	try {
		const raw = await chat(
			[
				{ role: 'system', content: TAG_SYSTEM },
				{
					role: 'user',
					content:
						'Add 3-5 short lowercase tags to this note. Use single words or short phrases. ' +
						'Derive them only from the note. Output the tags comma-separated, nothing else.\n\n' +
						content
				}
			],
			{ maxNewTokens: 60, sample: false }
		);
		return cleanTags(raw);
	} catch {
		return [];
	}
}

let tagging: Promise<void> | null = null;
let epoch = 0;

/** Notes already tried in this process. Without this the pass loops forever:
 *  a model that cannot produce parseable tags leaves the note untagged, so the
 *  next request finds it "missing" again and generates again, blocking the
 *  single Node thread and delaying every other request. */
const attempted = new Set<string>();

onJournalChange(() => {
	epoch++;
	tagging = null;
	attempted.clear();
});

/** Tag one note and store the result (no-op when nothing usable). */
export async function tagNote(noteId: string, content: string): Promise<string[]> {
	const startedFor = epoch;
	const tags = await generateTagsForNote(content);
	if (startedFor !== epoch) return [];
	if (tags.length > 0) setNoteTags(noteId, tags);
	return tags;
}

/** Pass over notes missing tags, mirroring ensureIndexed(). Only runs when
 *  the chat model is already loaded — never forces a model load. Safe to call
 *  concurrently; idempotent. */
export function ensureTags(): Promise<void> {
	if (tagging) return tagging;
	const startedFor = epoch;
	tagging = (async () => {
		if (!getChatModelReady()) return;
		const ids = notesMissingTags();
		for (const id of ids) {
			if (startedFor !== epoch) return;
			if (attempted.has(id)) continue;
			attempted.add(id);
			const note = getNote(id);
			if (!note) continue;
			await tagNote(id, note.content);
		}
	})()
		.catch(() => {})
		.finally(() => {
			if (startedFor === epoch) tagging = null;
		});
	return tagging;
}