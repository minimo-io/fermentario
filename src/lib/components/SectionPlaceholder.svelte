<script lang="ts">
	type Props = { label: string };
	let { label }: Props = $props();
</script>

<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-500">
	{label} lives here soon.
</p>
