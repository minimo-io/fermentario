<script lang="ts">
	import { tagColors } from '$lib/tag-colors.svelte';
	import TagColorModal from '$lib/components/TagColorModal.svelte';

	type Props = {
		tag: string;
		onRemove?: (tag: string) => void;
		picker?: boolean;
	};
	let { tag, onRemove, picker = true }: Props = $props();

	let open = $state(false);
</script>

<span
	class="group relative inline-flex items-center overflow-hidden rounded-full py-0.5 pl-2 pr-0.5 text-[11px] transition-colors {tagColors.chip(tag)}"
>
	<a
		href="/tags/{encodeURIComponent(tag)}"
		title="See every note tagged #{tag}"
		class="hover:opacity-80"
	>#{tag}</a>
	{#if picker}
		<button
			type="button"
			class="ml-1 grid h-4 w-4 place-items-center rounded-full hover:bg-black/10"
			aria-label="Change color of #{tag}"
			title="Change color"
			onclick={(e) => { e.stopPropagation(); open = true; }}
		><span class="h-2.5 w-2.5 rounded-full {tagColors.dot(tag)}"></span></button>
	{/if}
	{#if onRemove}
		<button
			type="button"
			class="grid h-4 w-4 place-items-center rounded-full opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-hover:opacity-100"
			aria-label="Remove #{tag} from this note"
			title="Remove this tag"
			onclick={() => onRemove(tag)}
		>&times;</button>
	{/if}
</span>

{#if open}
	<TagColorModal {tag} onClose={() => (open = false)} />
{/if}
