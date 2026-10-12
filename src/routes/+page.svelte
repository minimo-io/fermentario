<script lang="ts">
	import { onMount } from 'svelte';
	import type { Note } from '$lib/types';
	import type { AskEntry, AskSource } from '$lib/types';
	import Composer from '$lib/components/Composer.svelte';
import ConfigModal from '$lib/components/ConfigModal.svelte';
import Settings from '@lucide/svelte/icons/settings';
import ModelsModal from '$lib/components/ModelsModal.svelte';
	import Weekly from '$lib/components/Weekly.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import AskTab from '$lib/components/AskTab.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID } from '$lib/chat-models';
	import { isAppleDevice } from '$lib/platform';
	import { splitTrailingHashtags } from '$lib/hashtags';
	import { NotePager } from '$lib/note-pager.svelte';
	import { formatNotesForClipboard } from '$lib/note-export';
	import { clearDraft, loadDraft, saveDraft } from '$lib/draft';
	import RestoreOverlay from '$lib/components/RestoreOverlay.svelte';
	import CopyFallback from '$lib/components/CopyFallback.svelte';
	import Copy from '@lucide/svelte/icons/copy';
	import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
	import type { RestorePhase } from '$lib/components/RestoreOverlay.svelte';

	let summaryLoading = $state(false);
	let week = $state<string | null>(null);
	let dismissed = $state(true);
	let saving = $state(false);
