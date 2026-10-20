<script lang="ts">
	type Props = {
		keys: string[];
		tone?: 'light' | 'dark';
	};
	let { keys, tone = 'light' }: Props = $props();
</script>

<span class="ml-1.5 hidden items-center gap-0.5 sm:inline-flex" aria-hidden="true">
	{#each keys as k (k)}
		<kbd
			class="min-w-4 rounded border px-1 py-px text-center font-mono text-[10px] font-medium leading-4 {tone === 'dark'
				? 'border-white/25 bg-white/15 text-white/80'
				: 'border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'}"
		>
			{k}
		</kbd>
	{/each}
</span>