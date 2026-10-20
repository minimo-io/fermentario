<script lang="ts">
	type Props = { label: string; id: string };
	let { label, id }: Props = $props();
</script>

<h1 class="mt-3 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
	{label}
	<span class="ml-1 text-sm font-normal tabular-nums text-stone-400 dark:text-stone-500" title={id}>#{id.slice(0, 8)}</span>
</h1>
