import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { TodoItem, TaskComment } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/todo/items/${encodeURIComponent(params.id)}`);
	if (!res.ok) throw error(404, 'Task not found');
	const d = await res.json();
	const cres = await fetch(`/api/todo/items/${encodeURIComponent(params.id)}/comments`);
	const comments = cres.ok ? (((await cres.json()).comments ?? []) as TaskComment[]) : [];
	return { item: d.item as TodoItem, comments };
};
