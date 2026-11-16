<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Book } from '$lib/types';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { dayLocale } from '$lib/dates';

	// Library: the EPUB bytes live in the journal DB; this table lists the
	// metadata rows only. Upload parses title/author in the browser (epub.js
	// unzips on the client) so the server just stores the file.
	type Props = { onError: (msg: string) => void; widthClass?: string; lang?: string };
	let { onError, widthClass = 'max-w-2xl', lang = 'en' }: Props = $props();

	let books = $state<Book[]>([]);
	let uploading = $state(false);
	let confirming = $state<Book | null>(null);
	let pickEl: HTMLInputElement | null = null;

	async function load() {
		try {
			const d = await (await loading.track(fetch('/api/books'))).json();
			books = Array.isArray(d.books) ? (d.books as Book[]) : [];
		} catch {
			onError('Failed to load the library.');
		}
	}

	$effect(() => {
		void load();
	});

	function fmtSize(bytes: number): string {
		return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	function fmtWhen(b: Book): string {
		const at = b.lastReadAt || b.added_at;
		return new Date(at).toLocaleDateString(dayLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function pickAndUpload() {
		const file = pickEl?.files?.[0];
		if (!file) return;
		uploading = true;
		try {
			let title = '';
			let author = '';
			try {
				const ePub = (await import('epubjs')).default;
				const probe = ePub(await file.arrayBuffer());
				const meta = await probe.loaded.metadata;
				title = String(meta?.title ?? '').trim();
				author = String(meta?.creator ?? '').trim();
				probe.destroy();
			} catch {
				// Unreadable metadata is not a rejection: the server still
				// checks the bytes; the file name is the fallback title.
			}
			title ||= file.name.replace(/\.epub$/i, '');
			const form = new FormData();
			form.append('file', file);
			form.append('title', title);
			form.append('author', author);
			const res = await fetch('/api/books', { method: 'POST', body: form });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save the book.');
			books = [d.book as Book, ...books];
			showToast('Book added.', 'success');
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save the book.');
		} finally {
			uploading = false;
			if (pickEl) pickEl.value = '';
		}
	}

	async function removeBook(b: Book) {
		try {
			const res = await fetch(`/api/books/${encodeURIComponent(b.id)}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete the book.');
			books = books.filter((x) => x.id !== b.id);
			showToast('Book removed.', 'success');
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete the book.');
		}
	}
</script>

<div class="mx-auto {widthClass} px-2 sm:px-6">
	<ul class="space-y-2">
		{#each books as b (b.id)}
			<li class="relative rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
				<div class="flex items-center gap-3">
					<button
						type="button"
						class="min-w-0 flex-1 text-left"
						onclick={() => void goto(`/admin/book/${b.id}`)}
					>
						<p class="truncate text-[15px] font-medium text-stone-800 dark:text-stone-200">{b.title}</p>
						<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
							{b.author || 'Unknown author'} · {fmtSize(b.size)} · {b.lastReadAt > 0 ? `${Math.round(b.lastPct * 100)}% · ${fmtWhen(b)}` : 'not started'}
						</p>
					</button>
					<a
						href="/admin/book/{b.id}"
						class="shrink-0 rounded-full bg-stone-900 dark:bg-stone-700 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
						aria-label={`Read {b.title}`}
					><span class="inline-flex items-center gap-1"><BookOpen class="h-3.5 w-3.5" /> Read</span></a>
					<button
						type="button"
						class="shrink-0 grid h-7 w-7 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-rose-600 dark:text-stone-500 dark:hover:bg-stone-800"
						aria-label="Remove this book"
						onclick={() => (confirming = b)}
					><Trash2 class="h-4 w-4" /></button>
				</div>
			</li>
		{/each}
	</ul>

	{#if books.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
			{uploading ? 'Reading the file…' : 'No books yet. Upload an EPUB to start reading.'}
		</p>
	{/if}

	<p class="mt-3 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
		Books and your highlights live in the journal, so backups carry them too. DRM-protected EPUBs cannot be read.
	</p>
</div>

<input type="file" accept=".epub,application/epub+zip" class="hidden" bind:this={pickEl} onchange={() => void pickAndUpload()} />

<FixedBottomBar {widthClass}>
	<button
		type="button"
		class="flex min-h-11 w-full flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-2 text-sm font-medium whitespace-nowrap text-white disabled:opacity-60"
		disabled={uploading}
		onclick={() => pickEl?.click()}
	>{#if uploading}<LoaderCircle class="h-4 w-4 animate-spin" />{:else}<Upload class="h-4 w-4" />{/if} {uploading ? 'Uploading…' : 'Upload EPUB'}</button>
</FixedBottomBar>

{#if confirming}
	<ConfirmDialog
		title="Delete this book?"
		message="{confirming.title} and its highlights leave the journal. The file bytes are removed too."
		confirmLabel="Delete book"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const b = confirming; confirming = null; if (b) void removeBook(b); }}
		onCancel={() => (confirming = null)}
	/>
{/if}
