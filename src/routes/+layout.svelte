<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import NavigationLoader from '$lib/components/NavigationLoader.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import MiniAppsFab from '$lib/components/MiniAppsFab.svelte';
	import MiniAppsModal from '$lib/components/MiniAppsModal.svelte';
	import NewNoteModal from '$lib/components/NewNoteModal.svelte';
	import HelpModal from '$lib/components/HelpModal.svelte';
	import { help } from '$lib/help.svelte';
	import { SLOGAN } from '$lib/brand';
	import { timeTracker } from '$lib/time-tracker.svelte';
	import { newNote } from '$lib/new-note.svelte';
	import { applyStoredTheme, watchSystemTheme } from '$lib/theme';
	let { children } = $props();

	/** The EPUB reader owns the whole viewport: no global button over it. */
	const hideMiniApps = $derived(page.url.pathname.startsWith('/admin/book/'));

	/** The dialog on top: highest z-index, and later in the DOM on a tie, so an
	 *  inner layer (FieldHelp at z-60, a menu inside a modal) wins. A dialog can
	 *  opt out with `data-escape="ignore"`. */
	function topDialog(): HTMLElement | null {
		let best: HTMLElement | null = null;
		let bestZ = -Infinity;
		for (const d of document.querySelectorAll<HTMLElement>('[role="dialog"]')) {
			if (d.dataset.escape === 'ignore' || d.getAttribute('aria-hidden') === 'true') continue;
			const rect = d.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) continue;
			const z = Number(getComputedStyle(d).zIndex);
			const score = Number.isFinite(z) ? z : 0;
			if (score >= bestZ) {
				best = d;
				bestZ = score;
			}
		}
		return best;
	}

	/** A replayed Escape, so no window listener acts on it a second time. */
	const replays = new WeakSet<Event>();

	/** Every modal handles Escape on its dialog root, and Svelte delegates
	 *  `keydown` to the document, so a dialog only sees the key when focus is
	 *  inside it. Focus often stays on the button that opened the modal — or on
	 *  the body after a click on a heading — and then Escape did nothing at all.
	 *  Replay the key into the topmost dialog when nothing else handled it: each
	 *  modal keeps its own logic (full screen collapses first, `saving` blocks,
	 *  finders close first) and a new modal needs no extra wiring. */
	function onEscapeKey(e: KeyboardEvent) {
		if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || replays.has(e)) return;
		const top = topDialog();
		if (!top) return;
		// A dialog that contains the target already ran its own handler.
		if (e.target instanceof Node && top.contains(e.target)) return;
		e.preventDefault();
		const replay = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		replays.add(replay);
		top.dispatchEvent(replay);
	}

	/** Stop a replay at the document: Svelte's delegate has run by then, and the
	 *  other window listeners (search, admin settings) must not see the key twice. */
	function onDocumentKeydown(e: KeyboardEvent) {
		if (replays.has(e)) e.stopPropagation();
	}

	/** A dialog that opens without taking focus leaves it on the button that
	 *  opened it, so its own Escape (and Tab) never applied. Give every new
	 *  dialog focus once, unless something inside it already has it. */
	function focusNewDialogs(records: MutationRecord[]) {
		for (const record of records) {
			for (const node of record.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				const dialogs = node.matches('[role="dialog"]')
					? [node]
					: Array.from(node.querySelectorAll<HTMLElement>('[role="dialog"]'));
				for (const dialog of dialogs) {
					requestAnimationFrame(() => {
						if (!dialog.isConnected || dialog.contains(document.activeElement)) return;
						if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
						dialog.focus({ preventScroll: true });
					});
				}
			}
		}
	}

	/** Global shortcuts stay out of text fields and open dialogs. */
	function onGlobalKeydown(e: KeyboardEvent) {
		onEscapeKey(e);
		if (hideMiniApps || e.isComposing) return;
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
			const t = e.target as HTMLElement | null;
			if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
			if (document.querySelector('[role="dialog"]')) return;
			e.preventDefault();
			newNote.openModal();
			return;
		}
	}

	// app.html applies the theme before first paint. Re-applying on mount keeps
	// the document in sync after hydration, and the watcher follows the OS
	// preference while the user keeps the `system` choice.
	onMount(() => {
		applyStoredTheme();
		newNote.loadDraft();
		try {
			localStorage.removeItem('fermentario.quickNote');
			localStorage.removeItem('fermentario.quickNote.full');
		} catch {
			// Storage may be blocked; the retired scratchpad is no longer read.
		}
		// The button shows the running dot on every page, so the tracker state
		// must exist here and not only in the pages that mount its bar.
		if (!timeTracker.loaded) void timeTracker.load();
		document.addEventListener('keydown', onDocumentKeydown);
		const observer = new MutationObserver(focusNewDialogs);
		observer.observe(document.body, { childList: true, subtree: true });
		const stopTheme = watchSystemTheme();
		return () => {
			document.removeEventListener('keydown', onDocumentKeydown);
			observer.disconnect();
			stopTheme();
		};
	});
</script>

<svelte:head>
	<title>fermentario</title>
	<meta name="description" content={SLOGAN} />
	<!-- `src/lib/assets/favicon.svg` is the SvelteKit starter's logo and is not
	     referenced by anything. This is the real one. Root-relative on purpose:
	     `%sveltekit.assets%` is not substituted by this SvelteKit version, and
	     the browser then requests `/%sveltekit.assets%/favicon.svg`, which makes
	     the dev server throw `URIError: URI malformed` from decodeURI. -->
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</svelte:head>

<svelte:window onkeydown={onGlobalKeydown} />

{@render children()}
<NewNoteModal />
{#if help.open}
	<HelpModal onClose={() => help.closeModal()} />
{/if}
{#if !hideMiniApps}
	<MiniAppsFab />
	<MiniAppsModal />
{/if}
<GlobalSearch />
<NavigationLoader />
<Toasts />
