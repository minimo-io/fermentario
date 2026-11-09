import { json } from '@sveltejs/kit';
import { deleteStockGroup, setStockCategory } from '$lib/server/db';

/** Edit one category: its group and optional goal. Amount empty/zero
 *  removes the goal but keeps the category and group. */
export async function PUT({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const row = body as Record<string, unknown>;
	const goalRaw = row?.goal;
	const goal =
		goalRaw === null || goalRaw === undefined
			? null
			: {
					people: Number((goalRaw as Record<string, unknown>)?.people),
					amount: Number((goalRaw as Record<string, unknown>)?.amount),
					unit: String((goalRaw as Record<string, unknown>)?.unit ?? 'g'),
					note: String((goalRaw as Record<string, unknown>)?.note ?? '')
				};
	const saved = setStockCategory({
		category: String(row?.category ?? ''),
		group: String(row?.group ?? ''),
		goal
	});
	if (!saved) {
		return json(
			{ error: 'category, group and a valid goal are required; amount must be > 0' },
			{ status: 400 }
		);
	}
	return json(saved);
}

/** Clear a group label from every category that uses it. Categories stay. */
export async function DELETE({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const group = String((body as Record<string, unknown>)?.group ?? '').trim();
	if (!group) return json({ error: 'group is required' }, { status: 400 });
	const saved = deleteStockGroup(group);
	if (!saved) return json({ error: 'could not delete the group' }, { status: 500 });
	return json(saved);
}
