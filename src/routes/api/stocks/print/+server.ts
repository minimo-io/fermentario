import {
	listStockItems,
	listStockCategoryGoals,
	listShoppingExtras,
	addShoppingExtra,
	removeShoppingExtra
} from '$lib/server/db';
import { fmtQty, stockDisplayTitle, stockGoalAmount, stockUnit } from '$lib/stock';
import { esc, htmlShell } from '$lib/stock-print';
import type { StockItem } from '$lib/types';

/** Printable stock. `scope=all` shows every category with its stock and
 *  items; `scope=shopping` is a simple checkbox list of what to buy. */
export async function GET({ url }) {
	const scope = url.searchParams.get('scope') === 'shopping' ? 'shopping' : 'all';
	const items = listStockItems().filter((i) => i.kind === 'consumable');
	const goals = listStockCategoryGoals();
	const extras = listShoppingExtras();
	const html =
		scope === 'shopping'
			? htmlShell(scope, 'Shopping list', () => shoppingBody(items, goals, extras))
			: htmlShell(scope, 'Stock', () => printBody(items, goals));
	return new Response(html, {
		status: 200,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
			'x-content-type-options': 'nosniff',
			'cache-control': 'no-store'
		}
	});
}

/** Add or remove a manual extra, then return to the shopping list. */
export async function POST({ request }) {
	const form = await request.formData();
	const intent = String(form.get('intent') ?? '');
	if (intent === 'add') addShoppingExtra(form.get('text'));
	else if (intent === 'remove') removeShoppingExtra(String(form.get('id') ?? ''));
	return new Response(null, {
		status: 303,
		headers: { location: '/api/stocks/print?scope=shopping', 'cache-control': 'no-store' }
	});
}

function printBody(items: StockItem[], goals: ReturnType<typeof listStockCategoryGoals>): string {
	const byCategory = new Map<string, StockItem[]>();
	for (const item of items) {
		const key = item.category || 'No category';
		const list = byCategory.get(key) ?? [];
		list.push(item);
		byCategory.set(key, list);
	}
	const goalByCategory = new Map<string, (typeof goals)[number]>();
	for (const goal of goals) goalByCategory.set(goal.category, goal);

	type CatRow = { category: string; goal: (typeof goals)[number] | undefined; list: StockItem[] };
	const rows: CatRow[] = [];
	const seen = new Set<string>();
	for (const goal of goals) {
		const list = byCategory.get(goal.category) ?? [];
		rows.push({ category: goal.category, goal, list });
		seen.add(goal.category);
	}
	for (const [category, list] of byCategory) {
		if (!seen.has(category)) rows.push({ category, goal: undefined, list });
	}

	// Group blocks by parent group, empty group last.
	const blocks = new Map<string, { label: string; rows: CatRow[] }>();
	for (const row of rows) {
		const group = row.goal?.group ?? row.list[0]?.group ?? '';
		const key = group || '__none';
		let block = blocks.get(key);
		if (!block) {
			block = { label: group || 'Other', rows: [] };
			blocks.set(key, block);
		}
		block.rows.push(row);
	}
	const orderedBlocks = [...blocks.entries()]
		.sort(([ka], [kb]) => (ka === '__none' ? 1 : kb === '__none' ? -1 : ka.localeCompare(kb)))
		.map(([, block]) => block);

	return orderedBlocks
		.map((block) => {
			const summary = block.rows
				.map((row) => {
					if (!row.goal) {
						return `<tr>
							<td><strong>${esc(row.category)}</strong></td>
							<td colspan="2">No goal</td>
							<td>${row.list.length} item${row.list.length === 1 ? '' : 's'}</td>
						</tr>`;
					}
					const g = row.goal;
					const have = sumStock(row.list, g.unit);
					const need = Math.max(0, g.target - have);
					const pct = g.target > 0 ? Math.min(100, Math.round((have / g.target) * 100)) : 0;
					const status = have >= g.target ? 'Covered' : `Need ${fmtQty(need, g.unit)} more`;
					const estimate = have < g.target ? buyEstimate(row.list, g.unit, need) : '';
					return `<tr>
						<td><strong>${esc(row.category)}</strong>${g.note ? `<br><span class="muted">${esc(g.note)}</span>` : ''}</td>
						<td>${fmtQty(have, g.unit)} / ${fmtQty(g.target, g.unit)}</td>
						<td>${pct}%</td>
						<td>${status}${estimate ? `<br><span class="muted">${estimate}</span>` : ''}</td>
					</tr>`;
				})
				.join('');
			const detail = block.rows
				.map((row) => {
					if (row.list.length === 0) return '';
					return `<h3>${esc(row.category)}</h3>
				<table>
					<thead><tr><th>Item</th><th>Brand</th><th>Packages</th><th>Total</th><th>Expires</th></tr></thead>
					<tbody>${row.list
						.map((i) => {
							const per = i.package_size > 0 ? fmtQty(i.package_size, i.package_unit) : '—';
							const total = i.package_size > 0 ? fmtQty(i.quantity * i.package_size, i.package_unit) : '—';
							const expires = i.expires_at ? new Date(i.expires_at).toLocaleDateString('en-GB') : '—';
							return `<tr><td>${esc(stockDisplayTitle(i))}</td><td>${esc(i.brand || '—')}</td><td>${i.quantity} × ${per}</td><td>${total}</td><td>${expires}</td></tr>`;
						})
						.join('')}</tbody>
				</table>`;
				})
				.join('');
			return `<section class="block">
				<h2>${esc(block.label)}</h2>
				<table>
					<thead><tr><th>Category</th><th>Stock / target</th><th>Progress</th><th>Status</th></tr></thead>
					<tbody>${summary}</tbody>
				</table>
				${detail}
			</section>`;
		})
		.join('');
}

