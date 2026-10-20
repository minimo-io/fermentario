<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import type { ChatModelOption } from '$lib/chat-models';
	import type { ContentWidth } from '$lib/display';
	import type { Theme } from '$lib/theme';
	import LanguagePanel from '$lib/components/LanguagePanel.svelte';
	import ModelsPanel from '$lib/components/ModelsPanel.svelte';
	import DatabasePanel from '$lib/components/DatabasePanel.svelte';

	type Lang = 'en' | 'es' | 'pt';
	type Tab = 'general' | 'models' | 'database';

	type Props = {
		modelLang: Lang;
		entriesLang: Lang;
		contentWidth: ContentWidth;
		theme: Theme;
		sections: { id: string; label: string }[];
		summaryLoading: boolean;
		week: string | null;
		model: string;
		models: ChatModelOption[];
		prompt: string;
		tab: Tab;
		onTab: (t: Tab) => void;
		onClose: () => void;
		onRerun: () => void;
		onModelChange: (id: string) => void;
		onPromptChange: (value: string) => void;
		onSaveLanguages: (p: { entriesLang: Lang }) => void;
		onModelLang: (lang: Lang) => void;
		onWidth: (w: ContentWidth) => void;
		onSections: (ids: string[]) => void;
		onTheme: (t: Theme) => void;
		onRestoreStart: (file: File) => void;
	};
	let {
		modelLang, entriesLang, contentWidth, theme, sections,
		summaryLoading, week, model, models, prompt, tab,
		onTab, onClose, onRerun, onModelChange, onModelLang, onPromptChange,
		onSaveLanguages, onWidth, onSections, onTheme, onRestoreStart
	}: Props = $props();

	const TABS: { id: Tab; label: string }[] = [
		{ id: 'general', label: 'General' },
		{ id: 'models', label: 'Models' },
		{ id: 'database', label: 'Database' }
	];

	// The tabs differ in height. Auto height cannot transition, so the
	// measured pixel height drives a CSS height transition on every switch.
	let bodyEl = $state<HTMLDivElement | null>(null);
	let bodyH = $state<number | null>(null);
	$effect(() => {
		void tab;
		if (bodyEl) bodyH = bodyEl.scrollHeight;
	});
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-900/40 dark:bg-black/60 p-4"
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Settings</h2>
			<button class="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300" aria-label="Close" onclick={onClose}>&times;</button>
		</div>

		<div class="mb-4 inline-flex items-center rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-0.5 shadow-sm" role="tablist" aria-label="Settings">
			{#each TABS as t (t.id)}
				<button
					role="tab"
					aria-selected={tab === t.id}
					class="rounded-full px-4 py-1.5 text-sm font-medium {tab === t.id ? 'bg-stone-900 dark:bg-stone-700 text-white' : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'}"
					onclick={() => onTab(t.id)}
				>{t.label}</button>
			{/each}
		</div>

		<div
			class="overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none"
			style={bodyH !== null ? `height: ${bodyH}px` : ''}
		>
			<div bind:this={bodyEl}>
				{#if tab === 'general'}
					<LanguagePanel {entriesLang} {contentWidth} {theme} {sections} onSave={onSaveLanguages} {onWidth} {onSections} {onTheme} />
				{:else if tab === 'models'}
					<ModelsPanel {summaryLoading} {week} {model} {models} {modelLang} {prompt} {onRerun} {onModelChange} {onModelLang} {onPromptChange} />
				{:else}
					<DatabasePanel {onRestoreStart} />
				{/if}
			</div>
		</div>
	</div>
</div>
