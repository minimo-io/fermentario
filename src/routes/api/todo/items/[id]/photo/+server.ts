import { json } from '@sveltejs/kit';
import { getTodoItem, setTodoItemPhoto, removeTodoItemPhoto } from '$lib/server/db';
import { decodePhotoUrl } from '$lib/stock-photo';

/** Set (replacing) a task's image. Body: { photo: dataUrl }. */
export async function POST({ params, request }) {
	const item = getTodoItem(params.id);
	if (!item) return json({ error: 'not found' }, { status: 404 });
	let body: { photo?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (typeof body?.photo !== 'string' || !body.photo.trim()) {
		return json({ error: 'photo must be a JPEG, PNG or WebP data URL under 4 MB' }, { status: 400 });
	}
	const d = decodePhotoUrl(body.photo);
	if (!d) return json({ error: 'photo must be a JPEG, PNG or WebP data URL under 4 MB' }, { status: 400 });
	const saved = setTodoItemPhoto(params.id, d.bytes, d.mime);
	if (!saved) return json({ error: 'not found' }, { status: 404 });
	return json({ id: saved.id, created_at: saved.created_at }, { status: 201 });
}

export async function DELETE({ params }) {
	const item = getTodoItem(params.id);
	if (!item) return json({ error: 'not found' }, { status: 404 });
	removeTodoItemPhoto(params.id);
	return json({ ok: true });
}
