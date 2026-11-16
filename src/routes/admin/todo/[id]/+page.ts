import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { TodoItem, TodoGroup, TaskComment } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/todo/items/${encodeURIComponent(params.id)}`);
	if (!res.ok) throw error(404, 'Task not found');
	const d = await res.json();
	const cres = await fetch(`/api/todo/items/${encodeURIComponent(params.id)}/comments`);
	const comments = cres.ok ? (((await cres.json()).comments ?? []) as TaskComment[]) : [];
	const gres = await fetch('/api/todo/groups');
	const groups = gres.ok ? (((await gres.json()).groups ?? []) as TodoGroup[]) : [];
	return { item: d.item as TodoItem, comments, groups };
};
