<script lang="ts">
	type Props = {
		keys: string[];
		tone?: 'light' | 'dark';
		/** Keyboards are rare below `sm`, but the help dialog must still show them. */
		always?: boolean;
	};
	let { keys, tone = 'light', always = false }: Props = $props();
</script>

<span
	class="ml-1.5 {always ? 'inline-flex' : 'hidden sm:inline-flex'} items-center gap-0.5"
	aria-hidden="true"
>
	{#each keys as k (k)}
		<kbd
			class="min-w-4 rounded border px-1 py-px text-center font-mono text-[10px] font-medium leading-4 {tone ===
			'dark'
				? 'border-white/25 bg-white/15 text-white/80'
				: 'border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'}"
		>
			{k}
		</kbd>
	{/each}
</span>
