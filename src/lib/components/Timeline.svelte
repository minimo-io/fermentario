<script module lang="ts">
	// Fold state is module-shared on purpose: the home page (and tag pages)
	// mount MORE THAN ONE timeline at once (featured section + history), all
	// holding the same storage key. One shared map loaded once is the only
	// way no instance's write can clobber another instance's folds.
	let collapsed = $state<Record<string, boolean>>({});
	let foldedLoaded = false;
	const COLLAPSED_KEY = 'ferm:collapsed-notes';

	// Comment-count deltas are module-shared for the same reason: the same
	// note renders in the featured section AND the history list, and both
	// pills must show the same number without waiting for a reload.
	let commentDelta = $state<Record<string, number>>({});

	function loadFoldedOnce() {
		if (foldedLoaded) return;
		foldedLoaded = true;
		try {
			const raw = localStorage.getItem(COLLAPSED_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as unknown;
			if (!Array.isArray(parsed)) return;
			for (const id of parsed) {
				if (typeof id === 'string') collapsed[id] = true;
			}
		} catch {
			// Bad storage never breaks the timeline.
		}
	}

	function persistFolded() {
		try {
			localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Object.keys(collapsed)));
		} catch {
			// Storage full/blocked: the fold still works for the session.
		}
	}

	function toggleFolded(id: string) {
		if (id in collapsed) delete collapsed[id];
		else collapsed[id] = true;
		persistFolded();
	}
</script>

