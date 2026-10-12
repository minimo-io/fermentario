import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { deleteAsk } from '$lib/server/db';

export async function DELETE({ params }: RequestEvent) {
	const id = params.id ?? '';
	if (!id) return json({ ok: false, error: 'missing id' }, { status: 400 });
	const ok = deleteAsk(id);
	return json({ ok });
}