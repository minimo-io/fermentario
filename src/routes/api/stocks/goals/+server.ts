import { json } from '@sveltejs/kit';
import { listStockCategoryGoals, setStockCategoryGoals } from '$lib/server/db';

/** Per-category amount goals: grams or litres per person. */
export async function GET() {
	return json({ goals: listStockCategoryGoals() });
}

export async function PUT({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const goals = (body as Record<string, unknown>)?.goals;
	if (!Array.isArray(goals)) {
		return json({ error: 'goals must be an array' }, { status: 400 });
	}
	const saved = setStockCategoryGoals(
		goals.map((g: unknown) => {
			const row = g as Record<string, unknown>;
			return {
				category: row?.category as string | null,
				people: row?.people as number | null,
				amount: row?.amount as number | null,
				unit: row?.unit as string | null,
				note: row?.note as string | null
			};
		})
	);
	if (!saved) {
		return json(
			{ error: 'each goal needs a category, people ≥ 1, an amount > 0 and a unit of g, kg, ml or L' },
			{ status: 400 }
		);
	}
	return json({ goals: saved });
}
