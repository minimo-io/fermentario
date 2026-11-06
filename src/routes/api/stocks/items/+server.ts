import { json } from '@sveltejs/kit';
import { listStockItems, createStockItem, setStockItemPhoto, getStockItem } from '$lib/server/db';
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
		const duration = Number(body?.duration_days);
		if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(duration) || duration < 0) return null;
		return {
			kind,
			name: String(body?.name ?? ''),
			brand: String(body?.brand ?? ''),
			category: String(body?.category ?? ''),
			note: String(body?.note ?? ''),
			quantity,
			duration_days: duration
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
	let photo: { bytes: Uint8Array; mime: string } | null = null;
	if (typeof body?.photo === 'string' && body.photo.trim()) {
		photo = decodePhotoUrl(body.photo);
		if (!photo) return json({ error: 'photo must be a JPEG, PNG or WebP data URL under 4 MB' }, { status: 400 });
	}
	const item = createStockItem(input);
	if (!item) return json({ error: 'name and valid kind fields are required' }, { status: 400 });
	if (photo) setStockItemPhoto(item.id, photo.bytes, photo.mime);
	const saved = getStockItem(item.id) ?? item;
	return json({ item: saved }, { status: 201 });
}
