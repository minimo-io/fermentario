<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import List from '@lucide/svelte/icons/list';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { Book, BookNote, BookNotesPage } from '$lib/types';

	// A minimal EPUB reader built on epub.js. The engine runs client-only
	// (dynamic import): it unzips the stored ArrayBuffer and lays out inside
	// an iframe. The journal keeps the bytes, the last position and the
	// highlights; text size is a device preference in localStorage.
	//
	// Chrome is hidden by default OFF: the only fixed UI is the top row and
	// the bottom corner arrows, and a tap on the page (or the eye button)
	// toggles them for distraction-free reading. The selection toolbar, the
	// note editor and the drawers are independent of that state.
	type Props = {
		book: Book;
		notesPage: BookNotesPage;
		onError: (msg: string) => void;
	};
	let { book, notesPage, onError }: Props = $props();

	// svelte-ignore state_referenced_locally — the page remounts per book;
	// seeding from the props is the intent.
	let notes = $state<BookNote[]>(notesPage.notes);
	// svelte-ignore state_referenced_locally
	let notesHasMore = $state(!!notesPage.hasMore);
	// svelte-ignore state_referenced_locally
	let notesCursor = $state(notesPage.nextCursor);
	// svelte-ignore state_referenced_locally
	let notesTotal = $state(notesPage.total ?? notes.length);
	let loadingNotes = $state(false);
	let notesSentinel = $state<HTMLDivElement | null>(null);
	let notesScroll = $state<HTMLDivElement | null>(null);

	const SCALE_KEY = 'ferm:reader-scale';
	let scale = $state(clampScale(readStoredScale()));

	let mount: HTMLDivElement | undefined = $state();
	let ready = $state(false);
	let loadingErr = $state('');
	let panel: 'toc' | 'notes' | null = $state(null);
	let toc = $state<{ href: string; label: string; depth: number }[]>([]);
	let chromeVisible = $state(true);
	let isFullscreen = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);
	// svelte-ignore state_referenced_locally
	let pct = $state(book.lastPct);

	// Selection: epub.js emits the CFI range plus the Contents of the viewed
	// section; the text is read from that window, with getRange as fallback
	// (iOS can report an empty window selection during the debounce).
	let selection = $state<{ cfi: string; text: string } | null>(null);
	let noteDraft = $state('');
	let composing = $state(false);
	let editing = $state<BookNote | null>(null);
	let editText = $state('');
	// Tapping a drawn mark opens its action sheet (the app's dialog-menu
	// standard): Add/Edit note or Delete the highlight.
	let markMenu = $state<BookNote | null>(null);

	// epub.js objects exist only after the async client import; the shipped
	// types are not usable across that boundary, so the handles stay loose.
	let rendition: any = null;
	let epubBook: any = null;
	let EpubCFICtor: any = null;
	const seenContents = new WeakSet();
	let selTimer: ReturnType<typeof setTimeout> | undefined;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let hrefToLabel = new Map<string, string>();
	let lastLoc: { cfi: string; pct: number; href: string } | null = null;

	// Tap-to-toggle state: a touch counts as a tap when it is short and
	// unmoved, so scrolling, swiping and long-press selection never hide the
	// chrome by accident. The last-touch timestamp swallows the synthetic
	// click that follows a tap.
	let touchAt = { t: 0, x: 0, y: 0 };
	let lastTouchTs = 0;
	let lastEndStamp = 0;

	function clampScale(v: number): number {
		return Math.min(180, Math.max(80, Math.round(v)));
	}
	function readStoredScale(): number {
		if (typeof localStorage === 'undefined') return 100;
		const n = Number(localStorage.getItem(SCALE_KEY));
		return Number.isFinite(n) && n > 0 ? n : 100;
	}

	function flattenToc(items: Array<{ href?: string; label: string; subitems?: any[] }>, depth = 0): { href: string; label: string; depth: number }[] {
		const out: { href: string; label: string; depth: number }[] = [];
		for (const it of items) {
			const label = (it.label || '').replace(/\s+/g, ' ').trim();
			if (it.href && label) {
				out.push({ href: it.href, label, depth });
				hrefToLabel.set(stripFragment(it.href), label);
			}
			if (it.subitems?.length) out.push(...flattenToc(it.subitems, depth + 1));
		}
		return out;
	}
	function stripFragment(href: string): string {
		return href.split('#')[0];
	}

	function applyScale(next: number) {
		scale = clampScale(next);
		try {
			localStorage.setItem(SCALE_KEY, String(scale));
		} catch {}
		if (rendition) rendition.themes.fontSize(`${scale}%`);
	}

	// The Fullscreen button renders only where the API actually exists:
	// desktop Safari/Chrome and Android. iPhone Safari has NO element
	// Fullscreen — in a browser tab or in PWA standalone — so on iOS
	// there is no button, no toast, nothing useless: hiding the chrome
	// (eye or page tap) is the immersive mode there.
	const fsSupported =
		browser &&
		!!(document.fullscreenEnabled || 'webkitFullscreenElement' in document) &&
		!!((Element.prototype as any).requestFullscreen || (Element.prototype as any).webkitRequestFullscreen);

	function fullscreenOn(): any {
		return document.fullscreenElement ?? (document as any).webkitFullscreenElement ?? null;
	}

	async function toggleFullscreen() {
		if (!browser || !fsSupported) return;
		try {
			if (fullscreenOn()) {
				const exit = document.exitFullscreen ?? (document as any).webkitExitFullscreen;
				await exit?.call(document);
				return;
			}
			const el = rootEl as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
			if (el?.requestFullscreen) {
				await el.requestFullscreen();
			} else if (el?.webkitRequestFullscreen) {
				el.webkitRequestFullscreen();
			}
		} catch {
			onError('The browser refused fullscreen.');
		}
	}

	async function goTo(target: string) {
		if (!rendition) return;
		panel = null;
		try {
			await rendition.display(target);
		} catch {
			onError('Could not open that section.');
		}
	}

	function flushSave() {
		clearTimeout(saveTimer);
		if (!lastLoc) return;
		const chapter = hrefToLabel.get(stripFragment(lastLoc.href)) ?? '';
		void fetch(`/api/books/${encodeURIComponent(book.id)}/position`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ cfi: lastLoc.cfi, pct: lastLoc.pct, chapter }),
			keepalive: true
		}).catch(() => {});
	}

	// Throttle the writes: relocated fires on every scroll step.
	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (lastLoc) {
				pct = lastLoc.pct || pct;
				flushSave();
			}
		}, 1200);
	}

	function onRelocated(loc: { start?: { cfi?: string; href?: string; percentage?: number } }) {
		const s = loc?.start;
		if (!s?.cfi) return;
		markMenu = null; // navigating away closes any open mark sheet
		lastLoc = { cfi: s.cfi, pct: Number.isFinite(s.percentage) ? (s.percentage as number) : 0, href: s.href ?? '' };
		pct = lastLoc.pct || pct;
		scheduleSave();
	}

	// The single gate into the selection toolbar. Deduped by CFI because
	// Blink fires BOTH the native `selected` event and our touchend/mouseup
	// capture for the same selection.
	let dismissedCfi = '';

	function applySelection(cfi: string, text: string) {
		if (!cfi || !text) return;
		// The same selection the user just Cancelled/used does not re-open
		// the toolbar from the poll; a NEW gesture clears this (touchstart).
		if (cfi === dismissedCfi) return;
		if (selection && selection.cfi === cfi && selection.text === text) return;
		selection = { cfi, text: text.slice(0, 500) };
		composing = false;
		noteDraft = '';
	}

	function onSelected(cfiRange: string, contents: any) {
		let text = '';
		try {
			text = String(contents?.window?.getSelection?.().toString() ?? '');
		} catch {}
		if (!text.trim()) {
			try {
				text = String(rendition?.getRange(cfiRange)?.toString() ?? '');
			} catch {}
		}
		// An empty emission (selection just cleared) keeps the open toolbar
		// alive until the user taps Cancel or acts on it.
		applySelection(cfiRange, text.trim());
	}

	// WebKit never fires `selectionchange` inside the content iframes, so
	// epub.js's `selected` event stays silent on iOS: we read the live
	// selection when the gesture ends and build the CFI range exactly the
	// way the library's own path does (new EpubCFI(range, contents.cfiBase)).
	function captureSelection(contents: any) {
		if (!contents?.window) return;
		let sel: Selection | null = null;
		try {
			sel = contents.window.getSelection?.() ?? null;
		} catch {
			return;
		}
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
		// A real selection but no CFI class is a broken import, not a
		// no-op: say so instead of staying silent.
		const CFI = EpubCFICtor ?? rendition?.epubcfi?.constructor;
		if (!CFI) {
			onError('The highlight engine did not load.');
			return;
		}
		const range = sel.getRangeAt(0);
		let text = '';
		let cfi = '';
		try {
			text = String(range.toString() ?? sel.toString() ?? '').trim();
			cfi = new CFI(range, contents.cfiBase).toString();
		} catch {
			return;
		}
		applySelection(cfi, text);
	}

	// A slow poll of the live selection is the only guaranteed capture:
	// iOS swallows touchend/mouseup while the text-interaction UI owns the
	// gesture. getContents() returns an ARRAY (one Contents per view) —
	// passing it as one was enough to kill the whole capture.
	// It no-ops unless some view holds a non-collapsed selection, and
	// applySelection dedupes by CFI.
	let selPoll: ReturnType<typeof setInterval> | undefined;

	function startSelectionPoll() {
		clearInterval(selPoll);
		selPoll = setInterval(() => {
			let list: any = null;
			try {
				list = rendition?.getContents?.();
			} catch {
				return;
			}
			if (!list) return;
			if (Array.isArray(list)) {
				for (const c of list) captureSelection(c);
			} else {
				captureSelection(list);
			}
		}, 700);
	}

	// Fast paths on top of the poll: where the events do arrive (Blink,
	// mouse engines) the toolbar appears within 220 ms instead of 700.
	function scheduleSelectionCapture(contents: any) {
		clearTimeout(selTimer);
		selTimer = setTimeout(() => {
			captureSelection(contents);
			selTimer = setTimeout(() => captureSelection(contents), 500);
		}, 220);
	}

	function clearSelection() {
		dismissedCfi = selection?.cfi ?? '';
		selection = null;
		composing = false;
		noteDraft = '';
		// Drop the native selection too, or iOS keeps the blue handles and
		// the poll would keep seeing the same range. getContents() is an
		// array of view Contents.
		try {
			const list = rendition?.getContents?.();
			const arr = Array.isArray(list) ? list : list ? [list] : [];
			for (const c of arr) {
				try {
					c?.window?.getSelection?.()?.removeAllRanges?.();
				} catch {}
			}
		} catch {}
	}

	function isChromeTapEvent(e: any): boolean {
		const el = e?.target as Element | null;
		// Never toggle on taps that hit marks, links or buttons in the text.
		if (el && typeof el.closest === 'function' && el.closest('a, button, [ref]')) return false;
		return true;
	}

	function toggleChrome() {
		if (selection || editing || markMenu) return;
		// An open drawer owns the screen: the first tap just closes it.
		if (panel) {
			panel = null;
			return;
		}
		chromeVisible = !chromeVisible;
	}

	function onTouchStart(e: any) {
		// A fresh gesture can legally re-select the exact same range: let it
		// past the dismissed-CFI gate.
		dismissedCfi = '';
		const p = e?.changedTouches?.[0] ?? e?.touches?.[0];
		touchAt = { t: Date.now(), x: p?.clientX ?? 0, y: p?.clientY ?? 0 };
	}

	function onTouchEnd(e: any, contents?: any) {
		// The same native touchend can arrive twice: epub.js's forwarding
		// AND the direct document belt. One event = one handling.
		const stamp = e?.timeStamp ?? 0;
		if (stamp && stamp === lastEndStamp) return;
		lastEndStamp = stamp;
		// A mark tap already opened its sheet on touchstart: the rest of
		// this gesture must do nothing.
		if (markMenu) return;
		lastTouchTs = Date.now();
		// Always schedule the capture, BEFORE the tap tests: the long press
		// and handle drags — the gestures that actually select — exit the
		// toggle path below, and WebKit gives us no selectionchange to hook.
		if (contents) scheduleSelectionCapture(contents);
		const p = e?.changedTouches?.[0];
		if (!p) return;
		const dt = Date.now() - touchAt.t;
		const dx = p.clientX - touchAt.x;
		const dy = p.clientY - touchAt.y;
		// Ebook-reader paging: a fast, mostly-horizontal drag turns the
		// page. Swipe left = next, swipe right = previous. The freshness
		// gate makes a touchend without a recent touchstart inert.
		if (dt < 600 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
			dismissedCfi = '';
			void (dx < 0 ? rendition?.next() : rendition?.prev());
			return;
		}
		if (dt > 400) return;
		if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
		// A stationary tap on a mark opens its sheet instead of toggling.
		const pp = toParentPoint(e);
		if (pp && markTap(pp.x, pp.y)) return;
		if (!isChromeTapEvent(e)) return;
		toggleChrome();
	}

	function onClick(e: any) {
		// A tap already toggled via touchend; ignore its synthesized click.
		if (Date.now() - lastTouchTs < 600) return;
		const pp = toParentPoint(e);
		if (pp && markTap(pp.x, pp.y)) return;
		if (!isChromeTapEvent(e)) return;
		toggleChrome();
	}

	async function addHighlight(withNote: boolean) {
		if (!selection) return;
		if (withNote && !composing) {
			composing = true;
			return;
		}
		const note = withNote ? noteDraft.trim() : '';
		try {
			const res = await fetch(`/api/books/${encodeURIComponent(book.id)}/notes`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cfi: selection.cfi, excerpt: selection.text, note })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Could not save the highlight.');
			const created = d.note as BookNote;
			notes = [created, ...notes];
			notesTotal += 1;
			drawHighlight(created);
		} catch (e) {
			onError((e as Error)?.message ?? 'Could not save the highlight.');
		}
		clearSelection();
	}

	// Draw an SVG mark for a note. epub.js paints highlights inside an SVG
	// pane, so the styles argument is a map of SVG ATTRIBUTES (fill,
	// fill-opacity) — CSS properties like background-color are ignored and
	// the mark falls back to the engine default.
	function drawHighlight(n: BookNote) {
		if (!rendition) return;
		try {
			rendition.annotations.highlight(
				n.cfi,
				{ id: n.id },
				// The tap opens the action sheet with the CURRENT note data,
				// not the object captured when the mark was drawn. Where the
				// marks-pane proxy is alive this is the instant path; where
				// it is dead, the gesture handlers' markTap covers it.
				() => {
					markMenu = notes.find((x) => x.id === n.id) ?? n;
				},
				'ferm-note',
				{
					fill: '#fbbf24',
					'fill-opacity': '0.35'
				}
			);
		} catch {
			// A stale CFI (edited book, different build) just won't mark.
		}
	}

	function openEditor(id: string) {
		const n = notes.find((x) => x.id === id) ?? null;
		editing = n;
		editText = n?.note ?? '';
	}

	function markMenuEdit() {
		const n = markMenu;
		markMenu = null;
		if (n) openEditor(n.id);
	}

	function markMenuDelete() {
		const n = markMenu;
		markMenu = null;
		if (n) void removeNote(n);
	}

	// marks-pane's proxy binds to the contentDocument that exists when the
	// pane is BORN — the srcdoc frame can swap documents after that and
	// then the engine never re-delivers taps to the mark listeners. So we
	// hit-test the live annotation rects ourselves: the iframe event's
	// local point is mapped to parent coordinates and matched against each
	// highlight mark's client rects (already parent-space).
	function toParentPoint(ev: any): { x: number; y: number } | null {
		const t = ev?.changedTouches?.[0] ?? ev;
		if (!t || typeof t.clientX !== 'number') return null;
		try {
			const fe = ev?.view?.frameElement as Element | null;
			const r = fe?.getBoundingClientRect?.();
			return { x: t.clientX + (r?.left ?? 0), y: t.clientY + (r?.top ?? 0) };
		} catch {
			return { x: t.clientX, y: t.clientY };
		}
	}

	function markUnderPoint(cx: number, cy: number): BookNote | null {
		if (!rendition) return null;
		let anns: any[] = [];
		try {
			anns = Object.values(rendition.annotations?._annotations ?? {}) as any[];
		} catch {
			return null;
		}
		for (const a of anns) {
			if (!a || a.type !== 'highlight') continue;
			const el = a.mark?.element;
			if (!el || typeof el.getClientRects !== 'function') continue;
			let hit = false;
			try {
				for (const r of Array.from(el.getClientRects()) as DOMRect[]) {
					if (r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy) {
						hit = true;
						break;
					}
				}
			} catch {}
			if (!hit) continue;
			const n = notes.find((x) => x.id === a.data?.id);
			if (n) return n;
		}
		return null;
	}

	function markTap(x: number, y: number): boolean {
		const n = markUnderPoint(x, y);
		if (!n) return false;
		markMenu = n;
		return true;
	}

	async function saveEdit() {
		if (!editing) return;
		try {
			const res = await fetch(`/api/books/${encodeURIComponent(book.id)}/notes/${encodeURIComponent(editing.id)}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ note: editText.trim() })
			});
			if (!res.ok) throw new Error('Could not save the note.');
			const updated = (await res.json()).note as BookNote;
			notes = notes.map((x) => (x.id === updated.id ? updated : x));
		} catch (e) {
			onError((e as Error)?.message ?? 'Could not save the note.');
			return;
		}
		editing = null;
	}

	async function removeNote(n: BookNote) {
		try {
			const res = await fetch(`/api/books/${encodeURIComponent(book.id)}/notes/${encodeURIComponent(n.id)}`, {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error('Could not remove the note.');
			notes = notes.filter((x) => x.id !== n.id);
			notesTotal = Math.max(0, notesTotal - 1);
			try {
				rendition?.annotations.remove(n.cfi, 'highlight');
			} catch {}
		} catch (e) {
			onError((e as Error)?.message ?? 'Could not remove the note.');
		}
		if (editing?.id === n.id) editing = null;
	}

	// The drawer pages like every other list: 50 at a time, a sentinel plus
	// IntersectionObserver loads the next page when it scrolls into reach.
	async function loadMoreNotes() {
		if (loadingNotes || !notesHasMore || !notesCursor || !browser) return;
		loadingNotes = true;
		try {
			const q = `?limit=50&before=${notesCursor.created_at}&before_id=${encodeURIComponent(notesCursor.id)}`;
			const d = await (await fetch(`/api/books/${encodeURIComponent(book.id)}/notes${q}`)).json();
			const more = (Array.isArray(d.notes) ? d.notes : []) as BookNote[];
			const fresh = more.filter((n) => !notes.some((x) => x.id === n.id));
			notes = [...notes, ...fresh];
			for (const n of fresh) drawHighlight(n);
			notesHasMore = !!d.hasMore;
			notesCursor = d.nextCursor ?? null;
			if (typeof d.total === 'number') notesTotal = d.total;
		} catch {
			onError('Failed to load more notes.');
			notesHasMore = false;
		} finally {
			loadingNotes = false;
		}
	}

	// Re-created after each page (loadingNotes flips): a still-visible
	// sentinel fires the new observer at once, so short pages chain-load.
	// The root is the drawer's own scroll box — the list scrolls inside the
	// aside, so viewport-relative intersection would never fire.
	$effect(() => {
		const el = notesSentinel;
		if (panel !== 'notes' || !el || !notesHasMore || loadingNotes) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMoreNotes();
			},
			{ root: notesScroll, rootMargin: '200px 0px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});

	// The mount callback must stay synchronous: Svelte only runs the returned
	// cleanup if it did not come from a promise.
	onMount(() => {
		if (browser && mount) {
			void open();
			const onFlush = () => flushSave();
			const onVisible = () => {
				if (document.visibilityState === 'hidden') flushSave();
			};
			window.addEventListener('pagehide', onFlush);
			document.addEventListener('visibilitychange', onVisible);
			const onFs = () => (isFullscreen = !!fullscreenOn());
			document.addEventListener('fullscreenchange', onFs);
			document.addEventListener('webkitfullscreenchange', onFs);
			return () => {
				window.removeEventListener('pagehide', onFlush);
				document.removeEventListener('visibilitychange', onVisible);
				document.removeEventListener('fullscreenchange', onFs);
				document.removeEventListener('webkitfullscreenchange', onFs);
				clearTimeout(saveTimer);
				clearTimeout(selTimer);
				clearInterval(selPoll);
				try {
					rendition?.destroy();
					epubBook?.destroy();
				} catch {}
				rendition = null;
				epubBook = null;
			};
		}
	});

	async function open() {
		try {
			const { default: ePub, EpubCFI } = await import('epubjs');
			EpubCFICtor = EpubCFI;
			// Fetch the bytes and hand epub.js an ArrayBuffer. A plain URL
			// only works when it ends in `.epub`: determineType() treats an
			// extension-less string as an UNPACKED directory and starts
			// fetching META-INF/container.xml, which 404s and hangs forever.
			const fileRes = await fetch(`/api/books/${encodeURIComponent(book.id)}/file`);
			if (!fileRes.ok) throw new Error('The stored EPUB could not be fetched.');
			epubBook = ePub(await fileRes.arrayBuffer());
			rendition = epubBook.renderTo(mount!, { flow: 'scrolled', spread: 'none', width: '100%', height: '100%' });
			rendition.themes.fontSize(`${scale}%`);
			rendition.on('selected', onSelected);
			rendition.on('relocated', onRelocated);
			rendition.on('touchstart', onTouchStart);
			rendition.on('touchend', onTouchEnd);
			rendition.on('click', onClick);
			// mouseup covers engines that forward no `selected` either; the
			// applySelection CFI dedupe makes the double path harmless.
			rendition.on('mouseup', (_e: any, contents: any) => scheduleSelectionCapture(contents));
			// A desktop gesture always starts with mousedown: it clears the
			// dismissed-range gate so the same words can be re-highlighted.
			rendition.on('mousedown', () => (dismissedCfi = ''));
			// Belt over the forwarded chain: attach the gesture capture to
			// each section's OWN contents the moment it renders, so a miss
			// in rendition's event passing can never silence iOS again.
			rendition.hooks.content.register((contents: any) => {
				if (seenContents.has(contents)) return;
				seenContents.add(contents);
				contents.on('touchend', () => scheduleSelectionCapture(contents));
				contents.on('mouseup', () => scheduleSelectionCapture(contents));
				// Native-dispatch belt: listeners registered from the parent
				// ALWAYS receive real input events over a sandboxed content
				// document — only in-frame script-generated events are
				// isolated there. The timeStamp gate in onTouchEnd makes a
				// double delivery (forwarded + direct) handle exactly once.
				try {
					const doc = contents.document;
					if (doc) {
						doc.addEventListener('touchstart', onTouchStart, { passive: true });
						doc.addEventListener('touchend', (ev: Event) => onTouchEnd(ev, contents), { passive: true });
						doc.addEventListener('mouseup', () => scheduleSelectionCapture(contents), { passive: true });
					}
				} catch {}
			});

			// A failed restore position must not leave a silent blank page:
			// retry at the book's start, and surface the error if that fails.
			try {
				await rendition.display(book.lastCfi || undefined);
			} catch {
				try {
					await rendition.display();
				} catch {
					loadingErr = 'This EPUB could not be rendered.';
				}
			}
			// Measure again after the first paint: Vite dev fonts/CSS can
			// settle after mount, and a 0-px iframe stays blank forever.
			requestAnimationFrame(() => {
				try {
					rendition?.resize();
				} catch {}
			});

			const nav = await epubBook.loaded.navigation;
			toc = flattenToc(nav.toc ?? []);
			// Whole-book percentages: generate in the background; relocated
			// keeps reporting 0% until it finishes.
			void epubBook.locations.generate(640).catch(() => {});
			await tick();
			for (const n of notes) drawHighlight(n);
			ready = true;
			startSelectionPoll();
		} catch (e) {
			loadingErr = (e as Error)?.message ?? 'Could not open this EPUB.';
		}
	}
</script>

<div class="relative h-dvh overflow-hidden bg-white dark:bg-stone-950" bind:this={rootEl}>
	<!-- The book owns the viewport. A definite height chain (h-dvh → h-full)
		is required: epub.js measures the container at mount, and a percentage
		height under only `min-h-dvh` resolves to 0 and renders nothing. -->
	<!-- The book owns the viewport edge-to-edge on phones: side padding
		here showed the dark app background as black "margins" next to the
		white page. Desktop keeps the framing columns. -->
	<div class="mx-auto h-full w-full max-w-3xl px-0 sm:px-6">
		<div bind:this={mount} class="h-full w-full"></div>
	</div>

	{#if loadingErr}
		<div class="absolute inset-0 z-10 grid place-items-center bg-white/95 px-6 dark:bg-stone-950/95">
			<p class="max-w-md rounded-2xl border border-dashed border-rose-300 px-4 py-6 text-center text-sm text-rose-600">{loadingErr}</p>
		</div>
	{:else if !ready}
		<!-- Never a black void while opening: the unzip is real work. -->
		<div class="pointer-events-none absolute inset-0 grid place-items-center">
			<p class="rounded-full border border-stone-200/80 bg-white/85 px-4 py-1.5 text-xs text-stone-500 shadow-sm backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/85 dark:text-stone-400">Opening book…</p>
		</div>
	{/if}

	{#if chromeVisible}
		<!-- Floating chrome: back left, commands right. No bar, no footer. -->
		<div class="fixed top-[max(0.5rem,env(safe-area-inset-top))] right-2 left-2 z-20 flex items-start justify-between">
			<button
				type="button"
				class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stone-200/80 bg-white/85 text-stone-600 shadow-sm backdrop-blur hover:bg-stone-100 dark:border-stone-800/80 dark:bg-stone-900/85 dark:text-stone-300"
				aria-label="Back to Library"
				onclick={() => {
					if (window.history.length > 1) window.history.back();
					else void goto('/admin/library');
				}}
			><ArrowLeft class="h-4 w-4" /></button>
			<div class="flex items-center gap-1 rounded-full border border-stone-200/80 bg-white/85 p-1 shadow-sm backdrop-blur dark:border-stone-800/80 dark:bg-stone-900/85">
				<button type="button" class="grid h-8 w-8 place-items-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" aria-label="Smaller text" onclick={() => applyScale(scale - 10)}><Minus class="h-4 w-4" /></button>
				<button type="button" class="grid h-8 w-8 place-items-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" aria-label="Larger text" onclick={() => applyScale(scale + 10)}><Plus class="h-4 w-4" /></button>
				<span class="h-4 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true"></span>
				<button type="button" class="grid h-8 w-8 place-items-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" aria-pressed={panel === 'toc'} aria-label="Table of contents" onclick={() => (panel = panel === 'toc' ? null : 'toc')}><List class="h-4 w-4" /></button>
				<button type="button" class="relative grid h-8 w-8 place-items-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" aria-pressed={panel === 'notes'} aria-label="Highlights and notes" onclick={() => (panel = panel === 'notes' ? null : 'notes')}>
					<Bookmark class="h-4 w-4" />
					{#if notesTotal > 0}<span class="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-semibold text-stone-900">{notesTotal}</span>{/if}
				</button>
				{#if fsSupported}
					<button type="button" class="grid h-8 w-8 place-items-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" aria-pressed={isFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (hides the browser bars)'} onclick={() => void toggleFullscreen()}>{#if isFullscreen}<Minimize2 class="h-4 w-4" />{:else}<Maximize2 class="h-4 w-4" />{/if}</button>
				{/if}
				<button type="button" class="grid h-8 w-8 place-items-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" aria-label="Hide controls" title="Hide controls (tap the page to show them again)" onclick={() => (chromeVisible = false)}><EyeOff class="h-4 w-4" /></button>
			</div>
		</div>
	{:else}
		<!-- Hidden chrome leaves one small eye at the corner: the page tap
			toggles too, but the affordance must never be invisible. The
			book paper is always light, so this pill stays a light surface
			with a dark icon even in dark mode. -->
		<button
			type="button"
			class="fixed top-[max(0.5rem,env(safe-area-inset-top))] right-2 z-20 grid h-9 w-9 place-items-center rounded-full border border-stone-300/80 bg-white/95 text-stone-700 shadow-md backdrop-blur hover:bg-white hover:text-stone-900"
			aria-label="Show controls"
			onclick={() => (chromeVisible = true)}
		><Eye class="h-4 w-4" /></button>
	{/if}

	{#if panel}
		<!-- The drawer sits under the floating chrome: top padding clears
			the command cluster so both stay tappable. -->
		<aside class="fixed inset-y-0 right-0 z-20 flex w-[min(21rem,100vw)] flex-col border-l border-stone-200 bg-white/98 pt-[3.25rem] backdrop-blur dark:border-stone-800 dark:bg-stone-950/98" aria-label={panel === 'toc' ? 'Table of contents' : 'Highlights and notes'}>
			<div class="flex items-center justify-between px-4 py-2">
				<h2 class="min-w-0 truncate text-xs font-medium uppercase tracking-widest text-stone-500">{panel === 'toc' ? book.title : `Notes (${notesTotal})`}</h2>
				<button type="button" class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close panel" onclick={() => (panel = null)}><X class="h-4 w-4" /></button>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto px-2 pb-6" bind:this={notesScroll}>
				{#if panel === 'toc'}
					{#if toc.length === 0}
						<p class="px-2 py-6 text-center text-sm text-stone-500">This book has no table of contents.</p>
					{:else}
						<ul class="space-y-0.5">
							{#each toc as t (t.href)}
								<li>
									<button
										type="button"
										class="block w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
										style="padding-left: {8 + t.depth * 12}px"
										onclick={() => void goTo(t.href)}
									>{t.label}</button>
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					{#if notes.length === 0}
						<p class="px-2 py-6 text-center text-sm text-stone-500">No highlights yet. Select text in the book to add one.</p>
					{:else}
						<ul class="space-y-2 px-2">
							{#each notes as n (n.id)}
								<li class="rounded-xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
									<button type="button" class="block text-left" onclick={() => void goTo(n.cfi)}>
										<p class="line-clamp-2 text-[12px] italic text-stone-600 dark:text-stone-400">{n.excerpt || 'Highlighted text'}</p>
									</button>
									{#if n.note}<p class="mt-1 whitespace-pre-wrap text-[12px] text-stone-800 dark:text-stone-200">{n.note}</p>{/if}
									<div class="mt-1 flex items-center justify-end gap-1">
										<button type="button" class="rounded px-2 py-0.5 text-[11px] font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800" onclick={() => openEditor(n.id)}>Edit</button>
										<button type="button" class="grid h-6 w-6 place-items-center rounded text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove note" onclick={() => void removeNote(n)}><Trash2 class="h-3.5 w-3.5" /></button>
									</div>
								</li>
							{/each}
						</ul>
						{#if notesHasMore}
							<div bind:this={notesSentinel} class="py-2 text-center text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
								{loadingNotes ? 'Loading…' : `${notes.length} of ${notesTotal} shown`}
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		</aside>
	{/if}

	<!-- Chapter navigation: bottom corners, thumb-reachable. Hidden with the
		chrome, and while the selection toolbar owns the bottom. -->
	{#if ready && chromeVisible && !selection && !editing}
		<div class="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-center justify-between px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
			<button
				type="button"
				class="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-stone-200/70 bg-white/70 text-stone-500 shadow-sm backdrop-blur transition hover:bg-white active:scale-95 motion-reduce:transition-none dark:border-stone-800/70 dark:bg-stone-900/70 dark:text-stone-400 dark:hover:bg-stone-900"
				aria-label="Previous chapter"
				onclick={() => void rendition?.prev()}
			><ChevronLeft class="h-5 w-5" /></button>
			<button
				type="button"
				class="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-stone-200/70 bg-white/70 text-stone-500 shadow-sm backdrop-blur transition hover:bg-white active:scale-95 motion-reduce:transition-none dark:border-stone-800/70 dark:bg-stone-900/70 dark:text-stone-400 dark:hover:bg-stone-900"
				aria-label="Next chapter"
				onclick={() => void rendition?.next()}
			><ChevronRight class="h-5 w-5" /></button>
		</div>
	{/if}
</div>

<!-- Selection toolbar: appears after text is chosen, chrome hidden or not. -->
{#if selection}
	<div class="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
		<div class="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-800 dark:bg-stone-900">
			<p class="line-clamp-2 px-1 pb-1.5 text-[12px] italic text-stone-500">{selection.text}</p>
			{#if composing}
				<textarea
					class="mb-1.5 min-h-16 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
					placeholder="Your note…"
					bind:value={noteDraft}
				></textarea>
			{/if}
			<div class="flex items-center justify-end gap-1">
				<button type="button" class="rounded-full px-2.5 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onclick={clearSelection}>Cancel</button>
				{#if composing}
					<button type="button" class="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-700" onclick={() => void addHighlight(true)}>Save note</button>
				{:else}
					<button type="button" class="rounded-full px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onclick={() => void addHighlight(true)}>+ Note</button>
					<button type="button" class="rounded-full bg-amber-400 px-3 py-1 text-xs font-medium text-stone-900 hover:bg-amber-300" onclick={() => void addHighlight(false)}>Highlight</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Note editor overlay for saved highlights. -->
{#if editing}
	<div
		class="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 backdrop-blur-md dark:bg-black/60 sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Edit note"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) editing = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') editing = null; }}
	>
		<div class="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl dark:bg-stone-900 sm:rounded-2xl">
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-xs font-medium uppercase tracking-widest text-stone-500">Note</h3>
				<button type="button" class="grid h-7 w-7 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close" onclick={() => (editing = null)}><X class="h-4 w-4" /></button>
			</div>
			<p class="mb-2 line-clamp-3 text-[12px] italic text-stone-500">{editing.excerpt}</p>
			<textarea
				class="min-h-24 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
				placeholder="Your note…"
				bind:value={editText}
			></textarea>
			<div class="mt-3 flex items-center justify-between">
				<button type="button" class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" onclick={() => { const n = editing; if (n) void removeNote(n); }}><Trash2 class="h-3.5 w-3.5" /> Remove</button>
				<button type="button" class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-700" onclick={() => void saveEdit()}>Save</button>
			</div>
		</div>
	</div>
{/if}

<!-- Mark action sheet: one tap on a highlight. Same dialog standard as
	NoteActionsMenu (backdrop fade, panel fly, Escape + backdrop close). -->
{#if markMenu}
	<div
		class="fixed inset-0 z-40 grid place-items-end bg-stone-900/40 backdrop-blur-md dark:bg-black/60 p-4 sm:place-items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Highlight actions"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) markMenu = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') markMenu = null; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white p-2 shadow-xl dark:bg-stone-900" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<div class="px-3.5 pb-2 pt-3">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Highlight</h2>
				<p class="mt-0.5 line-clamp-2 text-xs italic text-stone-500 dark:text-stone-400">{markMenu.excerpt || 'Highlighted text'}</p>
				{#if markMenu.note}<p class="mt-1 line-clamp-2 text-xs text-stone-600 dark:text-stone-300">{markMenu.note}</p>{/if}
			</div>
			<div class="flex flex-col">
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
					onclick={markMenuEdit}
				><Pencil class="h-4 w-4" /> {markMenu.note ? 'Edit note' : 'Add note'}</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
					onclick={markMenuDelete}
				><Trash2 class="h-4 w-4" /> Delete highlight</button>
			</div>
		</div>
	</div>
{/if}
