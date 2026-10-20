<script lang="ts">
	type Props = { label: string };
	let { label }: Props = $props();
</script>

<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
	{label} lives here soon.
</p>
