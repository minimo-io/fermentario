<script lang="ts">
	import { flip } from 'svelte/animate';
	import { CONTENT_WIDTH_OPTIONS, type ContentWidth } from '$lib/display';

	type Lang = 'en' | 'es' | 'pt';

	type Props = {
		entriesLang: Lang;
		contentWidth: ContentWidth;
		sections: { id: string; label: string }[];
		onSave: (p: { entriesLang: Lang }) => void;
		onWidth: (w: ContentWidth) => void;
		onSections: (ids: string[]) => void;
	};
	let { entriesLang, contentWidth, sections, onSave, onWidth, onSections }: Props = $props();

	// svelte-ignore state_referenced_locally
	let el = $state<Lang>(entriesLang);
	let saved = $state(false);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	const LANGS: { v: Lang; label: string }[] = [
		{ v: 'en', label: 'English' },
		{ v: 'es', label: 'Español' },
		{ v: 'pt', label: 'Português' }
	];

	function save() {
		onSave({ entriesLang: el });
		saved = true;
		clearTimeout(savedTimer);
		savedTimer = setTimeout(() => (saved = false), 1500);
	}
</script>

<p class="mb-1 block text-xs font-medium text-stone-500">Entries language</p>
<div class="mb-4 flex gap-2">
	{#each LANGS as l}
		<button
			type="button"
			class="rounded-full border px-3 py-1 text-xs font-medium {el === l.v ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}"
			onclick={() => { el = l.v; saved = false; }}
		>{l.label}</button>
	{/each}
</div>

<div class="mb-4 flex justify-end">
	<button
		type="button"
		class="rounded-full px-4 py-1.5 text-xs font-medium {saved ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-white hover:bg-stone-800'}"
		onclick={save}
	>{saved ? 'Saved ✓' : 'Save language'}</button>
</div>

<div class="border-t border-stone-200 pt-4">
	<p class="text-xs font-medium text-stone-500">Column width</p>
	<div class="mt-2 flex gap-2">
		{#each CONTENT_WIDTH_OPTIONS as w}
			<button
				type="button"
				class="rounded-full border px-3 py-1 text-xs font-medium {contentWidth === w.id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}"
				onclick={() => onWidth(w.id)}
			>{w.label}</button>
		{/each}
	</div>
	<p class="mt-1.5 text-[11px] leading-snug text-stone-400">
		The main column on desktop. The composer bar follows it.
	</p>
</div>

<div class="mt-4 border-t border-stone-200 pt-4">
	<p class="text-xs font-medium text-stone-500">Sections</p>
	<ul class="mt-2 space-y-1">
		{#each sections as s, i (s.id)}
			<li animate:flip={{ duration: 200 }} class="flex items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600">
				<span class="inline-flex items-center gap-2">{s.label}<span class="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">G then {i + 1}</span></span>
				<span class="flex gap-1">
					<button
						type="button"
						aria-label="Move {s.label} up"
						disabled={i === 0}
						class="rounded-full border border-stone-200 px-2 py-0.5 hover:bg-stone-100 disabled:opacity-40"
						onclick={() => {
							const ids = sections.map((x) => x.id);
							[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
							onSections(ids);
						}}
					>↑</button>
					<button
						type="button"
						aria-label="Move {s.label} down"
						disabled={i === sections.length - 1}
						class="rounded-full border border-stone-200 px-2 py-0.5 hover:bg-stone-100 disabled:opacity-40"
						onclick={() => {
							const ids = sections.map((x) => x.id);
							[ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
							onSections(ids);
						}}
					>↓</button>
				</span>
			</li>
		{/each}
	</ul>
	<p class="mt-1.5 text-[11px] leading-snug text-stone-400">
		The order of the section pills. Drag the pills directly works too.
	</p>
</div>
