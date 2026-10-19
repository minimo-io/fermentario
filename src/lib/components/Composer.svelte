<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { createSpeech, browserSupportsSpeech } from '$lib/speech';
	import { showToast } from '$lib/toast.svelte';
	import { splitTrailingHashtags } from '$lib/hashtags';
	import Mic from '@lucide/svelte/icons/mic';
	import Square from '@lucide/svelte/icons/square';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';

	type Props = {
		onNote: (c: string) => void;
		onAsk: (q: string) => void;
		onStop: () => void;
		view: 'notes' | 'ask';
		listening: boolean;
		onListen: (on: boolean) => void;
		question: string;
		onQuestion: (q: string) => void;
		answering: boolean;
		text: string;
		onText: (t: string) => void;
		saving: boolean;
		widthClass?: string;
		lang: string;
		apple?: boolean;
	};
	let {
		onNote, onAsk, onStop,
		view,
		listening, onListen,
		question, onQuestion,
		answering,
		text, onText,
		saving,
		widthClass = 'max-w-2xl',
		lang,
		apple = false
	}: Props = $props();

	let interim = $state('');
	let speech = $state<ReturnType<typeof createSpeech> | null>(null);
	let pendingTags = $derived(view === 'notes' ? splitTrailingHashtags(text).tags : []);
	const focusHint = $derived(apple ? '⇧⌘L' : 'Ctrl+⇧L');
	const listeningLabel = $derived(lang === 'es' ? 'Escuchando…' : lang === 'pt' ? 'A ouvir…' : 'Listening…');
	// Long placeholder text overflows the bar on phones. Shorten it below sm.
	let compact = $state(true);
	onMount(() => {
		const stop = () => {
			speech?.abort();
			speech = null;
			onListen(false);
		};
		if (typeof window === 'undefined' || !('matchMedia' in window)) return stop;
		const mq = window.matchMedia('(max-width: 639px)');
		const apply = () => (compact = mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => {
			mq.removeEventListener('change', apply);
			stop();
		};
	});

	let field = $state<HTMLTextAreaElement | null>(null);
	let bar = $state<HTMLDivElement | null>(null);
	let expanded = $state(false);
	let wideField = $state<HTMLTextAreaElement | null>(null);

	// The overlay is the same controlled input, not a second source of truth:
	// it renders `text`/`question` and reports every keystroke through the
	// same `onText`/`onQuestion` callbacks the bar uses.
	const wideValue = $derived(view === 'notes' ? text : question);
	function onWideInput(v: string) {
		if (view === 'notes') onText(v);
		else onQuestion(v);
	}
	function closeWide() {
		expanded = false;
		field?.focus();
	}

	$effect(() => {
		if (expanded && wideField) {
			wideField.focus();
			wideField.setSelectionRange(wideField.value.length, wideField.value.length);
		}
	});

	const FIELD_CLASS =
		'min-h-11 w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-[15px] leading-snug outline-none max-h-[45dvh]';

	function autosize() {
		if (!field) return;
		field.style.height = 'auto';
		field.style.height = `${field.scrollHeight}px`;
	}

	$effect(() => {
		void text;
		void question;
		autosize();
	});

	$effect(() => {
		void view;
		void field;
		autosize();
	});

	$effect(() => {
		if (!bar || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => {
			document.documentElement.style.setProperty('--composer-h', `${bar?.offsetHeight ?? 0}px`);
		});
		observer.observe(bar);
		return () => observer.disconnect();
	});

	function startListening() {
		if (!browserSupportsSpeech()) {
			showToast('Speech input is not supported in this browser.');
			return;
		}
		speech = createSpeech({
			interim: (t) => { interim = t; },
			final: (t) => { if (view === 'ask') onQuestion(question + t); else onText(text + t); },
			end: () => { speech = null; interim = ''; onListen(false); },
			error: (m) => { speech = null; interim = ''; onListen(false); showToast(m); }
		}, lang);
		speech.start();
		onListen(true);
	}
	function stopListening() {
		speech?.stop();
		speech = null;
		interim = '';
		onListen(false);
	}
	function saveNote() {
		const c = text.trim();
		if (!c) return;
		onNote(c);
		onText('');
		interim = '';
	}
	function submitAsk() {
		const q = question.trim();
		if (!q || answering) return;
		onAsk(q);
		onQuestion('');
	}
</script>

{#snippet micButton()}
	<button
		type="button"
		class="relative rounded-full p-2.5 transition-colors {listening ? 'bg-rose-600 text-white hover:bg-rose-700' : 'text-stone-500 hover:bg-stone-200'}"
		aria-label={listening ? 'Stop dictation' : 'Dictate'}
		aria-pressed={listening}
		onclick={listening ? stopListening : startListening}
	>
		{#if listening}
			<span class="pointer-events-none absolute inset-0 rounded-full ring-2 ring-rose-400 animate-pulse motion-reduce:animate-none"></span>
			<Square class="relative h-4 w-4 fill-current" />
		{:else}
			<Mic class="h-4 w-4" />
		{/if}
	</button>
{/snippet}

<div class="pointer-events-none fixed inset-x-0 bottom-0 z-20">
	<div class="pointer-events-auto mx-auto {widthClass} px-6 pb-8">
		{#if listening}
			<div class="mb-2 flex items-center px-3">
				<span class="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-600 motion-reduce:animate-none"></span>
					{listeningLabel}
				</span>
			</div>
		{/if}
		{#if pendingTags.length > 0}
			<div class="mb-2 flex flex-wrap items-center gap-1 px-3">
				{#each pendingTags as tag (tag)}
					<span class="rounded-full border border-dashed border-stone-300 bg-white/80 px-2 py-0.5 text-[11px] text-stone-500">#{tag}</span>
				{/each}
			</div>
		{/if}
		<div bind:this={bar} class="flex items-end gap-2 rounded-[2rem] border border-stone-200/80 bg-white/95 py-2 pl-3 pr-2 shadow-xl shadow-stone-900/10 sm:py-3 sm:pl-5 sm:pr-3">
			{#if view === 'notes'}
				<textarea
					id="composer-field"
					bind:this={field}
					rows="1"
					aria-label="Note"
					class={FIELD_CLASS}
					value={text}
					oninput={(e) => { onText(e.currentTarget.value); autosize(); }}
					placeholder={interim || (compact ? (lang === 'es' ? 'Di o escribe…' : lang === 'pt' ? 'Diga ou escreva…' : 'Say or type…') : `${lang === 'es' ? 'Di o escribe…' : lang === 'pt' ? 'Diga ou escreva…' : 'Say or type…'} (${focusHint})`)}
					onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(); } }}
				></textarea>
				<div class="flex shrink-0 items-center gap-2">
					<button class="rounded-full p-2.5 text-stone-500 hover:bg-stone-200" aria-label="Write in fullscreen" onclick={() => (expanded = true)}><Maximize2 class="h-4 w-4" /></button>
					{@render micButton()}
					<button class="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white" onclick={saveNote} disabled={!text.trim() || saving}>{saving ? 'Saving…' : 'Save'}</button>
				</div>
			{:else}
				<textarea
					id="composer-field"
					bind:this={field}
					rows="1"
					aria-label="Question"
					class={FIELD_CLASS}
					value={question}
					oninput={(e) => { onQuestion(e.currentTarget.value); autosize(); }}
					placeholder={interim || (compact ? 'Ask…' : `Ask about your notes… (${focusHint})`)}
					onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAsk(); } }}
				></textarea>
				<div class="flex shrink-0 items-center gap-2">
					<button class="rounded-full p-2.5 text-stone-500 hover:bg-stone-200" aria-label="Write in fullscreen" onclick={() => (expanded = true)}><Maximize2 class="h-4 w-4" /></button>
					{@render micButton()}
					{#if answering}
						<button type="button" class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100" onclick={onStop}>
							<Square class="h-3 w-3 fill-current" /> Stop
						</button>
					{:else}
						<button class="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white" onclick={submitAsk} disabled={!question.trim()}>{answering ? '…' : 'Ask'}</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

{#if expanded}
	<div
		class="fixed inset-0 z-40 flex flex-col bg-white"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		aria-label={view === 'notes' ? 'Note editor' : 'Question editor'}
		onkeydown={(e) => { if (e.key === 'Escape') closeWide(); }}
		transition:fade={{ duration: 150 }}
	>
		<div class="mx-auto flex w-full {widthClass} items-center justify-between gap-2 px-6 pt-6">
			<button
				type="button"
				class="rounded-full border border-stone-300 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
				onclick={closeWide}
			>Close</button>
			{#if view === 'notes'}
				<button class="shrink-0 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white" onclick={() => { saveNote(); closeWide(); }} disabled={!text.trim() || saving}>{saving ? 'Saving…' : 'Save'}</button>
			{:else if answering}
				<button type="button" class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100" onclick={onStop}>
					<Square class="h-3 w-3 fill-current" /> Stop
				</button>
			{:else}
				<button class="shrink-0 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white" onclick={() => { submitAsk(); closeWide(); }} disabled={!question.trim()}>Ask</button>
			{/if}
		</div>
		{#if pendingTags.length > 0}
			<div class="mx-auto mt-3 flex w-full {widthClass} flex-wrap items-center gap-1 px-6">
				{#each pendingTags as tag (tag)}
					<span class="rounded-full border border-dashed border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-500">#{tag}</span>
				{/each}
			</div>
		{/if}
		<div class="mx-auto flex w-full {widthClass} flex-1 px-6 pb-6 pt-3">
			<textarea
				bind:this={wideField}
				class="h-full w-full resize-none bg-transparent text-[15px] leading-relaxed text-stone-800 outline-none"
				aria-label={view === 'notes' ? 'Note' : 'Question'}
				value={wideValue}
				oninput={(e) => onWideInput(e.currentTarget.value)}
				placeholder={view === 'notes' ? 'Write…' : 'Ask about your notes…'}
				onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (view === 'notes') { saveNote(); closeWide(); } else if (!answering) { submitAsk(); closeWide(); } } }}
			></textarea>
		</div>
	</div>
{/if}