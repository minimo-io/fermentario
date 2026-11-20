/** Fold model for note rows. One standard for every list surface: the admin
 *  timelines, the tag pages and the public homepage all render the same ids,
 *  so the collapsed map and its storage key are module-shared. A per-instance
 *  map with one shared key let the last fold wipe earlier ones.
 *
 *  Each `NoteBody` row owns its DOM refs and measurements (one note per
 *  instance); only the folded ids are global. */
import { tick } from 'svelte';
import { motionMs } from '$lib/motion';

const COLLAPSED_KEY = 'ferm:collapsed-notes';

const collapsed = $state<Record<string, boolean>>({});
let loaded = false;

function loadOnce() {
	if (loaded) return;
	loaded = true;
	try {
		const raw = localStorage.getItem(COLLAPSED_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return;
		for (const id of parsed) {
			if (typeof id === 'string') collapsed[id] = true;
		}
	} catch {
		// Bad storage never breaks a note.
	}
}

function persistFolded() {
	try {
		localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Object.keys(collapsed)));
	} catch {
		// Storage full/blocked: the fold still works for the session.
	}
}

export function createNoteFold() {
	let textEls = $state<Record<string, HTMLElement | null>>({});
	let foldEls = $state<Record<string, HTMLElement | null>>({});
	let foldable = $state<Record<string, boolean>>({});
	let maxHeights = $state<Record<string, string>>({});
	let unclamped = $state<Record<string, boolean>>({});

	$effect(() => {
		loadOnce();
	});

	$effect(() => {
		// Measure after the DOM updates: widening the window can turn a
		// multi-line note back into a single-line one.
		const onResize = () => measureFoldable();
		onResize();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	function measureFoldable() {
		// Measure unfolded notes only: a persisted fold is trusted as-is and
		// gets re-measured the moment it is expanded.
		for (const id of Object.keys(textEls)) {
			const el = textEls[id];
			if (!el) continue;
			const lh = parseFloat(getComputedStyle(el).lineHeight) || 20.6;
			if (id in collapsed) {
				// A reloaded fold carries only the flag; WebKit under-clamps
				// with the flag alone and shows the card half contracted.
				if (maxHeights[id] === undefined) maxHeights[id] = `${Math.ceil(lh)}px`;
				continue;
			}
			if (maxHeights[id] !== undefined) continue;
			// Unfolded: content height over one and a half lines = foldable.
			foldable[id] = el.getBoundingClientRect().height > lh * 1.5;
		}
	}

	function finishFold(id: string, e: TransitionEvent) {
		if (e.target !== e.currentTarget || e.propertyName !== 'max-height') return;
		// Keep the one-line cap while the note stays folded: clearing it here
		// leaves one frame where the wrapper has no cap before the clamp
		// paints, so a folded card flickers back to full height (WebKit).
		if (id in collapsed) {
			delete unclamped[id];
			return;
		}
		delete maxHeights[id];
		delete unclamped[id];
		measureFoldable();
	}

	async function toggle(id: string) {
		const wrapper = foldEls[id];
		const duration = motionMs(180);

		if (!wrapper || !duration) {
			if (id in collapsed) {
				foldable[id] = true;
				delete collapsed[id];
			} else {
				collapsed[id] = true;
			}
			persistFolded();
			delete maxHeights[id];
			delete unclamped[id];
			return;
		}

		const start = wrapper.getBoundingClientRect().height;

		if (id in collapsed) {
			foldable[id] = true;
			delete collapsed[id];
			persistFolded();
			maxHeights[id] = `${start}px`;
			await tick();
			void wrapper.getBoundingClientRect();
			const full = Math.max(wrapper.scrollHeight, textEls[id]?.getBoundingClientRect().height ?? 0);
			maxHeights[id] = `${full}px`;
		} else {
			collapsed[id] = true;
			persistFolded();
			unclamped[id] = true;
			maxHeights[id] = `${start}px`;
			await tick();
			void wrapper.getBoundingClientRect();
			const line = parseFloat(getComputedStyle(textEls[id] ?? wrapper).lineHeight) || 20.6;
			maxHeights[id] = `${Math.ceil(line)}px`;
		}
	}

	return {
		get collapsed() {
			return collapsed;
		},
		get textEls() {
			return textEls;
		},
		get foldEls() {
			return foldEls;
		},
		get foldable() {
			return foldable;
		},
		get maxHeights() {
			return maxHeights;
		},
		get unclamped() {
			return unclamped;
		},
		toggle,
		finishFold
	};
}
