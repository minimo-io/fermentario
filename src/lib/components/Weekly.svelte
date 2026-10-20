<script lang="ts">
	type Props = {
		week: string | null;
		summaryLoading: boolean;
		reading: boolean;
		onRead: () => void;
		onDismiss: () => void;
	};
	let { week, summaryLoading, reading, onRead, onDismiss }: Props = $props();
</script>

{#if summaryLoading}
	<section class="relative rounded-3xl border border-amber-200/70 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/40 p-6">
		<div class="flex items-center gap-2">
			<span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"></span>
			<p class="text-xs font-medium text-amber-700 dark:text-amber-300">Brewing your weekly recap…</p>
		</div>
		<div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/50">
			<div class="h-full w-1/3 animate-pulse rounded-full bg-amber-500"></div>
		</div>
	</section>
{:else if week}
	<section class="relative rounded-3xl border border-amber-200/70 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/40 p-6">
		<button
			class="absolute right-4 top-4 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
			aria-label="Dismiss"
			onclick={onDismiss}>&times;</button>
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-300">This week</h2>
		<p class="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800 dark:text-stone-200">{week}</p>
		<button
			class="mt-4 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
			onclick={onRead}>{reading ? 'Stop reading' : 'Read aloud'}</button>
	</section>
{/if}
