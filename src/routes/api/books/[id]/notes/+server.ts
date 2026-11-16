import { json } from '@sveltejs/kit';
import { createBookNote, getBook, listBookNotes } from '$lib/server/db';

function num(value: string | null): number | null {
	if (value === null || value.trim() === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/** One page of the book's notes, newest first. Default 50, max 100. */
export async function GET({ params, url }) {
	return json(
		listBookNotes(params.id, {
			limit: num(url.searchParams.get('limit')) ?? 50,
			before: num(url.searchParams.get('before')),
			beforeId: url.searchParams.get('before_id')
		})
	);
}

/** A highlight (no note) or highlight + note for the selected CFI range. */
export async function POST({ params, request }) {
	if (!getBook(params.id)) return json({ error: 'not found' }, { status: 404 });
	const body = await request.json().catch(() => ({}));
	const note = createBookNote(params.id, { cfi: body?.cfi, excerpt: body?.excerpt, note: body?.note });
	if (!note) return json({ error: 'a highlight needs a selected range' }, { status: 400 });
	return json({ note }, { status: 201 });
}
