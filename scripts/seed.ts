/**
 * The fixture data, as SQL, so the frozen `journal.db` cannot drift from its
 * source. Two notes share a `created_at` on purpose: the
 * pagination cursor is `(created_at, id)`, so a change to the ordering shows up
 * as a reordering rather than passing silently.
 */
export const DIMS = 384;
const DAY = 24 * 60 * 60 * 1000;
/** 2025-03-04T12:00:00Z. Fixed so the heatmap day keys never move. */
export const BASE = Date.UTC(2025, 2, 4, 12, 0, 0);

export const NOTES = [
	{ id: '11111111-1111-4111-8111-111111111101', at: BASE, text: 'Went kayaking on the river at dawn.', tags: ['garden'] },
	{ id: '11111111-1111-4111-8111-111111111102', at: BASE, text: 'Fixed the broken chair in the hallway.', tags: [] },
	{ id: '11111111-1111-4111-8111-111111111103', at: BASE - 2 * DAY, text: 'Long standup about the migration deadline.', tags: ['work'] },
	{ id: '11111111-1111-4111-8111-111111111104', at: BASE - 9 * DAY, text: 'Finally finished the kayak paddle repair.', tags: ['garden', 'work'] },
	{ id: '11111111-1111-4111-8111-111111111105', at: Date.UTC(2024, 10, 3, 9, 30, 0), text: 'Old note from last year about kayaking trips.', tags: ['garden'] }
];

export const ASK_ID = '22222222-2222-4222-8222-222222222201';
export const WEEK_KEY = String(Math.floor(BASE / (7 * 24 * 60 * 60 * 1000)));
export const RECAP = 'The week was about kayaking and one broken chair.';

/** Deterministic pseudo-embedding. Real values come from the embedder; the
 *  tests only care that the bytes survive a round trip unchanged. */
export function vector(seed: number): Float32Array {
	const v = new Float32Array(DIMS);
	for (let i = 0; i < DIMS; i++) v[i] = Math.round(Math.sin((i + seed) / 7) * 1000) / 1000;
	return v;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The full fixture as one script. Run against either engine. */
export function seedSql(): string {
	const parts: string[] = [];
	for (const [i, n] of NOTES.entries()) {
		parts.push(
			`INSERT INTO notes (id, content, created_at, updated_at) VALUES (${q(n.id)}, ${q(n.text)}, ${n.at}, ${n.at});`,
			`INSERT INTO notes_fts (content, note_id) VALUES (${q(n.text)}, ${q(n.id)});`
		);
		for (const t of n.tags) {
			parts.push(`INSERT INTO note_tags (note_id, tag) VALUES (${q(n.id)}, ${q(t)});`);
		}
		const v = vector(i);
		const bytes = Array.from(new Uint8Array(v.buffer));
		// x'…' blob literal: identical bytes in both engines, no bind layer.
		parts.push(
			`INSERT INTO note_vectors (note_id, vector) VALUES (${q(n.id)}, x'${bytes
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')}');`
		);
	}
	parts.push(
		`INSERT INTO weekly_recaps (week_key, content, created_at, updated_at) VALUES (${q(WEEK_KEY)}, ${q(RECAP)}, ${BASE}, ${BASE});`,
		`INSERT INTO ask_history (id, question, answer, sources, created_at) VALUES (${q(ASK_ID)}, ${q('what did I do at the weekend?')}, ${q('You went kayaking on the river at dawn.')}, ${q(
			JSON.stringify([{ id: NOTES[0].id, at: NOTES[0].at, content: NOTES[0].text }])
		)}, ${BASE});`
	);
	return parts.join('\n');
}
