import { json } from '@sveltejs/kit';
import { addBook, listBooks } from '$lib/server/db';

function hasAscii(bytes: Uint8Array, needle: string): boolean {
	// Substring scan over the raw zip: filenames appear in clear text even
	// in stored entries, and this only guards an early, friendly rejection.
	const n = new TextEncoder().encode(needle);
	outer: for (let i = 0; i + n.length <= bytes.length; i++) {
		for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
		return true;
	}
	return false;
}

/** The Library table: metadata only, never bytes. */
export async function GET() {
	return json({ books: listBooks() });
}

/** EPUB upload as multipart FormData (`file`, plus the client-parsed
 *  `title`/`author`). The bytes go to the journal DB unchanged. */
export async function POST({ request }) {
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) return json({ error: 'No EPUB file.' }, { status: 400 });
	const bytes = new Uint8Array(await file.arrayBuffer());
	if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
		return json({ error: 'Not an EPUB file.' }, { status: 400 });
	// A zip that carries an OPF encryption declaration is DRM: unreadable.
	if (hasAscii(bytes, 'encryption.xml'))
		return json({ error: 'DRM-protected EPUBs cannot be read here.' }, { status: 400 });
	const book = addBook({ bytes, title: form?.get('title'), author: form?.get('author') });
	if (!book) return json({ error: 'Failed to store the book.' }, { status: 400 });
	return json({ book }, { status: 201 });
}