let showModels = $state(false);
let showConfig = $state(false);
type Lang = 'en' | 'es' | 'pt';
type LangConfig = { modelLang: Lang; entriesLang: Lang; chatModel: string; summaryPrompt: string };
const DEFAULT_CONFIG: LangConfig = { modelLang: 'en', entriesLang: 'en', chatModel: DEFAULT_CHAT_MODEL_ID, summaryPrompt: '' };
let config = $state<LangConfig>(DEFAULT_CONFIG);
function saveConfig(p: Partial<LangConfig>) {
	config = { ...config, ...p };
	if (typeof localStorage !== 'undefined') localStorage.setItem('fermentario.config', JSON.stringify(config));
}
function langTag(p: Lang): string {
	return p === 'es' ? 'es-ES' : p === 'pt' ? 'pt-PT' : 'en-US';
}
	let reading = $state(false);
	let utterance: SpeechSynthesisUtterance | null = null;
	let summaryTimer: ReturnType<typeof setTimeout>;

	const NO_STATE = new Set(['', 'dismissed']);
	let weekLoading = $state(false);
	let weekErr = '';
	let question = $state('');
	let answering = $state(false);
	let answerStopped = $state(false);
	let askAbort: AbortController | null = null;
	let answer = $state('');
	let answerSources = $state<AskSource[]>([]);
	let lastQuestion = $state('');
	let asks = $state<AskEntry[]>([]);
	const pager = new NotePager();
	let notes = $derived(pager.notes);
	let view = $state<'notes' | 'ask'>('notes');
	let apple = $state(false);
	onMount(() => {
		apple = isAppleDevice();
	});

	// Ctrl/⌘ + Shift + 1 / 2 and Ctrl/⌘ + Shift + L. The Shift is required:
	// every browser binds Ctrl/⌘ + 1…8 to its own tab bar and Ctrl/⌘ + L to the
	// address bar, so the plain chords never reach the page. AltGr on Windows
	// reports Ctrl+Alt, hence the altKey guard.
	function handleViewShortcut(e: KeyboardEvent) {
		if (!e.shiftKey || e.altKey || e.isComposing) return;
		if (apple ? !e.metaKey : !e.ctrlKey) return;
		if (showModels || showConfig) return;
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
		if (e.key === '1') view = 'notes';
		else if (e.key === '2') view = 'ask';
		else if (e.key === 'l' || e.key === 'L') focusComposer();
	}

	function focusComposer() {
		const el = document.getElementById('composer-field');
		if (!(el instanceof HTMLTextAreaElement)) return;
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
	}

	let restoreName = $state('');
	let restorePhase = $state<RestorePhase | null>(null);
	let restoreError = $state('');
	let restoreElapsed = $state(0);
	let restoreTimer: ReturnType<typeof setInterval> | undefined;
	type RestoreCounts = { notes: number; tags: number; recaps: number; asks: number };

	function closeRestore() {
		restorePhase = null;
		restoreError = '';
		restoreName = '';
	}

	let copied = $state(false);
	let copyText = $state<string | null>(null);

	async function copyLoadedNotes() {
		const text = formatNotesForClipboard(notes, config.entriesLang);
		if (!text) return;
		try {
			if (!navigator.clipboard) throw new Error('clipboard unavailable');
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Plain-HTTP origins have no navigator.clipboard: show the text.
			copyText = text;
		}
	}

	async function runRestore(file: File) {
		showConfig = false;
		view = 'notes';
		restoreName = file.name;
		restoreError = '';
		restorePhase = 'uploading';
		const started = Date.now();
		restoreElapsed = 0;
		restoreTimer = setInterval(() => (restoreElapsed = Math.floor((Date.now() - started) / 1000)), 1000);
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch('/api/import', { method: 'POST', body });
			if (!res.body) throw new Error('The server did not answer.');
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let counts: RestoreCounts | null = null;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';
				for (const e of events) {
					for (const line of e.split('\n')) {
						if (!line.startsWith('data: ')) continue;
						const d = JSON.parse(line.slice(6)) as {
							phase?: RestorePhase;
							error?: string;
							done?: boolean;
							counts?: RestoreCounts;
						};
						if (d.phase) restorePhase = d.phase;
						else if (d.error) throw new Error(String(d.error));
						else if (d.done) {
							restorePhase = 'done';
							counts = d.counts ?? null;
						}
					}
				}
			}
			await pager.open();
			await loadAsks();
			refreshSummaryAnswer(true, null, true);
			showToast(
				`Journal restored — ${counts?.notes ?? 0} notes, ${counts?.tags ?? 0} tags, ${counts?.recaps ?? 0} recaps, ${counts?.asks ?? 0} questions.`,
				'success'
			);
			setTimeout(closeRestore, 2500);
		} catch (e) {
			restoreError = (e as Error)?.message ?? 'Restore failed.';
		} finally {
			clearInterval(restoreTimer);
			restoreTimer = undefined;
		}
	}
	let text = $state('');
	let toast = $state<{ text: string; tone: 'error' | 'success' } | null>(null);
	function showToast(text: string, tone: 'error' | 'success' = 'error') {
		toast = { text, tone };
	}
	let listening = $state(false);
	let micErr = $state('');
	// voice-entry
	let speech = $state<{ stop: () => void; abort: () => void } | null>(null);
	let interim = $state('');
	// timeline
	let notesLoading = $state(false);

	$effect(() => {
		loadNotes();
		refreshSummaryAnswer(true, null, false);
		void loadAsks();
		// Restore the unsaved composer text after SPA navigation or a reload.
		const draft = loadDraft();
		text = draft.note;
		question = draft.ask;
	});

	$effect(() => {
	if (typeof localStorage === 'undefined') return;
	const raw = localStorage.getItem('fermentario.config');
	if (!raw) return;
	try {
		const p = JSON.parse(raw) as Partial<LangConfig>;
		if ((p.modelLang === 'en' || p.modelLang === 'es' || p.modelLang === 'pt') && (p.entriesLang === 'en' || p.entriesLang === 'es' || p.entriesLang === 'pt')) {
			config = {
				modelLang: p.modelLang as Lang,
				entriesLang: p.entriesLang as Lang,
				chatModel: typeof p.chatModel === 'string' && CHAT_MODELS.some((m) => m.id === p.chatModel) ? p.chatModel : DEFAULT_CHAT_MODEL_ID,
				summaryPrompt: typeof p.summaryPrompt === 'string' ? p.summaryPrompt : ''
			};
		}
	} catch {}
});

	$effect(() => {
		if (!toast) return;
		const timer = setTimeout(() => (toast = null), toast.tone === 'success' ? 8000 : 4000);
		return () => clearTimeout(timer);
	});

	async function loadNotes() {
		try {
			await pager.open();
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to load notes.');
		}
	}

	async function loadAsks() {
		try {
			const d = await (await fetch('/api/asks')).json();
			asks = Array.isArray(d.asks) ? d.asks : [];
		} catch {}
	}

	function refreshSummaryAnswer(force: boolean, keepAnswer: string | null, withLoading: boolean) {clearTimeout(summaryTimer);
		if (withLoading) summaryLoading = true;
		summaryTimer = setTimeout(async () => {
			const started = performance.now();
			const custom = config.summaryPrompt.trim();
			try {
				const d = await (await fetch('/api/summary?' + (force ? 'rf=1&' : '') + 'lang=' + config.modelLang + '&model=' + config.chatModel + (custom ? '&prompt=' + encodeURIComponent(custom) : ''), { headers: {} })).json();
				const rest = withLoading ? Math.max(0, 900 - (performance.now() - started)) : 0;
				if (rest > 0) await new Promise((r) => setTimeout(r, rest));
				week = d.exists ? d.week : null;
				if (withLoading && d.exists) dismissed = false;
			} catch {
				// fall through to finally
			} finally {
				summaryLoading = false;
				weekLoading = false;
			}
		}, force ? 0 : 500);
	}

	function readWeekly() {
		if (!week || reading || reading) return;
		reading = true;
		utterance = new SpeechSynthesisUtterance(week);
		utterance.rate = 0.95;
		utterance.lang = langTag(config.modelLang);
		utterance.onend = () => (reading = false);
		window.speechSynthesis.speak(utterance);
	}
	function dismissWeekly() {
		dismissed = true;
		reading = false;
		window.speechSynthesis.cancel();
	}

	function handleNote(cd: string) {
		if (!cd.trim() || NO_STATE.has(cd)) return;
		view = 'notes';
		saving = true;
		const { content, tags } = splitTrailingHashtags(cd);
		if (!content) {
			saving = false;
			showToast('A note needs text before the hashtags.');
			return;
		}
		const now = Date.now();
		const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		pager.prepend({ id: tempId, content, created_at: now, updated_at: now, tags, pending: true });
		fetch('/api/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content: cd })
		})
			.then(async (r) => {
				const d = await r.json();
				if (!r.ok) throw new Error(d?.error ?? 'Failed to save note.');
				const saved: Note = d.note;
				// The card is still listed under the temp id, so it must be
				// swapped, not patched by the server id.
				pager.replace(tempId, saved);
				clearDraft();
				refreshSummaryAnswer(false, null, false);
				setTimeout(() => {
					if (!notes.some((n) => n.pending)) void pager.sync().catch(() => {});
				}, 4000);
			})
			.catch((e) => {
				pager.remove(tempId);
				text = cd;
				showToast((e as Error)?.message ?? 'Failed to save note.');
			})
			.finally(() => (saving = false));
	}

	function handleDelete(id: string) {
		fetch(`/api/notes/${id}`, { method: 'DELETE' })
			.then((r) => r.json())
			.then(() => {
				pager.remove(id);
				refreshSummaryAnswer(false, null, false);
			})
			.catch((e) => showToast((e as Error)?.message ?? 'Failed to delete note.'));
	}

	async function removeTag(noteId: string, tag: string) {
		try {
			const res = await fetch(
				`/api/notes/${noteId}/tags/${encodeURIComponent(tag)}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) throw new Error('Failed to remove the tag.');
			const note = notes.find((n) => n.id === noteId);
			const rest = (note?.tags ?? []).filter((t) => t !== tag);
			if (rest.length > 0 && note) pager.patch({ ...note, tags: rest });
			else pager.remove(noteId);
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to remove the tag.');
		}
	}

	async function handleEdit(id: string, content: string) {
		const res = await fetch(`/api/notes/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content })
		});
		const d = await res.json();
		if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
		pager.patch(d.note as Note);
		refreshSummaryAnswer(false, null, false);
	}

	async function handleAsk(q: string) {
		if (!q.trim()) return;
		view = 'ask';
		answering = true;
		answerStopped = false;
		lastQuestion = q;
		answer = '';
		answerSources = [];
		const controller = new AbortController();
		askAbort = controller;
		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ question: q, history: [] }),
				signal: controller.signal
			});
			if (!res.ok || !res.body) throw new Error(`Ask failed (HTTP ${res.status})`);
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';
				for (const e of events) {
					for (const line of e.split('\n')) {
						if (!line.startsWith('data: ')) continue;
					const data = JSON.parse(line.slice(6)) as { t?: string; error?: string; done?: boolean; full?: string; entryId?: string; sources?: AskSource[] };
					if (data.t) answer += data.t;
					else if (data.error) throw new Error(String(data.error));
					else if (data.done) {
						if (data.sources) answerSources = data.sources;
						const finalText = (data.full ?? answer).trim();
						if (data.entryId && finalText) {
							// Newest first, like the notes timeline.
							asks = [{
								id: data.entryId,
								question: q,
								answer: finalText,
								sources: data.sources ?? [],
								created_at: Date.now()
							} as AskEntry, ...asks];
							// The saved card is now the single source of truth. Leaving
							// `answer` set would render the same Q&A twice: once from
							// `asks` and once from the live block.
							answer = '';
							answerSources = [];
							lastQuestion = '';
							clearDraft();
						} else {
							// Nothing was persisted, so keep the live card visible.
							answer = finalText;
						}
					}
					}
				}
			}
		} catch (e) {
			if (answerStopped) return;
			console.error('Ask failed:', e);
			answer = 'Something went wrong asking the archive.';
		} finally {
			answering = false;
			askAbort = null;
		}
	}

	function stopAsk() {
		if (!askAbort) return;
		answerStopped = true;
		answering = false;
		askAbort.abort();
		askAbort = null;
	}

	async function handleDeleteAsk(id: string) {
		asks = asks.filter((a) => a.id !== id);
		try {
			await fetch(`/api/asks/${encodeURIComponent(id)}`, { method: 'DELETE' });
		} catch {}
	}

	function onListenIm(on: boolean) {
		listening = on;
	}

	$effect(() => {
		void sessionStorage;
	});

	function handleAskWeeklyRead() {
		if (week && !reading) readWeekly();
		else dismissWeekly();
	}

	// ensure fallback placeholder fns round out props
	function onQuestionIm(q2: string) {
		question = q2;
		saveDraft({ note: text, ask: q2 });
	}
	function onTextIm(t2: string) {
		text = t2;
		saveDraft({ note: t2, ask: question });
	}
