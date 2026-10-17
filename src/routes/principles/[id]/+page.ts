import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { Principle, PrincipleComment } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
	// The principles list is small; the detail view reads it whole and picks
	// the one principle instead of adding a single-principle endpoint.
	const res = await fetch(`/api/principles`);
	if (!res.ok) throw error(404, 'Principle not found');
	const d = (await res.json()) as { principles?: Principle[] };
	const principle = d.principles?.find((p) => p.id === params.id);
	if (!principle) throw error(404, 'Principle not found');
	const cres = await fetch(`/api/principles/${encodeURIComponent(params.id)}/comments`);
	const comments = cres.ok ? (((await cres.json()).comments as PrincipleComment[]) ?? []) : ([] as PrincipleComment[]);
	return { principle, comments };
};
