<script module lang="ts">
	// Comment-count deltas are module-shared: the same note renders in the
	// featured section AND the history list, and both pills must show the same
	// number without waiting for a reload. Fold state lives in note-fold.
	let commentDelta = $state<Record<string, number>>({});
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Star from '@lucide/svelte/icons/star';
	import type { Note } from '$lib/types';
	import { goto } from '$app/navigation';
	import { dayLocale } from '$lib/dates';
	import { withTrailingHashtags } from '$lib/hashtags';
	import NoteBody from '$lib/components/NoteBody.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NoteEditorModal from '$lib/components/NoteEditorModal.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import NoteActionsMenu from '$lib/components/NoteActionsMenu.svelte';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import { youTubeWatchUrl } from '$lib/youtube';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { preferredSpeechVoiceURI, speakText, speechStartedMessage, type SpeechLang } from '$lib/speech';

	type Props = {
		notes: Note[];
		onDelete: (id: string) => void;
		onEdit: (id: string, content: string, video?: string, createdAt?: number, title?: string) => Promise<void>;
		onFeature: (note: Note) => void;
		onPublish: (note: Note) => void;
		onToggleMonospace: (note: Note) => Promise<void>;
		onCover: (note: Note, coverId: string | null) => void;
		onLoadMore?: () => void;
		hasMore?: boolean;
		loadingMore?: boolean;
		onRemoveTag?: (noteId: string, tag: string) => void;
	lang: string;
	};
	let {
		notes,
		onDelete,
		onEdit,
		onFeature,
		onPublish,
		onToggleMonospace,
		onCover,
		onLoadMore,
		hasMore,
		loadingMore,
		onRemoveTag,
		lang
	}: Props = $props();

	let speakingId = $state<string | null>(null);
	let speechGeneration = 0;
	let menuNote = $state<Note | null>(null);
	let confirmNote = $state<Note | null>(null);
	let editNote = $state<Note | null>(null);
	let editTitle = $state('');
	let editContent = $state('');
	let editVideo = $state('');
	let tagTarget = $state<{ note: Note; tag: string } | null>(null);

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
			const res = await loading.track(fetch(`/api/notes/${id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			}));
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
		editTitle = n.title ?? '';
		editContent = withTrailingHashtags(n.content, n.tags);
		// Prefill the URL, not the stored id: the id would fail the API's URL
		// check on a text-only edit.
		editVideo = n.video ? youTubeWatchUrl(n.video) : '';
	}

	async function uploadCover(n: Note, cover: string | null) {
		if (cover === null) {
			await loading.track(fetch(`/api/notes/${n.id}/photo`, { method: 'DELETE' }));
			onCover(n, null);
			return;
		}
		const res = await loading.track(fetch(`/api/notes/${n.id}/photo`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ photo: cover })
		}));
		const d = await res.json();
		if (!res.ok) throw new Error(d?.error ?? 'Could not save the cover image.');
		onCover(n, d.id as string);
	}

	let stopSpeech: (() => void) | null = null;
	onDestroy(() => {
		speechGeneration += 1;
		stopSpeech?.();
	});
	function speakNote(id: string, content: string) {
		speechGeneration += 1;
		const generation = speechGeneration;
		if (speakingId === id) {
			stopSpeech?.();
			stopSpeech = null;
			speakingId = null;
			return;
		}
		stopSpeech?.();
		const speechLang: SpeechLang = lang === 'es' || lang === 'pt' ? lang : 'en';
		const result = speakText(content, speechLang, preferredSpeechVoiceURI(), () => {
			if (speechGeneration === generation) showToast(speechStartedMessage(speechLang), 'success');
		}, () => {
			if (speechGeneration !== generation) return;
			speakingId = null;
			stopSpeech = null;
		}, (message) => {
			if (speechGeneration !== generation) return;
			speakingId = null;
			stopSpeech = null;
			showToast(message);
		});
		if (typeof result === 'string') {
			speakingId = null;
			showToast(result);
			return;
		}
		stopSpeech = result;
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


{#snippet commentPill(n: Note)}
	<button
		type="button"
		class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] tabular-nums {commentCount(n) > 0 ? 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'}"
		aria-haspopup="dialog"
		aria-label="Comments on this note"
		onclick={() => (commenting = n)}
	><MessageCircle class="h-3 w-3" /> {commentCount(n)}</button>
{/snippet}

{#each dayGroups as group (group.day)}
	<section class="mb-4">
		<h2
			class="mb-1 text-xs font-medium tracking-widest text-stone-400 dark:text-stone-500"
			title={group.title}
		>{group.label}</h2>
		<ul class="space-y-3">
			{#each group.items as n (n.id)}
				<li>
					<div
						class="rounded-2xl border bg-white/70 dark:bg-stone-900/70 px-4 py-3 {n.pending ? 'opacity-60' : ''} {n.featured ? 'border-amber-400' : 'border-stone-200/80 dark:border-stone-800/80'}"
						aria-busy={n.pending ? 'true' : undefined}
					>
						<div class="flex min-h-7 items-center gap-2 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
							{#if n.featured}<Star class="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />{/if}
							{#if n.pending}
								<span>{n.hour}</span>
								<LoaderCircle class="ml-auto h-4 w-4 animate-spin" aria-label="Saving" />
							{:else}
								<a href={`/admin/notes/${n.id}`} class="-mx-1 shrink-0 rounded px-1 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300 focus-visible:bg-stone-100 dark:focus-visible:bg-stone-800 focus-visible:text-stone-600 dark:focus-visible:text-stone-300 focus-visible:outline-none" aria-label={`Open note from ${n.hour}`}>{n.hour}</a>
								{#if n.published}
									<span class="shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-300" title="Published on the homepage">Public</span>
								{/if}
								{#if n.updated_at > n.created_at}
									<span
										class="shrink-0 text-[10px] uppercase tracking-wide"
										title={new Date(n.updated_at).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
									>edited</span
									>
								{/if}
								<span class="ml-auto flex shrink-0 items-center gap-1">
									{@render commentPill(n)}
									<button
										type="button"
										class="-mr-1 grid h-8 w-8 place-items-center rounded-full text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
										aria-label="Note actions"
										onclick={() => (menuNote = n)}
									>
										<EllipsisVertical class="h-4 w-4" />
									</button>
								</span>
							{/if}
						</div>
						<div class="mt-1">
							<NoteBody
								note={n}
								removableTags={!!onRemoveTag}
								onRemoveTag={(t) => (tagTarget = { note: n, tag: t })}
								{lang}
							/>
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
			class="inline-flex items-center gap-2 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-60"
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
		onOpen={(n) => { const id = n.id; menuNote = null; void goto(`/admin/notes/${id}`); }}
		onListen={(n) => { speakNote(n.id, n.content); menuNote = null; }}
		onEdit={(n) => { openEdit(n); }}
		onDelete={(n) => { menuNote = null; confirmNote = n; }}
		onFeature={(n) => { menuNote = null; onFeature(n); }}
		onPublish={(n) => { menuNote = null; onPublish(n); }}
		onToggleMonospace={onToggleMonospace}
		onClose={() => (menuNote = null)}
	/>
{/if}
{#if editNote}
	{@const editing = editNote}
	<NoteEditorModal
		note={editing}
		title={editTitle}
		content={editContent}
		video={editVideo}
		coverId={editing.coverId ?? null}
		onTitle={(v) => (editTitle = v)}
		onContent={(v) => (editContent = v)}
		onVideo={(v) => (editVideo = v)}
		onSave={async (content, video, createdAt, cover, title) => {
			await onEdit(editing.id, content, video, createdAt, title);
			if (cover !== undefined) await uploadCover(editing, cover);
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
		onSubmit={addComment}
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
