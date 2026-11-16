import { json } from '@sveltejs/kit';
import { deleteBook, getBook } from '$lib/server/db';

export async function GET({ params }) {
	const book = getBook(params.id);
	if (!book) return json({ error: 'not found' }, { status: 404 });
	return json({ book });
}

export async function DELETE({ params }) {
	if (!deleteBook(params.id)) return json({ error: 'not found' }, { status: 404 });
	return json({ ok: true });
}
