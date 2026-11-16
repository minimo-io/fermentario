<script lang="ts">
	import { nostrAccount } from '$lib/nostr.svelte';
	import { showToast } from '$lib/toast.svelte';
	import type { NostrStatus } from '$lib/types';
	import Copy from '@lucide/svelte/icons/copy';

	// Only one field is yours to type: the nsec. Everything else is read from
	// the account's own relays — kind 0 for the profile, kind 10002 (NIP-65)
	// for the relay list — and cached here for display. Fermentario never
	// publishes either event.
	let status = $derived(nostrAccount.status);
	let nsec = $state('');
	let saving = $state(false);
	let refreshing = $state(false);
	let message = $state('');
	let tone = $state<'ok' | 'error'>('ok');

	$effect(() => {
		if (!nostrAccount.loaded) void nostrAccount.load();
	});

	async function save() {
		saving = true;
		message = '';
		try {
			const res = await fetch('/api/nostr/profile', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ nsec: nsec.trim() })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Could not save the account.');
			nostrAccount.set(d as NostrStatus);
			nsec = '';
			message = d.foundProfile
				? 'Account saved. Profile and relays read from Nostr.'
				: 'Account saved. No profile (kind 0) found on its relays yet.';
			tone = 'ok';
			showToast('Nostr account saved.', 'success');
		} catch (e) {
			message = (e as Error)?.message ?? 'Could not save the account.';
			tone = 'error';
		} finally {
			saving = false;
		}
	}

	async function refresh() {
		refreshing = true;
		message = 'Reading the account from its relays…';
		tone = 'ok';
		try {
			const res = await fetch('/api/nostr/profile/refresh', { method: 'POST' });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Could not read the relays.');
			nostrAccount.set(d as NostrStatus);
			message = `${d.relays.length} relay${d.relays.length === 1 ? '' : 's'} · ${d.foundProfile ? 'profile found' : 'no profile found'}`;
			tone = 'ok';
		} catch (e) {
			message = (e as Error)?.message ?? 'Could not read the relays.';
			tone = 'error';
		} finally {
			refreshing = false;
		}
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

	const inputClass =
		'w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';
</script>

<p class="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Nostr account</p>
<p class="text-[11px] leading-snug text-stone-400 dark:text-stone-500">
	Your nsec signs every published note. It is stored in this journal's database, so backups
	include it — keep the journal safe and use a dedicated key.
</p>

<div class="mt-3 flex items-end gap-2">
	<label class="min-w-0 flex-1">
		<span class="sr-only">nsec</span>
		<input
			type="password"
			autocomplete="off"
			spellcheck="false"
			class={inputClass}
			placeholder={status?.configured ? 'nsec1… (replace the stored key)' : 'nsec1…'}
			bind:value={nsec}
		/>
	</label>
	<button
		type="button"
		class="shrink-0 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700 dark:hover:bg-stone-600"
		disabled={saving || !nsec.trim()}
		onclick={() => void save()}
	>{saving ? 'Saving…' : 'Save account'}</button>
</div>

{#if status?.configured}
	<div class="mt-3 space-y-2 rounded-xl border border-stone-200 px-3 py-2.5 dark:border-stone-800">
		<div>
			<p class="text-[10px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">npub</p>
			<p class="break-all font-mono text-[11px] tabular-nums text-stone-600 select-all dark:text-stone-300">{status.npub}</p>
		</div>

		<div>
			<p class="text-[10px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Profile</p>
			{#if status.name || status.about || status.picture}
				<p class="text-[12px] text-stone-700 dark:text-stone-200">{status.name || '(no name)'}</p>
				{#if status.about}
					<p class="text-[11px] leading-snug text-stone-500 dark:text-stone-400">{status.about}</p>
				{/if}
				{#if status.picture}
					<p class="truncate font-mono text-[10px] text-stone-400 dark:text-stone-500">{status.picture}</p>
				{/if}
			{:else}
				<p class="text-[11px] text-stone-400 dark:text-stone-500">No profile published on this account's relays.</p>
			{/if}
		</div>

		<div>
			<p class="text-[10px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
				Relays (from the account)
			</p>
			{#if status.relays.length}
				<ul class="space-y-0.5">
					{#each status.relays as relay (relay)}
						<li class="truncate font-mono text-[11px] text-stone-600 dark:text-stone-300">{relay}</li>
					{/each}
				</ul>
			{:else}
				<p class="text-[11px] text-stone-400 dark:text-stone-500">No relay list (kind 10002) found. Default relays are used.</p>
			{/if}
		</div>

		<div>
			<p class="text-[10px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">This relay</p>
			<div class="flex items-center gap-1.5">
				<p class="min-w-0 flex-1 truncate font-mono text-[11px] text-stone-600 select-all dark:text-stone-300">{status.relayUrl}</p>
				<button
					type="button"
					class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
					aria-label="Copy the relay address"
					onclick={() => void copyRelay()}
				><Copy class="h-3.5 w-3.5" /></button>
			</div>
		</div>

		<button
			type="button"
			class="text-[11px] font-medium text-stone-500 underline-offset-2 hover:underline disabled:opacity-50 dark:text-stone-400"
			disabled={refreshing}
			onclick={() => void refresh()}
		>{refreshing ? 'Reading relays…' : 'Refresh from relays'}</button>
	</div>
{/if}

{#if message}
	<p
		role="status"
		class="mt-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-snug {tone === 'error'
			? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300'
			: 'bg-stone-50 text-stone-600 dark:bg-stone-900 dark:text-stone-300'}"
	>{message}</p>
{/if}
