<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { loading } from '$lib/loading.svelte';
	import { withSubgroupPrefix } from '$lib/subgroups';
	import { youTubeWatchUrl } from '$lib/youtube';
	import type { TodoGroup, TodoItem } from '$lib/types';

	type Props = {
		item: TodoItem;
		groups: TodoGroup[];
		onSaved: (item: TodoItem, moved: boolean) => void;
		onClose: () => void;
		onError: (msg: string) => void;
	};
	let { item, groups, onSaved, onClose, onError }: Props = $props();

	// The modal edits the full line: subgroup prefix and trailing hashtags
	// included, so saving never silently drops either.
	// svelte-ignore state_referenced_locally
	const base = withSubgroupPrefix(item.subgroup, item.content);
	// svelte-ignore state_referenced_locally
	let text = $state(item.tags.length ? `${base} ${item.tags.map((t) => `#${t}`).join(' ')}` : base);
	// svelte-ignore state_referenced_locally
	let video = $state(item.video ? youTubeWatchUrl(item.video) : '');
	// svelte-ignore state_referenced_locally
	let group = $state(item.group_id);
	let field = $state<HTMLTextAreaElement | null>(null);
	let saving = $state(false);

	$effect(() => {
		if (field) {
			field.focus();
			autosize();
		}
	});

	$effect(() => {
		void text;
		autosize();
	});

	function autosize() {
		if (!field) return;
		field.style.height = 'auto';
		field.style.height = `${field.scrollHeight}px`;
	}

	async function save() {
		if (!text.trim() || saving) return;
		const target = group && group !== item.group_id ? group : null;
		try {
			saving = true;
			const res = await loading.track(fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text, video: video.trim(), ...(target ? { group_id: target } : {}) })
			}));
			const d = await res.json();
			if (!res.ok || !d.item) throw new Error(d?.error ?? 'Failed to save item.');
			onSaved(d.item as TodoItem, Boolean(target));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save item.');
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Edit task"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
		<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Edit task</h2>
		<textarea
			bind:this={field}
			rows="3"
			class="mt-3 max-h-[50dvh] min-h-24 w-full resize-none rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base leading-snug text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
			aria-label="Task text"
			value={text}
			oninput={(e) => { text = e.currentTarget.value; autosize(); }}
			onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(); }}
		></textarea>
		<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">Leading (subgroup) moves it inside the list; trailing #tags retag it.</p>
		<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-task-video">YouTube URL (optional)</label>
		<input
			id="edit-task-video"
			class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
			aria-label="YouTube URL"
			value={video}
			oninput={(e) => (video = e.currentTarget.value)}
			onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(); }}
			placeholder="https://www.youtube.com/watch?v=…"
			inputmode="url"
		/>
		{#if groups.length > 1}
			<div class="mt-3">
				<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-task-group">Group</label>
				<select
					id="edit-task-group"
					class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2.5 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
					aria-label="Group"
					bind:value={group}
					onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save(); }}
				>
					{#each groups as g (g.id)}
						<option value={g.id}>{g.name}</option>
					{/each}
				</select>
			</div>
		{/if}
		<div class="mt-4 flex justify-end gap-2">
			<button
				type="button"
				class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
				disabled={saving}
				onclick={onClose}
			>Cancel</button>
			<button
				type="button"
				class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
				disabled={!text.trim() || saving}
				onclick={() => void save()}
			>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</div>
</div>
