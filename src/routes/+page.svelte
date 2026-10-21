<script lang="ts">
	import { onMount } from 'svelte';
	import type { Note } from '$lib/types';
	import type { AskEntry, AskSource } from '$lib/types';
	import Composer from '$lib/components/Composer.svelte';
import Settings from '@lucide/svelte/icons/settings';
import SettingsModal from '$lib/components/SettingsModal.svelte';
	import Weekly from '$lib/components/Weekly.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import AskTab from '$lib/components/AskTab.svelte';
	import TodoTab from '$lib/components/TodoTab.svelte';
	import PrinciplesTab from '$lib/components/PrinciplesTab.svelte';
	import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID } from '$lib/chat-models';
	import { isAppleDevice } from '$lib/platform';
	import { splitTrailingHashtags } from '$lib/hashtags';
	import { NotePager } from '$lib/note-pager.svelte';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { tagColors } from '$lib/tag-colors.svelte';
	import { formatNotesForClipboard } from '$lib/note-export';
	import { clearDraft, loadDraft, saveDraft } from '$lib/draft';
	import RestoreOverlay from '$lib/components/RestoreOverlay.svelte';
	import CopyFallback from '$lib/components/CopyFallback.svelte';
	import Copy from '@lucide/svelte/icons/copy';
	import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import { navigating } from '$app/state';
	import SectionBar from '$lib/components/SectionBar.svelte';
	import SectionPlaceholder from '$lib/components/SectionPlaceholder.svelte';
	import { SECTIONS, DEFAULT_SECTION_ORDER, sanitizeSectionOrder, type SectionId, type View } from '$lib/sections';
	import { DEFAULT_CONTENT_WIDTH, contentWidthClass, sanitizeContentWidth } from '$lib/display';
	import { DEFAULT_THEME, applyTheme, sanitizeTheme, type Theme } from '$lib/theme';
	import type { RestorePhase } from '$lib/components/RestoreOverlay.svelte';

	let heatmapLoading = $derived(navigating.to?.url.pathname === '/heatmap');

	let summaryLoading = $state(false);
	let week = $state<string | null>(null);
	let dismissed = $state(true);
	let saving = $state(false);
