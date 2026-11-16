import { json } from '@sveltejs/kit';
import { getBook, getBookBytes } from '$lib/server/db';

/** The stored EPUB, byte for byte. Immutable: a re-upload is a new id. */
export async function GET({ params }) {
	const bytes = getBookBytes(params.id);
	if (!bytes) return json({ error: 'not found' }, { status: 404 });
	const book = getBook(params.id);
	return new Response(bytes as unknown as BodyInit, {
		status: 200,
		headers: {
			'content-type': 'application/epub+zip',
			'cache-control': 'public, max-age=31536000, immutable',
			etag: `"${params.id}-${book?.added_at ?? 0}"`
		}
	});
}
