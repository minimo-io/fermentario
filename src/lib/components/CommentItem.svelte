<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';

	type Props = {
		content: string;
		date: string;
		onEdit: () => void;
		onDelete: () => void;
	};
	let { content, date, onEdit, onDelete }: Props = $props();
</script>

<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
	<p class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800 dark:text-stone-200">{content}</p>
	<div class="mt-1 flex items-center justify-between gap-2">
		<span class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{date}</span>
		<div class="-mr-1 flex shrink-0 items-center gap-0.5">
			<button
				type="button"
				class="grid h-7 w-7 place-items-center rounded-full text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Edit comment"
				title="Edit comment"
				onclick={onEdit}
			>
				<Pencil class="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				class="grid h-7 w-7 place-items-center rounded-full text-base leading-none text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-rose-600 dark:hover:text-rose-400"
				aria-label="Delete comment"
				title="Delete comment"
				onclick={onDelete}
			>&times;</button>
		</div>
	</div>
</li>
