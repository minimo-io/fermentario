<script lang="ts">
	import { flip } from 'svelte/animate';
	import { CONTENT_WIDTH_OPTIONS, type ContentWidth } from '$lib/display';
	import { THEME_OPTIONS, type Theme } from '$lib/theme';

	type Lang = 'en' | 'es' | 'pt';

	type Props = {
		entriesLang: Lang;
		contentWidth: ContentWidth;
		theme: Theme;
		sections: { id: string; label: string }[];
		onSave: (p: { entriesLang: Lang }) => void;
		onWidth: (w: ContentWidth) => void;
		onSections: (ids: string[]) => void;
		onTheme: (t: Theme) => void;
	};
	let { entriesLang, contentWidth, theme, sections, onSave, onWidth, onSections, onTheme }: Props = $props();

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

<p class="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Theme</p>
<div class="flex gap-2">
	{#each THEME_OPTIONS as t}
		<button
			type="button"
			class="rounded-full border px-3 py-1 text-xs font-medium {theme === t.id ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-700 dark:bg-stone-700' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'}"
			onclick={() => onTheme(t.id)}
		>{t.label}</button>
	{/each}
</div>
<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
	Light or dark, or follow your device setting. Changes apply at once. System follows changes while the app is open.
</p>

<div class="mt-4 border-t border-stone-200 dark:border-stone-800 pt-4">
	<p class="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Entries language</p>
	<div class="mb-4 flex gap-2">
		{#each LANGS as l}
			<button
				type="button"
				class="rounded-full border px-3 py-1 text-xs font-medium {el === l.v ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
				onclick={() => { el = l.v; saved = false; }}
			>{l.label}</button>
		{/each}
	</div>
</div>

<div class="mb-4 flex justify-end">
	<button
		type="button"
		class="rounded-full px-4 py-1.5 text-xs font-medium {saved ? 'bg-emerald-600 text-white' : 'bg-stone-900 dark:bg-stone-700 text-white hover:bg-stone-800 dark:hover:bg-stone-600'}"
		onclick={save}
	>{saved ? 'Saved ✓' : 'Save language'}</button>
</div>

<div class="border-t border-stone-200 dark:border-stone-800 pt-4">
	<p class="text-xs font-medium text-stone-500 dark:text-stone-400">Column width</p>
	<div class="mt-2 flex gap-2">
		{#each CONTENT_WIDTH_OPTIONS as w}
			<button
				type="button"
				class="rounded-full border px-3 py-1 text-xs font-medium {contentWidth === w.id ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
				onclick={() => onWidth(w.id)}
			>{w.label}</button>
		{/each}
	</div>
	<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
		The main column on desktop. The composer bar follows it.
	</p>
</div>

<div class="mt-4 border-t border-stone-200 dark:border-stone-800 pt-4">
	<p class="text-xs font-medium text-stone-500 dark:text-stone-400">Sections</p>
	<ul class="mt-2 space-y-1">
		{#each sections as s, i (s.id)}
			<li animate:flip={{ duration: 200 }} class="flex items-center justify-between gap-2 rounded-xl border border-stone-200 dark:border-stone-800 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300">
				<span class="inline-flex items-center gap-2">{s.label}<span class="rounded border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 px-1.5 py-0.5 font-mono text-[10px] text-stone-400 dark:text-stone-500">G then {i + 1}</span></span>
				<span class="flex gap-1">
					<button
						type="button"
						aria-label="Move {s.label} up"
						disabled={i === 0}
						class="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
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
						class="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
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
	<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
		The order of the section pills. Drag the pills directly works too.
	</p>
</div>
