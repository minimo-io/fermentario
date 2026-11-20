<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { setContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';
	import type { Note } from '$lib/types';
	import type { AskEntry, AskSource } from '$lib/types';
	import Composer from '$lib/components/Composer.svelte';
	import Settings from '@lucide/svelte/icons/settings';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID } from '$lib/chat-models';
	import { isAppleDevice } from '$lib/platform';
	import { splitHashtags } from '$lib/hashtags';
	import { NotePager } from '$lib/note-pager.svelte';
	import { loading } from '$lib/loading.svelte';
	import { nostrAccount } from '$lib/nostr.svelte';
	import { nostrBackup } from '$lib/nostr-backup.svelte';
	import { miniApps } from '$lib/mini-apps.svelte';
	import { timeTracker } from '$lib/time-tracker.svelte';
	import TimeTrackerBar from '$lib/components/TimeTrackerBar.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { invalidateTagChoices } from '$lib/tag-suggest';
	import { tagColors } from '$lib/tag-colors.svelte';
	import { clearDraft, loadDraft, saveDraft } from '$lib/draft';
	import RestoreOverlay from '$lib/components/RestoreOverlay.svelte';
	import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
	import House from '@lucide/svelte/icons/house';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Search from '@lucide/svelte/icons/search';
	import Tags from '@lucide/svelte/icons/tags';
	import { search } from '$lib/search.svelte';
	import SectionBar from '$lib/components/SectionBar.svelte';
	import HoldingsCarousel from '$lib/components/HoldingsCarousel.svelte';
	import MarketCard from '$lib/components/MarketCard.svelte';
	import TradingStrip from '$lib/components/TradingStrip.svelte';
	import { tradingStrip } from '$lib/trading-strip.svelte';
	import { fmtCurrency } from '$lib/currency';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { Holding, HoldingAction, HoldingsSummary, HoldingCategory } from '$lib/types';
	import { SECTIONS, FIXED_SECTIONS, DEFAULT_SECTION_ORDER, sanitizeSectionOrder, type SectionId, type View } from '$lib/sections';
	import { DEFAULT_CONTENT_WIDTH, contentWidthClass, sanitizeContentWidth } from '$lib/display';
	import { DEFAULT_THEME, applyTheme, sanitizeTheme, type Theme } from '$lib/theme';
	import type { RestorePhase } from '$lib/components/RestoreOverlay.svelte';

	// The market rail belongs to the section views. Heatmaps, tags, a single
	// note or task, Ask and Diagnostics open without investment numbers.
	const MARKET_SECTIONS = new Set([
		'/admin/notes',
		'/admin/todo',
		'/admin/library',
		'/admin/principles',
		'/admin/influences',
		'/admin/stocks',
		'/admin/businesses/cubiq'
	]);
	const showMarket = $derived(
		MARKET_SECTIONS.has(page.url.pathname) || page.url.pathname.startsWith('/admin/businesses/trading')
	);

	let heatmapLoading = $derived(navigating.to?.url.pathname === '/admin/heatmap');
	let tagsLoading = $derived(navigating.to?.url.pathname === '/admin/tags');

	let summaryLoading = $state(false);
	let week = $state<string | null>(null);
	let dismissed = $state(true);
	let saving = $state(false);
