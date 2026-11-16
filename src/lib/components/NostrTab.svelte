<script lang="ts">
	import { onMount } from 'svelte';
	import type { NostrEvent } from '$lib/types';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import NostrHeatmap from '$lib/components/NostrHeatmap.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Search from '@lucide/svelte/icons/search';
	import Copy from '@lucide/svelte/icons/copy';
	import X from '@lucide/svelte/icons/x';
	import { nostrAccount } from '$lib/nostr.svelte';
	import { nostrBackup } from '$lib/nostr-backup.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { dayLocale } from '$lib/dates';

	type Props = { onError: (msg: string) => void; widthClass?: string; lang?: string };
	let { onError, widthClass = 'max-w-2xl', lang = 'en' }: Props = $props();

	let status = $derived(nostrAccount.status);
	let events = $state<NostrEvent[]>([]);
	let published = $state<{ day: string; count: number }[]>([]);
	let replies = $state<{ day: string; count: number }[]>([]);
	let loadingEvents = $state(true);
	let loadingAll = $derived(loadingEvents || !nostrAccount.loaded);
	let publishing = $state(false);
	let relayRunning = $state<boolean | null>(null);
	let relayBusy = $state(false);

	let publishOpen = $state(false);
	let draft = $state('');
	let selectedAccount = $state('');
	let noteSearch = $state('');
	let noteHits = $state<{ id: string; text: string; kind: string }[]>([]);
	let noteSearching = $state(false);
	let noteSearchSeq = 0;
	let selectedNoteId = $state<string | null>(null);

	async function loadAll() {
		try {
			const [e, h] = await Promise.all([
				fetch('/api/nostr/events?limit=5'),
				fetch('/api/nostr/heatmap')
			]);
			const eventsBody = e.ok ? await e.json() : { events: [] };
			events = Array.isArray(eventsBody?.events) ? eventsBody.events : [];
			const heat = h.ok ? await h.json() : { published: [], replies: [] };
			published = Array.isArray(heat?.published) ? heat.published : [];
			replies = Array.isArray(heat?.replies) ? heat.replies : [];
		} catch {
			onError('Failed to load the Nostr section.');
		} finally {
			loadingEvents = false;
		}
	}

	async function syncNow() {
		const result = await nostrBackup.nudge();
		if (!result.owned) return;
		await loadAll();
		if (result.error) {
			onError(result.error);
			return;
		}
		showToast(
			result.imported > 0
				? `${result.imported} new note${result.imported === 1 ? '' : 's'} backed up.`
				: 'Backup is up to date.',
			'success'
		);
	}

	// Refresh the event list when a backup run finishes.
	let wasBackupRunning = $state(false);
	$effect(() => {
		const running = nostrBackup.running;
		if (wasBackupRunning && !running) {
			void loadAll();
		}
		wasBackupRunning = running;
	});

	/** The relay runs inside the app process; the switch is a registry flag
	 *  the WebSocket listener reads on every upgrade. */
	async function loadRelay() {
		try {
			const res = await fetch('/api/nostr/relay');
			if (res.ok) relayRunning = (await res.json()).running === true;
		} catch {}
	}

	async function toggleRelay() {
		relayBusy = true;
		try {
			const res = await fetch('/api/nostr/relay', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ running: !relayRunning })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Could not change the relay.');
			relayRunning = d.running === true;
			showToast(relayRunning ? 'Backup relay started.' : 'Backup relay stopped.', 'success');		} catch (e) {
			onError((e as Error)?.message ?? 'Could not change the relay.');
		} finally {
			relayBusy = false;
		}
	}

	onMount(() => {
		void nostrAccount.load();
		void loadAll();
		void loadRelay();
		const timer = setInterval(() => void loadRelay(), 5000);
		return () => clearInterval(timer);
	});

	function fmtWhen(at: number): string {
		if (!at) return 'never';
		return new Date(at).toLocaleDateString(dayLocale(lang), {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	async function copyRelay() {
		if (!status?.relayUrl) return;
		try {
			await navigator.clipboard.writeText(status.relayUrl);
			showToast('Relay address copied.', 'success');
		} catch {
			showToast('Could not copy the address.');
		}
	}

	function openPublish() {
		if (!status?.configured) {
			onError('Add your nsec in Settings → Nostr first.');
			return;
		}
		draft = '';
		selectedAccount = status.npub;
		selectedNoteId = null;
		noteSearch = '';
		noteHits = [];
		publishOpen = true;
	}

	async function searchNotes(q: string) {
		noteSearch = q;
		if (q.trim().length < 2) {
			noteHits = [];
			noteSearching = false;
			return;
		}
		const mine = ++noteSearchSeq;
		noteSearching = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (!res.ok) throw new Error('search failed');
			const d = (await res.json()) as { hits?: { id: string; text: string; kind: string }[] };
			if (mine !== noteSearchSeq) return;
			noteHits = (d.hits ?? []).filter((hit) => hit.kind === 'note').slice(0, 6);
		} catch {
			if (mine === noteSearchSeq) noteHits = [];
		} finally {
			if (mine === noteSearchSeq) noteSearching = false;
		}
	}

	async function loadNoteIntoDraft(id: string) {
		try {
			const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
			if (!res.ok) throw new Error('failed');
			const d = await res.json();
			draft = String(d?.note?.content ?? '');
			selectedNoteId = id;
			noteSearch = '';
			noteHits = [];
		} catch {
			onError('Could not load that note.');
		}
	}

	async function publish() {
		const content = draft.trim();
		if (!content) {
			onError('A note needs text before publishing.');
			return;
		}
		publishing = true;
		try {
			const res = await fetch('/api/nostr/publish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content, sourceNoteId: selectedNoteId })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Could not publish.');
			publishOpen = false;
			draft = '';
			selectedNoteId = null;
			// A local row proves nothing: say so when no relay accepted it.
			if (Array.isArray(d.publishedTo) && d.publishedTo.length > 0) {
				showToast('Published to Nostr.', 'success');
			} else {
				showToast('Saved in this journal, but no relay accepted the note.', 'error');
			}
			await loadAll();
		} catch (e) {
			onError((e as Error)?.message ?? 'Could not publish.');
		} finally {
			publishing = false;
		}
	}
</script>

<div class="mx-auto {widthClass} px-2 sm:px-6">
	<div
		class="mb-4 flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900"
	>
		<span
			class="h-2 w-2 shrink-0 rounded-full {relayRunning === null
				? 'bg-stone-300 dark:bg-stone-600'
				: relayRunning
					? 'bg-emerald-500'
					: 'bg-rose-500'}"
			aria-hidden="true"
		></span>
		<p class="min-w-0 flex-1 text-xs font-medium text-stone-700 dark:text-stone-200" role="status">
			Backup relay {relayRunning === null ? 'checking…' : relayRunning ? 'running' : 'stopped'}
		</p>
		<button
			type="button"
			class="shrink-0 rounded-full border border-stone-200 px-3 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
			disabled={relayBusy || relayRunning === null}
			onclick={() => void toggleRelay()}
		>{relayBusy ? 'Switching…' : relayRunning ? 'Stop relay' : 'Start relay'}</button>
	</div>

	<section class="mb-6">
		<h2 class="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Activity</h2>
		<NostrHeatmap {published} {replies} />
	</section>

	{#if loadingAll}
		<p class="py-10 text-center text-sm text-stone-500 dark:text-stone-400">Loading…</p>
	{:else if !status?.configured}
		<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
			No Nostr account configured. Add your nsec in Settings → Nostr to publish and back up notes.
		</p>
	{:else}
		<section class="mb-6">
			<h2 class="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Backup relay</h2>
			<div class="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
				<div class="flex items-center gap-1.5">
					<p class="min-w-0 flex-1 truncate font-mono text-[12px] text-stone-700 select-all dark:text-stone-200">{status.relayUrl}</p>
					<button
						type="button"
						class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
						aria-label="Copy the relay address"
						onclick={() => void copyRelay()}
					><Copy class="h-3.5 w-3.5" /></button>
				</div>
				<div class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
					<span><span class="font-semibold text-amber-600 dark:text-amber-400">{status.stats.notes}</span> notes</span>
					<span><span class="font-semibold text-sky-600 dark:text-sky-400">{status.stats.replies}</span> replies</span>
					<span>last checked {fmtWhen(nostrBackup.lastSyncAt || status.lastSyncAt)}</span>
				</div>
				<div class="mt-3 flex items-center gap-2">
					<button
						type="button"
						class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
						disabled={nostrBackup.running}
						onclick={() => void syncNow()}
					>
						{#if nostrBackup.running}
							<LoaderCircle class="h-3.5 w-3.5 animate-spin" /> Backing up…
						{:else}
							Sync now
						{/if}
					</button>
					{#if nostrBackup.running}
						<span class="min-w-0 flex-1 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500" role="status">
							{nostrBackup.events} event{nostrBackup.events === 1 ? '' : 's'} stored
						</span>
					{:else if nostrBackup.error}
						<span class="min-w-0 flex-1 truncate text-[11px] text-rose-500 dark:text-rose-400" role="status" title={nostrBackup.error}>
							{nostrBackup.error}
						</span>
					{/if}
				</div>
			</div>
		</section>

		<section class="mb-6">
			<h2 class="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
				Account relays
			</h2>
			{#if status.relays.length}
				<ul class="space-y-1 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900">
					{#each status.relays as relay (relay)}
						<li class="truncate font-mono text-[11px] text-stone-600 select-all dark:text-stone-300">{relay}</li>
					{/each}
				</ul>
			{:else}
				<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-[12px] text-stone-500 dark:border-stone-700 dark:text-stone-400">
					No relay list (kind 10002) found for this account.
				</p>
			{/if}
		</section>

		<section class="mb-6">
			<h2 class="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
				Latest notes
			</h2>
			{#if events.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-[12px] text-stone-500 dark:border-stone-700 dark:text-stone-400">
					Nothing backed up yet. The backup runs automatically when an account is configured; it needs a reachable relay.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each events as event (event.id)}
						<li class="rounded-2xl border border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900">
							<p class="whitespace-pre-wrap text-[14px] leading-snug text-stone-800 line-clamp-3 dark:text-stone-200">{event.content}</p>
							<p class="mt-1 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
								{fmtWhen(event.createdAt)}{#if event.isReply} · reply{/if}
								<span class="ml-1 font-mono text-stone-300 dark:text-stone-600">{event.id.slice(0, 10)}</span>
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<FixedBottomBar {widthClass}>
	<button
		type="button"
		class="flex min-h-11 w-full flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium whitespace-nowrap text-white disabled:opacity-50 dark:bg-stone-700"
		disabled={!status?.configured}
		onclick={() => openPublish()}
	><Plus class="h-4 w-4" /> Publish a note</button>
</FixedBottomBar>

{#if publishOpen && status}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-md dark:bg-black/60 sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Publish a note"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) publishOpen = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') publishOpen = false; }}
	>
		<div class="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl dark:bg-stone-900 sm:rounded-2xl">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Publish a note</h3>
				<button
					type="button"
					class="grid h-7 w-7 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
					aria-label="Close"
					onclick={() => (publishOpen = false)}
				><X class="h-4 w-4" /></button>
			</div>

			<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="nostr-account">Account</label>
			<select
				id="nostr-account"
				bind:value={selectedAccount}
				class="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
			>
				<option value={status.npub}>{status.name || status.npub.slice(0, 20) + '…'}</option>
			</select>

			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="nostr-draft">Note</label>
			<textarea
				id="nostr-draft"
				class="mt-1 min-h-24 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
				placeholder="Write your note…"
				bind:value={draft}
			></textarea>

			<div class="mt-2">
				<label class="relative block">
					<span class="sr-only">Search a note to load as a draft</span>
					<Search class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
					<input
						type="search"
						class="w-full rounded-lg border border-stone-200 bg-white py-1.5 pl-7 pr-2.5 text-[12px] text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
						placeholder="Search a note to load as a draft…"
						value={noteSearch}
						oninput={(e) => void searchNotes((e.target as HTMLInputElement).value)}
					/>
				</label>
				{#if noteSearching}
					<p class="mt-1 text-[11px] text-stone-400">Searching…</p>
				{:else if noteHits.length > 0}
					<ul class="mt-1 space-y-1">
						{#each noteHits as hit (hit.id)}
							<li>
								<button
									type="button"
									class="block w-full rounded-lg px-2 py-1 text-left text-[12px] text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
									onclick={() => void loadNoteIntoDraft(hit.id)}
								>
									<span class="line-clamp-2">{hit.text}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if selectedNoteId}
					<p class="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Loaded from a note — edit freely before publishing.</p>
				{/if}
			</div>

			<div class="mt-3 flex items-center justify-end gap-1">
				<button
					type="button"
					class="rounded-full px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={() => (publishOpen = false)}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700"
					disabled={publishing || !draft.trim()}
					onclick={() => void publish()}
				>{publishing ? 'Publishing…' : 'Publish'}</button>
			</div>
		</div>
	</div>
{/if}
