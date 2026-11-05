import { json } from '@sveltejs/kit';
import { getStockItem, updateStockItem, deleteStockItem, setStockItemPhoto } from '$lib/server/db';
import { decodePhotoUrl } from '$lib/stock-photo';

export async function GET({ params }) {
	const item = getStockItem(params.id);
	if (!item) return json({ error: 'stock item not found' }, { status: 404 });
	return json({ item });
}

export async function PATCH({ params, request }) {
	if (!getStockItem(params.id)) return json({ error: 'stock item not found' }, { status: 404 });
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const patch: Record<string, unknown> = {};
	for (const k of ['name', 'note', 'quantity', 'duration_days', 'bought_at', 'bought_where', 'ended_at'] as const) {
		if (body?.[k] !== undefined) patch[k] = body[k];
	}
	if (body?.price !== undefined) patch.price = body.price === null || body.price === '' ? null : body.price;
	if (body?.currency !== undefined) patch.currency = body.currency;
	// A supplied price must be a number >= 0; an empty value clears it.
	if (patch.price !== undefined && patch.price !== null && (!Number.isFinite(Number(patch.price)) || Number(patch.price) < 0)) {
		return json({ error: 'price must be a number >= 0' }, { status: 400 });
	}
	let photo: { bytes: Uint8Array; mime: string } | 'clear' | null = null;
	if (body?.photo !== undefined) {
		if (body.photo === null) {
			photo = 'clear';
		} else if (typeof body.photo === 'string' && body.photo.trim()) {
			const decoded = decodePhotoUrl(body.photo);
			if (!decoded) return json({ error: 'photo must be a JPEG, PNG or WebP data URL under 4 MB' }, { status: 400 });
			photo = decoded;
		}
	}
	const item = updateStockItem(params.id, patch);
	if (!item) return json({ error: 'stock item not found or invalid fields' }, { status: 404 });
	if (photo === 'clear') setStockItemPhoto(params.id, null, '');
	else if (photo) setStockItemPhoto(params.id, photo.bytes, photo.mime);
	const saved = getStockItem(params.id) ?? item;
	return json({ item: saved });
}

export async function DELETE({ params }) {
	if (!getStockItem(params.id)) return json({ error: 'stock item not found' }, { status: 404 });
	deleteStockItem(params.id);
	return json({ ok: true });
}
