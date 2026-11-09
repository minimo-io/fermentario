import { json } from '@sveltejs/kit';
import { getStockItem, updateStockItem, deleteStockItem, addStockPhotos, removeStockPhotos } from '$lib/server/db';
import { decodePhotoUrl } from '$lib/stock-photo';

export async function GET({ params }) {
	const item = getStockItem(params.id);
	if (!item) return json({ error: 'stock item not found' }, { status: 404 });
	return json({ item });
}

export async function PATCH({ params, request }) {
	const existing = getStockItem(params.id);
	if (!existing) return json({ error: 'stock item not found' }, { status: 404 });
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const patch: Record<string, unknown> = {};
	for (const k of ['name', 'note', 'brand', 'category', 'quantity', 'package_size', 'package_unit', 'bought_at', 'bought_where', 'ended_at'] as const) {
		if (body?.[k] !== undefined) patch[k] = body[k];
	}
	// Expiration belongs to consumables; durables never store it.
	if (existing.kind === 'consumable' && body?.expires_at !== undefined) {
		patch.expires_at = body.expires_at === null || body.expires_at === '' ? null : Number(body.expires_at);
	}
	// Price and currency belong to durables. Consumables never store them.
	if (existing.kind === 'durable') {
		if (body?.price !== undefined) patch.price = body.price === null || body.price === '' ? null : body.price;
		if (body?.currency !== undefined) patch.currency = body.currency;
	}
	// A supplied price must be a number >= 0; an empty value clears it.
	if (patch.price !== undefined && patch.price !== null && (!Number.isFinite(Number(patch.price)) || Number(patch.price) < 0)) {
		return json({ error: 'price must be a number >= 0' }, { status: 400 });
	}
	const removeIds: string[] = Array.isArray(body?.removePhotos)
		? body.removePhotos.filter((x): x is string => typeof x === 'string')
		: [];
	if (body?.photo === null) removeIds.push(...existing.photos.map((p) => p.id));
	const photoUrls: string[] = [];
	if (typeof body?.photo === 'string' && body.photo.trim()) photoUrls.push(body.photo);
	if (Array.isArray(body?.photos)) {
		for (const p of body.photos) if (typeof p === 'string' && p.trim()) photoUrls.push(p);
	}
	const kept = existing.photos.filter((p) => !removeIds.includes(p.id)).length;
	if (kept + photoUrls.length > 8) return json({ error: 'up to 8 photos per item' }, { status: 400 });
	const decoded: { photo: Uint8Array; mime: string }[] = [];
	for (const url of photoUrls) {
		const d = decodePhotoUrl(url);
		if (!d) return json({ error: 'photo must be a JPEG, PNG or WebP data URL under 4 MB' }, { status: 400 });
		decoded.push({ photo: d.bytes, mime: d.mime });
	}
	const item = updateStockItem(params.id, patch);
	if (!item) return json({ error: 'stock item not found or invalid fields' }, { status: 404 });
	if (removeIds.length > 0) removeStockPhotos(params.id, removeIds);
	if (decoded.length > 0) addStockPhotos(params.id, decoded);
	const saved = getStockItem(params.id) ?? item;
	return json({ item: saved });
}

export async function DELETE({ params }) {
	if (!getStockItem(params.id)) return json({ error: 'stock item not found' }, { status: 404 });
	deleteStockItem(params.id);
	return json({ ok: true });
}