function shoppingBody(
	items: StockItem[],
	goals: ReturnType<typeof listStockCategoryGoals>,
	extras: { id: string; text: string }[]
): string {
	const byCategory = new Map<string, StockItem[]>();
	for (const item of items) {
		const key = item.category || 'No category';
		const list = byCategory.get(key) ?? [];
		list.push(item);
		byCategory.set(key, list);
	}

	const blocks = new Map<string, { label: string; lines: string[] }>();
	for (const goal of goals) {
		const list = byCategory.get(goal.category) ?? [];
		const have = sumStock(list, goal.unit);
		if (have >= goal.target) continue;
		const need = goal.target - have;
		const estimate = shoppingEstimate(list, goal.unit, need);
		const label = goal.group || 'Other';
		let block = blocks.get(label);
		if (!block) {
			block = { label, lines: [] };
			blocks.set(label, block);
		}
		const category = `<span class="muted">· ${esc(goal.category)}</span>`;
		const line = estimate
			? `<strong>${estimate.packages} × ${esc(fmtQty(estimate.size, estimate.unit))}</strong> ${esc(estimate.title)} ${category}`
			: `<strong>${esc(fmtQty(need, goal.unit))}</strong> ${category}`;
		block.lines.push(`<li><label><input type="checkbox" /> <span>${line}</span></label></li>`);
	}

	const ordered = [...blocks.entries()]
		.sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))
		.map(([, block]) => block);
	const list =
		ordered.length === 0
			? '<p class="muted">Nothing to buy.</p>'
			: ordered
					.map(
						(block) => `<section class="block">
				<h2>${esc(block.label)}</h2>
				<ul class="shop">${block.lines.join('')}</ul>
			</section>`
					)
					.join('');
	return list + extrasSection(extras);
}

function extrasSection(extras: { id: string; text: string }[]): string {
	const form = `<form method="POST" action="/api/stocks/print?scope=shopping" class="add-extra no-print">
		<input type="hidden" name="intent" value="add" />
		<input type="text" name="text" maxlength="120" placeholder="Add an extra" aria-label="Add an extra" required />
		<button type="submit">Add</button>
	</form>`;
	if (extras.length === 0) return form;
	const lines = extras
		.map(
			(e) => `<li class="extra">
				<label><input type="checkbox" /> <span>${esc(e.text)}</span></label>
				<form method="POST" action="/api/stocks/print?scope=shopping" class="no-print">
					<input type="hidden" name="intent" value="remove" />
					<input type="hidden" name="id" value="${esc(e.id)}" />
					<button type="submit" aria-label="Remove ${esc(e.text)}" title="Remove">×</button>
				</form>
			</li>`
		)
		.join('');
	return `<section class="block extras">
		<h2>Extras</h2>
		<ul class="shop">${lines}</ul>
		${form}
	</section>`;
}

function shoppingEstimate(
	list: StockItem[],
	goalUnit: string,
	need: number
): { packages: number; size: number; unit: string; title: string } | null {
	const candidates = list
		.filter((i) => i.package_size > 0 && stockGoalAmount(i, goalUnit) !== null)
		.sort((a, b) => b.created_at - a.created_at || b.updated_at - a.updated_at);
	const latest = candidates[0];
	if (!latest) return null;
	const per = stockGoalAmount({ ...latest, quantity: 1 }, goalUnit);
	if (per === null || per <= 0) return null;
	return {
		packages: Math.ceil(need / per),
		size: latest.package_size,
		unit: stockUnit(latest),
		title: stockDisplayTitle(latest)
	};
}

function sumStock(list: StockItem[], goalUnit: string): number {
	let total = 0;
	for (const item of list) {
		const added = stockGoalAmount(item, goalUnit);
		if (added !== null) total += added;
	}
	return total;
}

function buyEstimate(list: StockItem[], goalUnit: string, need: number): string {
	const candidates = list
		.filter((i) => i.package_size > 0 && stockGoalAmount(i, goalUnit) !== null)
		.sort((a, b) => b.created_at - a.created_at || b.updated_at - a.updated_at);
	const latest = candidates[0];
	if (!latest) return '';
	const per = stockGoalAmount({ ...latest, quantity: 1 }, goalUnit);
	if (per === null || per <= 0) return '';
	return `≈ ${Math.ceil(need / per)} × ${fmtQty(latest.package_size, latest.package_unit)} of ${stockDisplayTitle(latest)}`;
}
