import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import Timer from '@lucide/svelte/icons/timer';
import SquarePen from '@lucide/svelte/icons/square-pen';
import LibraryBig from '@lucide/svelte/icons/library-big';
import KeyRound from '@lucide/svelte/icons/key-round';
import { newNote } from '$lib/new-note.svelte';
import { vault } from '$lib/vault.svelte';
import type { Note } from '$lib/types';

export interface MiniAppDef {
	id: string;
	label: string;
	description: string;
	/** `link` navigates to `href`; `modal` opens UI in place, with no page. */
	kind: 'link' | 'modal';
	href?: string;
	/** `Mod` renders as ⌘ on Apple and Ctrl elsewhere. Keys live in
	 *  `src/lib/shortcuts.ts` so the help dialog stays in step. */
	shortcut?: string[];
	icon: Component;
}


type Usage = { count: number; lastUsedAt: number };

const USAGE_KEY = 'fermentario.miniAppsUsage';

function readUsage(): Record<string, Usage> {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(USAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, Usage>;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function writeUsage(value: Record<string, Usage>) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(USAGE_KEY, JSON.stringify(value));
	} catch {}
}

export const MINI_APPS: MiniAppDef[] = [
	{
		id: 'new-note',
		label: 'New note',
		description: 'Write in the journal from any page.',
		kind: 'modal',
		shortcut: ['Mod', 'Shift', 'L'],
		icon: SquarePen
	},
	{
		id: 'time-tracker',
		label: 'Time tracker',
		description: 'Measure time spent on tasks.',
		kind: 'link',
		href: '/tools/time-tracker',
		icon: Timer
	},
	{
		id: 'vault',
		label: 'Password vault',
		description: 'Open and search a KeePass database.',
		kind: 'modal',
		icon: KeyRound
	},
	{
		id: 'library',
		label: 'Library',
		description: 'Read your EPUB books and documents.',
		kind: 'link',
		href: '/tools/library',
		icon: LibraryBig
	}
];

class MiniAppsStore {
	open = $state(false);
	usage = $state<Record<string, Usage>>({});
	latestNote = $state<Note | null>(null);
	latestNoteLoaded = $state(false);
	latestNoteLoading = $state(false);
	private latestNoteRequest: Promise<void> | null = null;

	loadUsage() {
		this.usage = readUsage();
	}

	recordUse(id: string) {
		const prev = this.usage[id] ?? { count: 0, lastUsedAt: 0 };
		const next = {
			...this.usage,
			[id]: { count: prev.count + 1, lastUsedAt: Date.now() }
		};
		this.usage = next;
		writeUsage(next);
	}

	latestUsedId(): string | null {
		let best: string | null = null;
		let at = 0;
		for (const [id, u] of Object.entries(this.usage)) {
			if (u.lastUsedAt > at) {
				at = u.lastUsedAt;
				best = id;
			}
		}
		return best;
	}

	orderedApps(): MiniAppDef[] {
		const usage = this.usage;
		return [...MINI_APPS]
			.sort((a, b) => {
			if (a.id === 'new-note') return -1;
			if (b.id === 'new-note') return 1;
			const au = usage[a.id];
			const bu = usage[b.id];
			const ac = au?.count ?? 0;
			const bc = bu?.count ?? 0;
			if (bc !== ac) return bc - ac;
			const al = au?.lastUsedAt ?? 0;
			const bl = bu?.lastUsedAt ?? 0;
			if (bl !== al) return bl - al;
			return a.label.localeCompare(b.label);
		});
	}

	openModal() {
		this.loadUsage();
		this.open = true;
		this.latestNoteLoaded = false;
		void this.loadLatestNote();
	}

	async loadLatestNote() {
		if (this.latestNoteRequest) return this.latestNoteRequest;
		this.latestNoteLoading = true;
		this.latestNoteRequest = (async () => {
			try {
				const res = await fetch('/api/notes/latest');
				if (!res.ok) throw new Error('Could not load latest note');
				const data = (await res.json()) as { note: Note | null };
				this.latestNote = data.note;
				this.latestNoteLoaded = true;
			} catch {
				// Keep the picker usable when the latest-note request fails.
			} finally {
				this.latestNoteLoading = false;
				this.latestNoteRequest = null;
			}
		})();
		return this.latestNoteRequest;
	}

	closeModal() {
		this.open = false;
	}
}

export const miniApps = new MiniAppsStore();

/** One entry point for the app picker, the search palette and the homepage:
 *  record the use, close the picker, then navigate or open the modal. */
export function openMiniApp(app: MiniAppDef) {
	miniApps.recordUse(app.id);
	miniApps.closeModal();
	if (app.kind === 'modal') {
		if (app.id === 'vault') {
			vault.openModal();
			return;
		}
		if (app.id === 'new-note') {
			newNote.openModal();
			return;
		}
		return;
	}
	if (app.href) void goto(app.href);
}

export async function openLatestNote() {
	if (!miniApps.latestNoteLoaded) await miniApps.loadLatestNote();
	const note = miniApps.latestNote;
	miniApps.closeModal();
	if (note) void goto(`/admin/notes/${encodeURIComponent(note.id)}`);
}