let showSettings = $state(false);
let settingsTab = $state<'general' | 'models' | 'database'>('general');
type Lang = 'en' | 'es' | 'pt';
type LangConfig = { modelLang: Lang; entriesLang: Lang; chatModel: string; summaryPrompt: string; sections: string[]; contentWidth: string; theme: Theme };
const DEFAULT_CONFIG: LangConfig = { modelLang: 'en', entriesLang: 'en', chatModel: DEFAULT_CHAT_MODEL_ID, summaryPrompt: '', sections: DEFAULT_SECTION_ORDER, contentWidth: DEFAULT_CONTENT_WIDTH, theme: DEFAULT_THEME };
let config = $state<LangConfig>(DEFAULT_CONFIG);
function saveConfig(p: Partial<LangConfig>) {
	config = { ...config, ...p };
	if (p.theme !== undefined) applyTheme(p.theme);
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
	pager.featured = 'exclude';
	let notes = $derived(pager.notes);
	let featured = $state<Note[]>([]);
	let view = $state<View>('notes');
	let lastSection = $state<SectionId>('notes');
	const orderedSections = $derived(
		sanitizeSectionOrder(config.sections)
			.map((id) => SECTIONS.find((s) => s.id === id))
			.filter((s) => s !== undefined)
	);
	/** The composer only knows notes vs ask. Every other section uses note mode. */
	const composerView = $derived(view === 'ask' ? 'ask' : 'notes');
	const contentClass = $derived(contentWidthClass(config.contentWidth));
	function selectSection(id: SectionId) {
		lastSection = id;
		view = id;
	}
	function toggleAsk() {
		if (view === 'ask') view = lastSection;
		else {
			lastSection = view;
			view = 'ask';
		}
	}
	let apple = $state(false);
	onMount(() => {
		apple = isAppleDevice();
	});

	// Section shortcuts are a two-key sequence: `G` then `1…5`, with an
	// 800 ms pending window. Modifier chords are out: Ctrl/⌘ + digits belong
	// to the browser tab bar and collide with macOS screen capture, so a
	// sequence is the safe option here. Ctrl/⌘ + Shift + L still focuses the
	// composer. The hints live in the config Sections list, not on the pills.
	let pendingSectionKey = $state(false);
	let pendingSectionTimer: ReturnType<typeof setTimeout> | undefined;
	function handleViewShortcut(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
		if (e.isComposing) return;
		if (pendingSectionKey) {
			clearTimeout(pendingSectionTimer);
			pendingSectionTimer = undefined;
			pendingSectionKey = false;
			const n = Number(e.key);
			if (!e.metaKey && !e.ctrlKey && !e.altKey && n >= 1 && n <= 5 && orderedSections[n - 1]) {
				selectSection(orderedSections[n - 1].id);
				e.preventDefault();
			}
			return;
		}
		if (e.metaKey || e.ctrlKey) {
			if (!e.shiftKey || e.altKey) return;
			if (showSettings) return;
			if (e.key === 'l' || e.key === 'L') focusComposer();
			return;
		}
		if (!e.shiftKey && !e.altKey && (e.key === 'g' || e.key === 'G')) {
			pendingSectionKey = true;
			pendingSectionTimer = setTimeout(() => (pendingSectionKey = false), 800);
		}
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
	type RestoreCounts = {
		notes: number;
		tags: number;
		recaps: number;
		asks: number;
		todoGroups: number;
		todoItems: number;
		principles: number;
	};

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
		showSettings = false;
		view = 'notes';
		lastSection = 'notes';
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
			await tagColors.reload();
			refreshSummaryAnswer(true, null, true);
			showToast(
				`Journal restored — ${counts?.notes ?? 0} notes, ${counts?.todoItems ?? 0} tasks, ${counts?.principles ?? 0} principles, ${counts?.recaps ?? 0} recaps, ${counts?.asks ?? 0} questions.`,
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
	let listening = $state(false);

	$effect(() => {
		loadNotes();
		void loadFeatured();
		void tagColors.load();
		refreshSummaryAnswer(true, null, false);
		void loadAsks();
		// Restore the unsaved composer text after SPA navigation or a reload.
		const draft = loadDraft();
		text = draft.note;
		question = draft.ask;
		// And the section the user was in, so Back from a detail page lands
		// back in To-Do (or Ask) instead of always on Notes.
		try {
			const v = sessionStorage.getItem('fermentario.view');
			const ids = SECTIONS.map((s) => s.id);
			if (v === 'ask') view = 'ask';
			else if (v && (ids as string[]).includes(v)) {
				lastSection = v as SectionId;
				view = v as SectionId;
			}
		} catch {}
	});

	$effect(() => {
		try {
			sessionStorage.setItem('fermentario.view', view);
		} catch {}
	});

	$effect(() => {
	if (typeof localStorage === 'undefined') return;
	const raw = localStorage.getItem('fermentario.config');
	if (!raw) return;
	try {
		const p = JSON.parse(raw) as Partial<LangConfig>;
		if ((p.modelLang === 'en' || p.modelLang === 'es' || p.modelLang === 'pt') && (p.entriesLang === 'en' || p.entriesLang === 'es' || p.entriesLang === 'pt')) {
			const theme = sanitizeTheme(p.theme);
			config = {
				modelLang: p.modelLang as Lang,
				entriesLang: p.entriesLang as Lang,
				chatModel: typeof p.chatModel === 'string' && CHAT_MODELS.some((m) => m.id === p.chatModel) ? p.chatModel : DEFAULT_CHAT_MODEL_ID,
				summaryPrompt: typeof p.summaryPrompt === 'string' ? p.summaryPrompt : '',
					sections: sanitizeSectionOrder(p.sections),
					contentWidth: sanitizeContentWidth(p.contentWidth),
					theme
			};
			applyTheme(theme);
		}
	} catch {}
});

	async function loadNotes() {
		try {
			await pager.open();
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to load notes.');
		}
	}

	async function loadFeatured() {
		try {
			const d = await (await loading.track(fetch('/api/notes?limit=100&featured=only'))).json();
			featured = Array.isArray(d.notes) ? d.notes : [];
		} catch {
			showToast('Failed to load featured notes.');
		}
	}

	async function handleFeature(n: Note) {
		try {
			const res = await loading.track(fetch(`/api/notes/${n.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ featured: !n.featured })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update note.');
			const saved = d.note as Note;
			if (saved.featured) {
				pager.remove(n.id);
				featured = [saved, ...featured.filter((f) => f.id !== saved.id)];
			} else {
				// Back into the chronological list at the top; the next full
				// load restores the exact position. Never refetch here: that
				// collapses accumulated pages and loses the scroll position.
				featured = featured.filter((f) => f.id !== saved.id);
				pager.prepend(saved);
			}
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to update note.');
		}
	}

	async function loadAsks() {
		try {
			const d = await (await loading.track(fetch('/api/asks'))).json();
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
		lastSection = 'notes';
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
		loading.track(fetch(`/api/notes/${id}`, { method: 'DELETE' }))
			.then((r) => r.json())
			.then(() => {
				pager.remove(id);
				featured = featured.filter((f) => f.id !== id);
				refreshSummaryAnswer(false, null, false);
			})
			.catch((e) => showToast((e as Error)?.message ?? 'Failed to delete note.'));
	}

	async function removeTag(noteId: string, tag: string) {
		try {
			const res = await loading.track(fetch(
				`/api/notes/${noteId}/tags/${encodeURIComponent(tag)}`,
				{ method: 'DELETE' }
			));
			if (!res.ok) throw new Error('Failed to remove the tag.');
			const note = notes.find((n) => n.id === noteId);
			if (!note) return;
			// Always patch, even when no tags remain. Removing the row is the
			// tag page's behavior (the note no longer matches its filter);
			// on the timeline the note stays with an empty tag list.
			pager.patch({ ...note, tags: (note.tags ?? []).filter((t) => t !== tag) });
			featured = featured.map((f) =>
				f.id === noteId ? { ...f, tags: (f.tags ?? []).filter((t) => t !== tag) } : f
			);
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to remove the tag.');
		}
	}

	async function handleEdit(id: string, content: string, video?: string) {
		const body: { content: string; video?: string } = { content };
		if (video !== undefined) body.video = video;
		const res = await loading.track(fetch(`/api/notes/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}));
		const d = await res.json();
		if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
		pager.patch(d.note as Note);
		featured = featured.map((f) => (f.id === (d.note as Note).id ? (d.note as Note) : f));
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
	<title>fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-2 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(var(--composer-h,4.5rem)+2.5rem)] sm:px-6">
		<header class="mb-5">
			<div class="flex flex-wrap items-center gap-2">
				<a href="/heatmap" aria-disabled={heatmapLoading} aria-busy={heatmapLoading} class="inline-flex items-center gap-1 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 {heatmapLoading ? 'pointer-events-none opacity-40' : ''}">{#if heatmapLoading}<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{:else}<Grid3x3 class="h-3.5 w-3.5" />{/if} Heatmap</a>
				<span class="ml-auto inline-flex items-center gap-2">
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded-full bg-stone-900 dark:bg-stone-700 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
						aria-label={view === 'ask' ? 'Close Ask' : 'Ask the archive'}
						onclick={toggleAsk}
					>{#if view === 'ask'}<span aria-hidden="true">×</span> Close{:else}<MessageCircle class="h-3.5 w-3.5" /> Ask{/if}</button>
					<button
						type="button"
						class="grid h-7 w-7 place-items-center rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						aria-label="Settings"
						onclick={() => (showSettings = true)}
					><Settings class="h-3.5 w-3.5" /></button>
				</span>
			</div>
		</header>

		<div class="mb-4" role="tablist" aria-label="Views">
			<SectionBar
				sections={orderedSections}
				active={view === 'ask' ? lastSection : view}
				onSelect={selectSection}
				onReorder={(ids) => saveConfig({ sections: ids })}
			/>
		</div>

		{#if view === 'notes'}
			{#if week && !dismissed}
				<section class="mt-5 mb-5">
					<Weekly {summaryLoading} {week} {reading} onRead={readWeekly} onDismiss={dismissWeekly} />
				</section>
			{/if}

			{#if featured.length > 0}
				<section class="mt-5 mb-5" aria-label="Featured notes">
					<Timeline
						notes={featured}
						{summaryLoading}
						onDelete={handleDelete}
						onEdit={handleEdit}
						onFeature={handleFeature}
						onLoadMore={() => pager.loadMore()}
						hasMore={false}
						loadingMore={false}
						onRemoveTag={removeTag}
						lang={config.entriesLang}
					/>
				</section>
			{/if}

			<section>
				<div class="mb-2 flex items-center justify-between gap-2 px-1">
					<span class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{notes.length} notes loaded</span>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
						disabled={notes.length === 0}
						onclick={copyLoadedNotes}
					><Copy class="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy all'}</button>
				</div>
				<Timeline
				notes={notes}
				{summaryLoading}
				onDelete={handleDelete}
				onEdit={handleEdit}
				onFeature={handleFeature}
				onLoadMore={() => pager.loadMore()}
				hasMore={pager.hasMore}
				loadingMore={pager.loading}
				onRemoveTag={removeTag}
				lang={config.entriesLang}
			/>
			</section>
		{:else if view === 'ask'}
			<AskTab
				{asks}
				{lastQuestion}
				{answer}
				{answerSources}
				{answering}
				{answerStopped}
				onDelete={handleDeleteAsk}
			/>
		{:else if view === 'todo'}
			<TodoTab onError={(m) => showToast(m)} lang={config.entriesLang} widthClass={contentClass} />
		{:else if view === 'principles'}
			<PrinciplesTab onError={(m) => showToast(m)} widthClass={contentClass} />
		{:else}
			<SectionPlaceholder label={SECTIONS.find((s) => s.id === view)?.label ?? view} />
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

		{#if view === 'notes' || view === 'ask'}
		<Composer
			onNote={handleNote}
			onAsk={handleAsk}
			onStop={stopAsk}
			view={composerView}
			{listening} onListen={onListenIm}
			{question} onQuestion={onQuestionIm}
			{answering}
			{text} onText={onTextIm}
			{saving}
			lang={config.entriesLang}
			{apple}
			widthClass={contentClass}
		/>
		{/if}

		{#if showSettings}
			<SettingsModal
				modelLang={config.modelLang}
				entriesLang={config.entriesLang}
				contentWidth={sanitizeContentWidth(config.contentWidth)}
				sections={orderedSections}
				theme={config.theme}
				{summaryLoading}
				{week}
				tab={settingsTab}
				onTab={(t) => (settingsTab = t)}
				onClose={() => (showSettings = false)}
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
				onSaveLanguages={(p) => saveConfig(p)}
				onModelLang={(v) => saveConfig({ modelLang: v })}
				onWidth={(w) => saveConfig({ contentWidth: w })}
				onSections={(ids) => saveConfig({ sections: ids })}
				onTheme={(t) => saveConfig({ theme: t })}
				onRestoreStart={runRestore}
			/>
		{/if}
	</div>
</main>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { showSettings = false; } handleViewShortcut(e); }} />
