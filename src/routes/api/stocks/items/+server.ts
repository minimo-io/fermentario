import { json } from '@sveltejs/kit';
import { listStockItems, createStockItem, getStockItem, addStockPhotos } from '$lib/server/db';
import { decodePhotoUrl } from '$lib/stock-photo';
import type { StockItemInput } from '$lib/server/db';

export async function GET() {
	return json({ items: listStockItems() });
}

function num(v: unknown): number | null {
	if (v === undefined || v === null || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function inputFrom(body: Record<string, unknown>): StockItemInput | null {
	const kind = body?.kind === 'durable' ? 'durable' : 'consumable';
	if (kind === 'consumable') {
		const quantity = Number(body?.quantity);
		if (!Number.isFinite(quantity) || quantity < 0) return null;
		// Consumables carry no days or price: the package size drives the
		// category goal. The old fields are ignored when sent.
		return {
			kind,
			name: String(body?.name ?? ''),
			brand: String(body?.brand ?? ''),
			category: String(body?.category ?? ''),
			note: String(body?.note ?? ''),
			quantity,
			package_size:
				body?.package_size === undefined || body?.package_size === null || body?.package_size === ''
					? 0
					: Number(body.package_size),
			package_unit: String(body?.package_unit ?? 'g'),
			expires_at: typeof body?.expires_at === 'number' && Number.isFinite(body.expires_at) && body.expires_at > 0 ? body.expires_at : null
		};
	}
	return {
		kind,
		name: String(body?.name ?? ''),
		brand: String(body?.brand ?? ''),
		category: String(body?.category ?? ''),
		note: String(body?.note ?? ''),
		bought_at: num(body?.bought_at),
		price: body?.price === undefined || body?.price === null || body?.price === '' ? null : Number(body?.price),
		currency: String(body?.currency ?? 'BRL'),
		bought_where: String(body?.bought_where ?? ''),
		ended_at: num(body?.ended_at)
	};
}

export async function POST({ request }) {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const input = inputFrom(body);
	if (!input) return json({ error: 'name and valid kind fields are required' }, { status: 400 });
	if (input.kind === 'durable' && input.price !== null && input.price !== undefined && (!Number.isFinite(input.price) || input.price < 0)) {
		return json({ error: 'price must be a number >= 0' }, { status: 400 });
	}
	const photoUrls: string[] = [];
	if (typeof body?.photo === 'string' && body.photo.trim()) photoUrls.push(body.photo);
	if (Array.isArray(body?.photos)) {
		for (const p of body.photos) if (typeof p === 'string' && p.trim()) photoUrls.push(p);
	}
	if (photoUrls.length > 8) return json({ error: 'up to 8 photos per item' }, { status: 400 });
	const decoded: { photo: Uint8Array; mime: string }[] = [];
	for (const url of photoUrls) {
		const d = decodePhotoUrl(url);
		if (!d) return json({ error: 'photo must be a JPEG, PNG or WebP data URL under 4 MB' }, { status: 400 });
		decoded.push({ photo: d.bytes, mime: d.mime });
	}
	const item = createStockItem(input);
	if (!item) return json({ error: 'name and valid kind fields are required' }, { status: 400 });
	if (decoded.length > 0) addStockPhotos(item.id, decoded);
	const saved = getStockItem(item.id) ?? item;
	return json({ item: saved }, { status: 201 });
}
