<script lang="ts">
	import { LINK_PILL_CLASS, linkHref } from '$lib/note-links';
	import type { LinkRef } from '$lib/platform/journal';

	type Props = {
		links: LinkRef[];
	};
	let { links }: Props = $props();
</script>

{#if links.length > 0}
	<div class="flex flex-wrap gap-1" aria-label="Linked entries">
		{#each links as l (l.id)}
			<a href={linkHref(l.id, l.kind)} class={LINK_PILL_CLASS} title={l.label}>
				<span class="truncate">{l.label}</span>
			</a>
		{/each}
	</div>
{/if}