let showSettings = $state(false);
let settingsTab = $state<'general' | 'models' | 'trading' | 'nostr' | 'database'>('general');
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
	let summaryEpoch = 0;

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
	/** The Published pill limits the timeline to published notes. */
	let publishedOnly = $state(false);
	async function togglePublished() {
		publishedOnly = !publishedOnly;
		pager.published = publishedOnly ? 'only' : null;		try {
			await pager.open();
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to load notes.');
		}
	}
	let featured = $state<Note[]>([]);
	type Props = { children: Snippet };
	let { children }: Props = $props();

	/** The EPUB reader owns the whole viewport: no shell, no composer, no
	 *  header. The route stays under /admin; only the chrome opts out. */
	const bareReader = $derived(page.url.pathname.startsWith('/admin/book/'));

	let lastSection = $state<SectionId>('notes');
	/** The URL is the section: no view state, no sessionStorage to restore.
	 *  A route that is not a section (for example /admin/diagnostics) must
	 *  return null instead of falling back to Notes: a false
	 *  fallback selects the Notes pill and shows its composer on another page. */
	const section = $derived.by((): View | null => {
		const parts = page.url.pathname.split('/');
		const seg = (parts[1] === 'admin' ? (parts[2] ?? '') : (parts[1] ?? '')).toLowerCase();
		if (seg === 'ask') return 'ask';
		const ids = SECTIONS.map((s) => s.id);
		return (ids as string[]).includes(seg) ? (seg as SectionId) : null;
	});
	$effect(() => {
		if (section !== 'ask' && section !== null) lastSection = section;
	});
	const orderedSections = $derived(
		sanitizeSectionOrder(config.sections)
			.map((id) => SECTIONS.find((s) => s.id === id))
			.filter((s) => s !== undefined)
	);
	const fixedSections = $derived(
		FIXED_SECTIONS.map((id) => SECTIONS.find((s) => s.id === id)).filter((s) => s !== undefined)
	);
	/** The composer only knows notes vs ask. Every other section uses note mode. */
	const composerView = $derived(section === 'ask' ? 'ask' : 'notes');
	const contentClass = $derived(contentWidthClass(config.contentWidth));
	function selectSection(id: SectionId) {
		void goto(`/admin/${id}`);
	}
	function toggleAsk() {
		if (section === 'ask') void goto(`/admin/${lastSection}`);
		else {
			if (section) lastSection = section;
			void goto('/admin/ask');
		}
	}
	let apple = $state(false);
	onMount(() => {
		apple = isAppleDevice();
		// The global New note command can fire from any page. When the notes
		// timeline is mounted, put the saved row in place without a reload.
		const onNoteCreated = (e: Event) => {
			const note = (e as CustomEvent<Note>).detail;
			if (!note || page.url.pathname !== '/admin/notes') return;
			if (pager.notes.some((n) => n.id === note.id)) return;
			pager.insertSorted(note);
		};
		window.addEventListener('notes:created', onNoteCreated);
		return () => window.removeEventListener('notes:created', onNoteCreated);
	});

	// Section shortcuts are a two-key sequence: `G` then `1…5`, with an
	// 800 ms pending window. Modifier chords are out: Ctrl/⌘ + digits belong
	// to the browser tab bar and collide with macOS screen capture, so a
	// sequence is the safe option here. Ctrl/⌘ + Shift + L still focuses the
	// composer. The hints live in the config Sections list, not on the pills.
	let pendingSectionKey = $state(false);
	let pendingSectionTimer: ReturnType<typeof setTimeout> | undefined;
	function handleViewShortcut(e: KeyboardEvent) {
		if (search.open) return;
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
		holdings: number;
		goals: number;
		stocks: number;
		books: number;
	};

	function closeRestore() {
		restorePhase = null;
		restoreError = '';
		restoreName = '';
	}

	// Temporary overflow hunt: `?debug=overflow` outlines every element
	// sticking out of the viewport and lists it below. Removed once the
	// trading-view shift is identified.
	let overflowHits = $state<string[]>([]);
	let overflowOn = $state(false);

	$effect(() => {
		let first: ReturnType<typeof setTimeout> | undefined;
		let timer: ReturnType<typeof setInterval> | undefined;
		try {
			if (new URLSearchParams(window.location.search).get('debug') !== 'overflow') return;
			overflowOn = true;
			const scan = () => {
				const vw = window.innerWidth;
				const hits = [`viewport ${vw}px — red = wider than this`];
				document.querySelectorAll('main *').forEach((node) => {
					if (!(node instanceof HTMLElement)) return;
					const r = node.getBoundingClientRect();
					if (r.right > vw + 1 || r.left < -1) {
						node.style.outline = '2px solid red';
						const cls = typeof node.className === 'string' ? node.className.split(/\s+/).slice(0, 4).join('.') : '';
						hits.push(`${node.tagName.toLowerCase()}${cls ? '.' + cls : ''} w=${Math.round(r.width)} l=${Math.round(r.left)} r=${Math.round(r.right)}`);
					}
				});
				overflowHits = hits.slice(0, 30);
			};
			first = setTimeout(scan, 1500);
			timer = setInterval(scan, 3000);
		} catch {
			// Diagnostics never break the page.
		}
		return () => {
			clearTimeout(first);
			clearInterval(timer);
		};
	});

	async function runRestore(file: File) {
		showSettings = false;
		if (!page.url.pathname.startsWith('/admin/notes')) void goto('/admin/notes');
		restoreName = file.name;
		restoreError = '';
		restorePhase = 'uploading';
		// The recap belongs to the journal that is being replaced. Drop it and
		// ignore any summary response that started before the import.
		summaryEpoch += 1;
		clearTimeout(summaryTimer);
		summaryLoading = false;
		week = null;
		dismissed = true;
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
			invalidateTagChoices();
			// The import already copied weekly_recaps and cleared the server
			// memo. Refresh silently: forcing here regenerated the recap and
			// re-opened the hidden weekly card.
			refreshSummaryAnswer(false, null, false);
			showToast(
				`Journal restored — ${counts?.notes ?? 0} notes, ${counts?.todoItems ?? 0} tasks, ${counts?.principles ?? 0} principles, ${counts?.holdings ?? 0} holdings, ${counts?.goals ?? 0} goals, ${counts?.stocks ?? 0} stock items, ${counts?.books ?? 0} books, ${counts?.recaps ?? 0} recaps, ${counts?.asks ?? 0} questions.`,
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
		void loadHoldings();
		// The strip owns its own 60-second reload and goal alerts, so the
		// collapsed Trading section still shows its totals.
		tradingStrip.start();
		refreshSummaryAnswer(true, null, false);
		void loadAsks();
		void nostrAccount.load();
		void timeTracker.load();
		miniApps.loadUsage();
		// Restore the unsaved composer text after SPA navigation or a reload.
		const draft = loadDraft();
		text = draft.note;
		question = draft.ask;
	});

	// The backup runs on page load when an account exists, and the moment one is
	// configured. No account means no request.
	$effect(() => {
		if (nostrAccount.loaded && nostrAccount.configured) void nostrBackup.start();
	});

	// Holdings auto-refresh: every 5 minutes while the tab is visible. Quiet
	// and forced — without force the server would answer from its daily cache
	// and the spinner would update nothing. The guard skips hidden tabs and
	// in-flight refreshes; any manual refresh restarts the clock. onMount,
	// not $effect: the tick reads refresh state that must not re-arm the
	// timer on every refresh.
	onMount(() => {
		if (typeof document === 'undefined') return;
		const tick = () => {
			if (document.hidden) return;
			if (holdingsRefreshing) return;
			if (Date.now() - lastHoldingsRefresh < HOLDINGS_AUTO_MS) return;
			void refreshHoldings(true, true);
		};
		const timer = setInterval(tick, 30_000);
		const onVisible = () => {
			if (!document.hidden) tick();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
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

	async function handlePublish(n: Note) {
		try {
			const res = await loading.track(fetch(`/api/notes/${n.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ published: !n.published })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update note.');
			const saved = d.note as Note;
			// The published-only filter loses an unpublished note immediately.
			if (publishedOnly && !saved.published) pager.remove(saved.id);
			else pager.patch(saved);
			featured = featured.map((f) => (f.id === saved.id ? saved : f));
			showToast(saved.published ? 'Note published.' : 'Note unpublished.', 'success');
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to update note.');
		}
	}

	function handleCover(n: Note, coverId: string | null) {
		pager.patch({ ...n, coverId });
		featured = featured.map((f) => (f.id === n.id ? { ...f, coverId } : f));
	}

	async function loadAsks() {
		try {
			const d = await (await loading.track(fetch('/api/asks'))).json();
			asks = Array.isArray(d.asks) ? d.asks : [];
		} catch {}
	}

	let holdings = $state<HoldingsSummary | null>(null);
	let holdingsRefreshing = $state(false);
	let marketRefreshing = $state(false);
	let refreshingTicker = $state<string | null>(null);
	let confirmingHolding = $state<Holding | null>(null);
	let holdingsAutoRefreshed = false;
	let lastHoldingsRefresh = $state(0);
	const HOLDINGS_AUTO_MS = 5 * 60 * 1000;

	async function loadHoldings() {
		try {
			const d = await (await fetch('/api/holdings')).json();
			if (!Array.isArray(d.holdings)) return;
			holdings = d as HoldingsSummary;
			// Every non-cash quote comes from the market: ask on load, once
			// per session. The server answers from cache until a quote is a
			// day old, so this costs one request, not one network fetch.
			if (
				!holdingsAutoRefreshed &&
				holdings.holdings.some((h) => h.category !== 'cash' && (h.priceAuto || h.price === null))
			) {
				holdingsAutoRefreshed = true;
				void refreshHoldings(true);
			}
		} catch {
			showToast('Failed to load holdings.');
		}
	}

	async function createHolding(h: { ticker: string; amount: number; avgPrice: number | null; currency: string; category: HoldingCategory; bank: string; country: string }): Promise<boolean> {
		try {
			const res = await fetch('/api/holdings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(h)
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to add holding.');
			holdings = d.summary as HoldingsSummary;
			// New tickers start with no quote; fill it without blocking the
			// modal or showing a toast. The daily cache still applies.
			void refreshHoldings(true);
			return true;
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to add holding.');
			return false;
		}
	}

	async function updateHolding(
		id: string,
		patch: { ticker: string; avgPrice: number | null; currency: string; category: HoldingCategory; bank: string; country: string }
	): Promise<boolean> {
		try {
			const res = await fetch(`/api/holdings/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update holding.');
			holdings = d.summary as HoldingsSummary;
			// A ticker or category change clears the quote; fetch the new one
			// quietly. Amount-only edits stay served from the cache.
			void refreshHoldings(true);
			return true;
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to update holding.');
			return false;
		}
	}

	async function loadHoldingActions(id: string): Promise<HoldingAction[] | null> {
		try {
			const res = await fetch(`/api/holdings/${id}/actions`);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to load actions.');
			return Array.isArray(d.actions) ? (d.actions as HoldingAction[]) : null;
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to load actions.');
			return null;
		}
	}

	async function recordHoldingAction(
		id: string,
		kind: 'buy' | 'sell',
		amount: number,
		price: number | null
	): Promise<{ ok: boolean; error?: string; actions?: HoldingAction[] }> {
		try {
			const res = await fetch(`/api/holdings/${id}/actions`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind, amount, price })
			});
			const d = await res.json();
			if (!res.ok) return { ok: false, error: d?.error ?? 'Failed to record the action.' };
			if (d.summary) holdings = d.summary as HoldingsSummary;
			return { ok: true, actions: Array.isArray(d.actions) ? (d.actions as HoldingAction[]) : undefined };
		} catch {
			return { ok: false, error: 'Failed to record the action.' };
		}
	}

	async function updateGoals(
		pct: { btc: number; fii: number; cash: number },
		values: { btc: number | null; fii: number | null; cash: number | null }
	): Promise<boolean> {
		try {
			const res = await fetch('/api/holdings/goals', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pct, values })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save goals.');
			holdings = d.summary as HoldingsSummary;
			return true;
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to save goals.');
			return false;
		}
	}

	async function deleteHolding(h: Holding) {
		try {
			const res = await fetch(`/api/holdings/${h.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete holding.');
			holdings = ((await res.json()).summary ?? null) as HoldingsSummary | null;
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to delete holding.');
		}
	}

	async function refreshHoldings(quiet = false, force = false) {
		if (holdingsRefreshing) return;
		holdingsRefreshing = true;
		// Every refresh — manual or automatic — moves the 5-minute auto tick
		// out, so a manual tap is never followed by a duplicate auto fetch.
		lastHoldingsRefresh = Date.now();
		try {
			const res = await fetch('/api/holdings', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(force ? { force: true } : {})
			});
			const d = await res.json();
			if (d.summary) holdings = d.summary as HoldingsSummary;
			if (d.error && !quiet) showToast(`Prices not refreshed — ${d.error}. Showing cached values.`);
		} catch {
			if (!quiet) showToast('Prices not refreshed — showing cached values.');
		} finally {
			holdingsRefreshing = false;
		}
	}

	/** One global update for the Market card: holdings plus every open
	 *  trading ticker in a single tap. */
	async function refreshMarket() {
		if (marketRefreshing) return;
		marketRefreshing = true;
		// The shared quote run counts as a manual refresh for the auto tick.
		lastHoldingsRefresh = Date.now();
		try {
			const res = await fetch('/api/market/refresh', { method: 'POST' });
			const d = await res.json();
			if (d.summary) holdings = d.summary as HoldingsSummary;
			if (Array.isArray(d.errors) && d.errors.length > 0) {
				showToast(`Updated with warnings — ${d.errors.join('; ')}. Showing cached values where it failed.`);
			}
			try {
				window.dispatchEvent(new CustomEvent('trading:changed'));
			} catch {}
		} catch {
			showToast('Update failed — showing cached values.');
		} finally {
			marketRefreshing = false;
		}
	}

	/** One ticker, one fetch: update its auto-priced holding and its trading
	 *  quote. The global updater stays a separate multi-ticker path. */
	async function refreshTicker(ticker: string) {
		const t = ticker.trim().toUpperCase();
		if (!t || refreshingTicker) return;
		refreshingTicker = t;
		lastHoldingsRefresh = Date.now();
		try {
			const res = await fetch('/api/quotes/refresh', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ticker: t })
			});
			const d = await res.json();
			if (d.summary) holdings = d.summary as HoldingsSummary;
			if (d.ok) {
				showToast(`${t} updated${d.source ? ` · ${d.source}` : ''}.`, 'success');
				try {
					window.dispatchEvent(new CustomEvent('trading:changed'));
				} catch {}
			} else {
				showToast(`${t} not updated — ${d.error ?? 'no quote'}. Showing cached values.`);
			}
		} catch {
			showToast(`${t} not updated — showing cached values.`);
		} finally {
			refreshingTicker = null;
		}
	}

	function refreshSummaryAnswer(force: boolean, keepAnswer: string | null, withLoading: boolean) {clearTimeout(summaryTimer);
		const epoch = summaryEpoch;
		if (withLoading) summaryLoading = true;
		summaryTimer = setTimeout(async () => {
			const started = performance.now();
			const custom = config.summaryPrompt.trim();
			try {
				const d = await (await fetch('/api/summary?' + (force ? 'rf=1&' : '') + 'lang=' + config.modelLang + '&model=' + config.chatModel + (custom ? '&prompt=' + encodeURIComponent(custom) : ''), { headers: {} })).json();
				if (epoch !== summaryEpoch) return;
				const rest = withLoading ? Math.max(0, 900 - (performance.now() - started)) : 0;
				if (rest > 0) await new Promise((r) => setTimeout(r, rest));
				if (epoch !== summaryEpoch) return;
				week = d.exists ? d.week : null;
				if (withLoading && d.exists) dismissed = false;
			} catch {
				// fall through to finally
			} finally {
				if (epoch === summaryEpoch) {
					summaryLoading = false;
					weekLoading = false;
				}
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

	function handleNote(cd: string, createdAt?: number) {
		if (!cd.trim() || NO_STATE.has(cd)) return;
		if (!page.url.pathname.startsWith('/admin/notes')) void goto('/admin/notes');
		saving = true;
		const { content, tags } = splitHashtags(cd);
		if (!content) {
			saving = false;
			showToast('A note needs text besides its hashtags.');
			return;
		}
		const now = Date.now();
		const stamp = createdAt && Number.isFinite(createdAt) ? Math.min(createdAt, now) : now;
		const last = pager.notes[pager.notes.length - 1];
		// A backdated note outside the loaded cursor range is stored, but it
		// must not jump into a gap the pager has not fetched yet.
		const fitsLoadedPage = !last || !pager.hasMore || stamp >= last.created_at;
		const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		if (fitsLoadedPage) {
			pager.insertSorted({ id: tempId, content, created_at: stamp, updated_at: stamp, tags, pending: true });
		}
		fetch('/api/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content: cd, created_at: stamp })
		})
			.then(async (r) => {
				const d = await r.json();
				if (!r.ok) throw new Error(d?.error ?? 'Failed to save note.');
				const saved: Note = d.note;
				// The card is still listed under the temp id, so it must be
				// swapped, not patched by the server id.
				pager.replace(tempId, saved);
				if (!fitsLoadedPage) showToast('Note saved. Scroll down to find it.', 'success');
				else showToast('Note saved.', 'success');
				clearDraft();
				invalidateTagChoices();
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

	async function handleEdit(id: string, content: string, video?: string, createdAt?: number, title?: string) {
		const body: { content: string; video?: string; created_at?: number; title?: string } = { content };
		if (video !== undefined) body.video = video;
		if (createdAt !== undefined) body.created_at = createdAt;
		if (title !== undefined) body.title = title;
		const res = await loading.track(fetch(`/api/notes/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}));
		const d = await res.json();
		if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
		const note = d.note as Note;
		const wasLoaded = pager.notes.some((n) => n.id === note.id);
		if (wasLoaded && !pager.replaceSorted(note)) {
			showToast('Note saved. Scroll down to find it.', 'success');
		}
		featured = featured
			.map((f) => (f.id === note.id ? note : f))
			.sort((a, b) => b.created_at - a.created_at);
		invalidateTagChoices();
		refreshSummaryAnswer(false, null, false);
	}

	async function handleAsk(q: string) {
		if (!q.trim()) return;
		if (page.url.pathname !== '/admin/ask') void goto('/admin/ask');
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

	setContext(APP_KEY, {
		notes: {
			get week() {
				return week;
			},
			get dismissed() {
				return dismissed;
			},
			get summaryLoading() {
				return summaryLoading;
			},
			get reading() {
				return reading;
			},
			onReadWeekly: handleAskWeeklyRead,
			onDismissWeekly: dismissWeekly,
			get featured() {
				return featured;
			},
			get notes() {
				return notes;
			},
			get publishedOnly() {
				return publishedOnly;
			},
			onTogglePublished: () => void togglePublished(),
			get hasMore() {
				return pager.hasMore;
			},
			get loadingMore() {
				return pager.loading;
			},
			onLoadMore: () => pager.loadMore(),
			onDeleteNote: handleDelete,
			onEditNote: handleEdit,
			onFeatureNote: handleFeature,
			onPublishNote: handlePublish,
			onCoverNote: handleCover,
			onRemoveTag: removeTag
		},
		ask: {
			get asks() {
				return asks;
			},
			get lastQuestion() {
				return lastQuestion;
			},
			get answer() {
				return answer;
			},
			get answerSources() {
				return answerSources;
			},
			get answering() {
				return answering;
			},
			get answerStopped() {
				return answerStopped;
			},
			onDeleteAsk: handleDeleteAsk
		},
		display: {
			get lang() {
				return config.entriesLang;
			},
			get widthClass() {
				return contentClass;
			}
		},
		market: {
			onRefreshTicker: (ticker: string) => void refreshTicker(ticker),
			get refreshingTicker() {
				return refreshingTicker;
			}
		},
		onError: (message: string) => showToast(message)
	} satisfies AppContext);
</script>

<svelte:head>
	<title>fermentario</title>
</svelte:head>

<main class="min-h-dvh">
{#if bareReader}
	{@render children()}
{:else}
	<div
		class="mx-auto min-w-0 overflow-x-hidden {contentClass} px-2 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(var(--composer-h,4.5rem)+2.5rem)] sm:px-6"
	>
		<TimeTrackerBar widthClass={contentClass} />
		<header class="mb-5">
			<div class="flex flex-wrap items-center gap-2">
				<a href="/admin/heatmap" aria-disabled={heatmapLoading} aria-busy={heatmapLoading} class="inline-flex items-center gap-1 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 {heatmapLoading ? 'pointer-events-none opacity-40' : ''}">{#if heatmapLoading}<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{:else}<Grid3x3 class="h-3.5 w-3.5" />{/if} Heatmaps</a>
				<a href="/admin/tags" aria-disabled={tagsLoading} aria-busy={tagsLoading} class="inline-flex items-center gap-1 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 {tagsLoading ? 'pointer-events-none opacity-40' : ''}">{#if tagsLoading}<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{:else}<Tags class="h-3.5 w-3.5" />{/if} Tags</a>
				<span class="ml-auto inline-flex items-center gap-2">
					<button
						type="button"
						class="inline-flex items-center gap-1 rounded-full bg-stone-900 dark:bg-stone-700 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
						aria-label={section === 'ask' ? 'Close Ask' : 'Ask the archive'}
						onclick={toggleAsk}
					>{#if section === 'ask'}<span aria-hidden="true">×</span> Close{:else}<MessageCircle class="h-3.5 w-3.5" /> Ask{/if}</button>
					<a
						href="/"
						class="grid h-7 w-7 place-items-center rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						aria-label="Public homepage"
						title="Public homepage"
					><House class="h-3.5 w-3.5" /></a>
					<button
						type="button"
						class="grid h-7 w-7 place-items-center rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						aria-label="Search"
						title="Search (Ctrl+K)"
						aria-haspopup="dialog"
						aria-keyshortcuts="Meta+K Control+K"
						onclick={() => search.openSearch()}
					><Search class="h-3.5 w-3.5" /></button>
					<button
						type="button"
						class="grid h-7 w-7 place-items-center rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						aria-label="Settings"
						onclick={() => (showSettings = true)}
					><Settings class="h-3.5 w-3.5" /></button>
				</span>
			</div>
		</header>

		{#if showMarket}
		<section class="mb-4" aria-label="Market">
			<MarketCard refreshing={marketRefreshing} onRefresh={() => void refreshMarket()}>
				{#snippet tradingSummary()}
					{@const t = tradingStrip.totals}
					{#if t && t.count > 0}
						{t.count} · {fmtCurrency(t.now.USD ?? NaN, 'USD', 0)}{#if t.now.BRL !== null} · {fmtCurrency(t.now.BRL, 'BRL', 0)}{/if}{#if t.now.UYU !== null} · {fmtCurrency(t.now.UYU, 'UYU', 0)}{/if}
					{/if}
				{/snippet}
				{#snippet holdingsRail()}
					<HoldingsCarousel
						summary={holdings}
						bare
						onCreate={createHolding}
						onUpdate={updateHolding}
						onDelete={(h) => (confirmingHolding = h)}
						onLoadActions={loadHoldingActions}
						onRecordAction={recordHoldingAction}
						onGoals={updateGoals}
						onRefresh={(t) => void refreshTicker(t)}
						refreshingTicker={refreshingTicker}
					/>
				{/snippet}
				{#snippet tradingRail()}
					<TradingStrip
						bare
						onOpen={() => void goto('/admin/businesses/trading/b3')}
						onRefreshTicker={(t) => void refreshTicker(t)}
						refreshingTicker={refreshingTicker}
					/>
				{/snippet}
			</MarketCard>
		</section>
		{/if}

		<div class="mb-4" role="tablist" aria-label="Views">
			<SectionBar
				sections={orderedSections}
				fixed={fixedSections}
				active={section === 'ask' ? lastSection : section}
				onSelect={selectSection}
				onReorder={(ids) => saveConfig({ sections: ids })}
			/>
		</div>

		{@render children()}

		{#if overflowOn}
			<div class="fixed inset-x-0 bottom-0 z-[999] max-h-44 overflow-y-auto bg-black/90 p-2 font-mono text-[10px] leading-snug text-white">
				{#each overflowHits as h (h)}
					<p>{h}</p>
				{/each}
				{#if overflowHits.length <= 1}
					<p>no over-wide element found — shift is not element overflow</p>
				{/if}
			</div>
		{/if}

		{#if confirmingHolding}
			<ConfirmDialog
				title="Delete this holding?"
				message="{confirmingHolding.ticker} and its history leave the carousel. The notes stay."
				confirmLabel="Delete holding"
				cancelLabel="Cancel"
				confirmTone="danger"
				onConfirm={() => { const h = confirmingHolding; confirmingHolding = null; if (h) void deleteHolding(h); }}
				onCancel={() => (confirmingHolding = null)}
			/>
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

		{#if section === 'notes' || section === 'ask'}
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
{/if}
</main>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { showSettings = false; } handleViewShortcut(e); }} />