<script lang="ts">
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Star from '@lucide/svelte/icons/star';
	import type { Note } from '$lib/types';
	import { goto } from '$app/navigation';
	import { dayLocale } from '$lib/dates';
	import { inlineMarkdown } from '$lib/markdown-inline';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EditNoteDialog from '$lib/components/EditNoteDialog.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import NoteActionsMenu from '$lib/components/NoteActionsMenu.svelte';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import TagChip from '$lib/components/TagChip.svelte';
	import VideoPill from '$lib/components/VideoPill.svelte';
	import { youTubeWatchUrl } from '$lib/youtube';

	type Props = {
		notes: Note[];
		summaryLoading: boolean;
		onDelete: (id: string) => void;
		onEdit: (id: string, content: string, video?: string) => Promise<void>;
		onFeature: (note: Note) => void;
		onLoadMore?: () => void;
		hasMore?: boolean;
		loadingMore?: boolean;
		onRemoveTag?: (noteId: string, tag: string) => void;
	lang: string;
	};
	let {
		notes,
		summaryLoading,
		onDelete,
		onEdit,
		onFeature,
		onLoadMore,
		hasMore,
		loadingMore,
		onRemoveTag,
		lang
	}: Props = $props();

	let speakingId = $state<string | null>(null);
	let menuNote = $state<Note | null>(null);
	let confirmNote = $state<Note | null>(null);
	let editNote = $state<Note | null>(null);
	let editContent = $state('');
	let editVideo = $state('');
	let tagTarget = $state<{ note: Note; tag: string } | null>(null);

	// Folded notes: one rendered line (CSS line-clamp), folded on tap,
	// expanded on tap again. Fold ids persist in localStorage (module-shared
	// map above) until the user expands them again — page reloads keep the
	// fold. Default is expanded; only notes longer than one rendered line
	// are foldable, so short notes stay plain text. Opening a note lives in
	// the ⋮ menu.
	let textEls: Record<string, HTMLElement | null> = {};
	let foldable = $state<Record<string, boolean>>({});

	$effect(() => {
		loadFoldedOnce();
	});

	$effect(() => {
		// Measure after the DOM updates: widening the window can turn a
		// multi-line note back into a single-line one. A fold maps id → true.
		const onResize = () => void measureFoldable();
		onResize();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	function measureFoldable() {
		// Measure unfolded notes only: a persisted fold is trusted as-is
		// (clamped content cannot be measured reliably in every engine) and
		// gets re-measured the moment it is expanded.
		for (const n of notes) {
			if (n.id in collapsed) continue;
			const el = textEls[n.id];
			if (!el) continue;
			// Unfolded: content height over one and a half line = foldable.
			const lh = parseFloat(getComputedStyle(el).lineHeight) || 20.6;
			foldable[n.id] = el.getBoundingClientRect().height > lh * 1.5;
		}
	}

	// Comments follow the one modal standard: the modal only takes text for
	// ONE new comment and closes on success; the list lives on the note's
	// own page. The pill just counts and opens the input. The delta map is
	// module-shared so both mounted timelines show the same count.
	let commenting = $state<Note | null>(null);

	/** Display count: server count plus what this session added. */
	function commentCount(n: Note): number {
		return Math.max(0, (n.commentCount ?? 0) + (commentDelta[n.id] ?? 0));
	}

	async function addComment(text: string): Promise<boolean> {
		if (!commenting) return false;
		const id = commenting.id;
		try {
			const res = await fetch(`/api/notes/${id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			});
			if (!res.ok) return false;
			commentDelta[id] = (commentDelta[id] ?? 0) + 1;
			return true;
		} catch {
			return false;
		}
	}

	function openEdit(n: Note) {
		menuNote = null;
		editNote = n;
		editContent = n.content;
		// Prefill the URL, not the stored id: the id would fail the API's URL
		// check on a text-only edit.
		editVideo = n.video ? youTubeWatchUrl(n.video) : '';
	}

	function speakNote(id: string, content: string) {
		if (speakingId === id) {
			window.speechSynthesis.cancel();
			speakingId = null;
			return;
		}
		window.speechSynthesis.cancel();
		const u = new SpeechSynthesisUtterance(content);
		u.rate = 0.98;

		u.lang = lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US';
		u.onend = () => (speakingId = null);
		u.onerror = () => (speakingId = null);
		window.speechSynthesis.speak(u);
		speakingId = id;
	}

	const locale = $derived(dayLocale(lang));

	function isoDay(d: Date): string {
		return d.toLocaleDateString('en-CA');
	}

	function formatDay(d: Date): string {
		return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function formatDayLong(d: Date): string {
		return d.toLocaleDateString(locale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	// Ticked so "Today" and "Yesterday" roll over at midnight while the app is
	// left open, without regrouping the notes.
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 60000);
		return () => clearInterval(timer);
	});
	const todayKey = $derived(isoDay(new Date(now)));
	const yesterdayKey = $derived.by(() => {
		const d = new Date(now);
		d.setDate(d.getDate() - 1);
		return isoDay(d);
	});

	let dayGroups = $derived.by(() => {
		const groups = new Map<string, (Note & { hour: string })[]>();
		for (const n of notes) {
			const d = new Date(n.created_at);
			const day = isoDay(d);
			const item = { ...n, hour: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) };
			const list = groups.get(day);
			if (list) list.push(item);
			else groups.set(day, [item]);
		}
		return [...groups.entries()].map(([day, items]) => {
			const date = new Date(items[0].created_at);
			return {
				day,
				items,
				label: day === todayKey ? 'Today' : day === yesterdayKey ? 'Yesterday' : formatDay(date),
				title: formatDayLong(date)
			};
		});
	});
</script>

{#if summaryLoading}
	<div class="mb-2 px-2 py-1 text-xs text-amber-600">Building your weekly recap…</div>
{/if}

{#snippet commentPill(n: Note)}
	<button
		type="button"
		class="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] tabular-nums text-stone-500 hover:bg-stone-200"
		aria-haspopup="dialog"
		aria-label="Comments on this note"
		onclick={() => (commenting = n)}
	><MessageCircle class="h-3 w-3" /> {commentCount(n)}</button>
{/snippet}

{#each dayGroups as group (group.day)}
	<section class="mb-4">
		<h2
			class="mb-1 text-xs font-medium tracking-widest text-stone-400"
			title={group.title}
		>{group.label}</h2>
		<ul class="space-y-3">
			{#each group.items as n (n.id)}
				<li>
					<div
						class="relative flex items-start gap-3 rounded-2xl border bg-white/70 px-4 py-3 max-sm:flex-col max-sm:gap-1 {n.pending ? 'opacity-60' : ''} {n.featured ? 'border-amber-400' : 'border-stone-200/80'}"
						aria-busy={n.pending ? 'true' : undefined}
					>
						<span class="mt-px flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-stone-400">{#if n.featured}<Star class="h-3 w-3 fill-amber-400 text-amber-400" aria-label="Featured" />{/if}<span class="">{n.hour}</span></span>
						<div class="flex min-w-0 flex-1 items-start gap-3 max-sm:w-full">
						<div class="min-w-0 flex-1">
							{#if n.id in collapsed}
								<button
									type="button"
									bind:this={textEls[n.id]}
									class="w-full text-left whitespace-pre-wrap text-[15px] leading-snug text-stone-800 line-clamp-1"
									aria-expanded="false"
									onclick={() => toggleFolded(n.id)}
								>
									{@html inlineMarkdown(n.content)}
								</button>
							{:else if foldable[n.id]}
								<button
									type="button"
									bind:this={textEls[n.id]}
									class="block w-full text-left whitespace-pre-wrap text-[15px] leading-snug text-stone-800"
									aria-expanded="true"
									onclick={() => toggleFolded(n.id)}
								>
									{@html inlineMarkdown(n.content)}
								</button>
							{:else}
								<p bind:this={textEls[n.id]} class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800">{@html inlineMarkdown(n.content)}</p>
							{/if}
							{#if n.video}
								<div class="mt-2"><VideoPill id={n.video} /></div>
							{/if}
							{#if n.tags?.length}
								<div class="mt-2 flex flex-wrap gap-1">
									{#each n.tags as tag (tag)}
										{#if onRemoveTag}
											<TagChip {tag} onRemove={(t) => (tagTarget = { note: n, tag: t })} />
										{:else}
											<TagChip {tag} />
										{/if}
									{/each}
								</div>
							{/if}
							{#if n.updated_at > n.created_at}
								<div
									class="mt-1 text-left text-[10px] uppercase tracking-wide text-stone-400 sm:text-right"
									title={new Date(n.updated_at).toLocaleString(locale, {
										day: 'numeric',
										month: 'short',
										year: 'numeric',
										hour: '2-digit',
										minute: '2-digit'
									})}
								>
									edited
								</div>
							{/if}
							{#if !n.pending}
								<div class="mt-1.5 flex justify-end sm:hidden">{@render commentPill(n)}</div>
							{/if}
						</div>
						{#if !n.pending}
							<div class="ml-auto max-sm:hidden">{@render commentPill(n)}</div>
						{/if}
						{#if n.pending}
							<LoaderCircle class="max-sm:absolute max-sm:top-1 max-sm:right-2 mt-0.5 h-5 w-5 shrink-0 animate-spin text-stone-400" aria-label="Saving" />
						{:else}
							<button
								type="button"
								class="max-sm:absolute max-sm:top-1 max-sm:right-2 max-sm:bg-white/90 grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-300 hover:bg-stone-100 hover:text-stone-600"
								aria-label="Note actions"
								onclick={() => (menuNote = n)}
							>
								<EllipsisVertical class="h-5 w-5" />
							</button>
						{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/each}

{#if hasMore && onLoadMore}
	<div class="flex justify-center pb-2">
		<button
			type="button"
			class="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-60"
			disabled={loadingMore}
			onclick={() => onLoadMore()}
		>
			{#if loadingMore}
				<LoaderCircle class="h-3.5 w-3.5 animate-spin" /> Loading…
			{:else}
				Load more
			{/if}
		</button>
	</div>
{/if}

{#if menuNote}
	<NoteActionsMenu
		note={menuNote}
		onOpen={(n) => { const id = n.id; menuNote = null; void goto(`/notes/${id}`); }}
		onListen={(n) => { speakNote(n.id, n.content); menuNote = null; }}
		onEdit={(n) => { openEdit(n); }}
		onDelete={(n) => { menuNote = null; confirmNote = n; }}
		onFeature={(n) => { menuNote = null; onFeature(n); }}
		onClose={() => (menuNote = null)}
	/>
{/if}
{#if editNote}
	{@const editing = editNote}
	<EditNoteDialog
		note={editing}
		content={editContent}
		video={editVideo}
		onContent={(v) => (editContent = v)}
		onVideo={(v) => (editVideo = v)}
		onSave={async (content, video) => {
			await onEdit(editing.id, content, video);
			editNote = null;
		}}
		onCancel={() => (editNote = null)}
	/>
{/if}
{#if confirmNote}
	<ConfirmDialog
		title="Delete this note?"
		message="This will permanently remove the entry. You cannot undo this."
		onConfirm={() => { if (confirmNote) onDelete(confirmNote.id); confirmNote = null; }}
		onCancel={() => (confirmNote = null)}
	/>
{/if}
{#if commenting}
	<CommentModal
		onAdd={addComment}
		onClose={() => (commenting = null)}
	/>
{/if}
{#if tagTarget}
	{@const target = tagTarget}
	<ConfirmDialog
		title="Remove #{target.tag}?"
		message="The tag is removed from this note only. The note itself stays, and other notes with #{target.tag} are not affected."
		confirmLabel="Remove tag"
		confirmTone="danger"
		onConfirm={() => { onRemoveTag?.(target.note.id, target.tag); tagTarget = null; }}
		onCancel={() => (tagTarget = null)}
	/>
{/if}