</script>

<svelte:head>
	<meta name="color-scheme" content="light" />
	<title>fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto max-w-2xl px-6 pt-14 pb-[calc(var(--composer-h,4.5rem)+2.5rem)]">		<header class="mb-5">
			<p class="mt-1 text-sm text-stone-500">your voice journal — life &amp; the bootstrapped thing.</p>
			<div class="mt-4 flex flex-wrap items-center gap-2">
				{#if week && dismissed}
					<button class="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100" onclick={() => (dismissed = false)}>Weekly recap &#9662;</button>
				{/if}
				<button class="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100" onclick={() => (showModels = !showModels)}>{showModels ? 'Models &#9650;' : 'Models'}</button>
				<button class="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100" onclick={() => (showConfig = !showConfig)}><Settings class="h-3.5 w-3.5" /> Config</button>
				<a href="/heatmap" class="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"><Grid3x3 class="h-3.5 w-3.5" /> Heatmap</a>
			</div>
		</header>

		<div class="mb-4 inline-flex items-center rounded-full border border-stone-200 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Views">
			<button
				role="tab"
				aria-selected={view === 'notes'}
				aria-keyshortcuts={apple ? 'Meta+Shift+1' : 'Control+Shift+1'}
				class="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium {view === 'notes' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}"
				onclick={() => (view = 'notes')}
			>
				Notes<Kbd keys={apple ? ['⌘', '⇧', '1'] : ['Ctrl', '⇧', '1']} tone={view === 'notes' ? 'dark' : 'light'} />
			</button>
			<button
				role="tab"
				aria-selected={view === 'ask'}
				aria-keyshortcuts={apple ? 'Meta+Shift+2' : 'Control+Shift+2'}
				class="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium {view === 'ask' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}"
				onclick={() => (view = 'ask')}
			>
				Ask<Kbd keys={apple ? ['⌘', '⇧', '2'] : ['Ctrl', '⇧', '2']} tone={view === 'ask' ? 'dark' : 'light'} />
			</button>
		</div>

		{#if view === 'notes'}
			{#if week && !dismissed}
				<section class="mt-5 mb-5">
					<Weekly {summaryLoading} {week} {reading} onRead={readWeekly} onDismiss={dismissWeekly} />
				</section>
			{/if}

			<section>
				<div class="mb-2 flex items-center justify-between gap-2 px-1">
					<span class="text-[11px] tabular-nums text-stone-400">{notes.length} notes loaded</span>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-medium text-stone-500 hover:bg-stone-100 disabled:opacity-40"
						disabled={notes.length === 0}
						onclick={copyLoadedNotes}
					><Copy class="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy all'}</button>
				</div>
				<Timeline
				notes={notes}
				{summaryLoading}
				onDelete={handleDelete}
				onEdit={handleEdit}
				onLoadMore={() => pager.loadMore()}
				hasMore={pager.hasMore}
				loadingMore={pager.loading}
				onRemoveTag={removeTag}
				lang={config.entriesLang}
			/>
			</section>
		{:else}
			<AskTab
				{asks}
				{lastQuestion}
				{answer}
				{answerSources}
				{answering}
				{answerStopped}
				onDelete={handleDeleteAsk}
			/>
		{/if}

		{#if copyText !== null}
			<CopyFallback text={copyText} onClose={() => (copyText = null)} />
		{/if}

		{#if restorePhase}
			<RestoreOverlay
				fileName={restoreName}
				phase={restorePhase}
				elapsed={restoreElapsed}
				error={restoreError}
				onClose={closeRestore}
			/>
		{/if}

		{#if toast}
			<div class="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-6">
				<p class="rounded-full px-4 py-1.5 text-xs shadow-sm {toast.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}">{toast.text}</p>
			</div>
		{/if}

		<Composer
			onNote={handleNote}
			onAsk={handleAsk}
			onStop={stopAsk}
			{view}
			{listening} onListen={onListenIm}
			{micErr}
			{question} onQuestion={onQuestionIm}
			{answering}
			{text} onText={onTextIm}
			{saving}
			lang={config.entriesLang}
			{apple}
		/>

		{#if showModels}
			<ModelsModal
				{summaryLoading}
				{week}
				onClose={() => (showModels = false)}
				onRerun={() => { void refreshSummaryAnswer(true, null, true); }}
				model={config.chatModel}
				models={CHAT_MODELS}
				prompt={config.summaryPrompt}
				onPromptChange={(value) => saveConfig({ summaryPrompt: value })}
				onModelChange={(id) => {
					saveConfig({ chatModel: id });
					void fetch('/api/status', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ kind: 'chatModel', id })
					});
				}}
			/>
		{/if}
		{#if showConfig}
			<ConfigModal {config} onClose={() => (showConfig = false)} onSave={saveConfig} onRestoreStart={runRestore} />
		{/if}
	</div>
</main>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { showModels = false; showConfig = false; } handleViewShortcut(e); }} />
