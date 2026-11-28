<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { onDestroy } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { vault } from '$lib/vault.svelte';

	let file = $state<File | null>(null);
	let password = $state('');
	let revealed = $state(false);
	let copied = $state('');
	let copyError = $state('');
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	onDestroy(() => { if (copyTimer) clearTimeout(copyTimer); });
	const matches = $derived.by(() => {
		const query = vault.query.trim().toLowerCase();
		return vault.rows.filter((row) => !query || [row.title, row.username, row.url, row.group].some((value) => value.toLowerCase().includes(query)));
	});
	const row = $derived(vault.rows.find((entry) => entry.id === vault.selected));
	const detail = $derived(vault.detail?.id === vault.selected ? vault.detail : null);
	const safeUrl = $derived.by(() => {
		try {
			const url = new URL(row?.url ?? '');
			return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
		} catch { return ''; }
	});

	function close() {
		password = '';
		revealed = false;
		vault.closeModal();
	}
	async function unlock() {
		if (!file || !password) return;
		const secret = password;
		password = '';
		await vault.unlock(file, secret);
	}
	async function copy(value: string, label: string) {
		copied = '';
		copyError = '';
		try {
			await navigator.clipboard.writeText(value);
			if (copyTimer) clearTimeout(copyTimer);
			copied = label;
			copyTimer = setTimeout(() => { copied = ''; copyTimer = null; }, 2000);
		} catch {
			copyError = 'Copy failed. Check browser clipboard permissions.';
		}
	}
	function select(id: string) {
		revealed = false;
		copied = '';
		copyError = '';
		vault.select(id);
	}
</script>

<div
	class="fixed inset-0 z-[70] flex h-dvh flex-col bg-white dark:bg-stone-900"
	role="dialog"
	aria-modal="true"
	aria-labelledby="vault-title"
	tabindex="-1"
	onclick={(event) => { if (event.target === event.currentTarget) close(); }}
	onkeydown={(event) => { if (event.key === 'Escape') close(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
		<div class="flex items-center justify-between gap-3">
			<h2 id="vault-title" class="text-base font-semibold text-stone-900 dark:text-stone-100">Password vault</h2>
			<div class="flex items-center gap-2">
				{#if vault.unlocked || vault.loading}
					<button type="button" class="rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700 dark:border-rose-800 dark:text-rose-300" onclick={() => { vault.lock(); password = ''; file = null; revealed = false; }}>Lock vault</button>
				{/if}
				<button type="button" class="grid h-8 w-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close" onclick={close}><X class="h-4 w-4" /></button>
			</div>
		</div>
		{#if !vault.unlocked}
			<form class="mt-4 space-y-4" onsubmit={(event) => { event.preventDefault(); void unlock(); }}>
				<p class="text-sm text-stone-500 dark:text-stone-400">Open a KeePass database on this device. The file and password stay in your browser.</p>
				<label class="block text-sm font-medium text-stone-700 dark:text-stone-200">KDBX file
					<input class="mt-1 block w-full text-sm text-stone-600 dark:text-stone-300" type="file" accept=".kdbx" disabled={vault.loading} onchange={(event) => { file = event.currentTarget.files?.[0] ?? null; }} />
				</label>
				<label class="block text-sm font-medium text-stone-700 dark:text-stone-200">Master password
					<input class="mt-1 w-full rounded-xl border border-stone-300 bg-transparent px-3 py-2 text-sm dark:border-stone-700" type="password" autocomplete="off" bind:value={password} disabled={vault.loading} />
				</label>
				{#if vault.error}<p class="text-sm text-rose-700 dark:text-rose-300" role="alert">{vault.error}</p>{/if}
				<button class="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-700" type="submit" disabled={!file || !password || vault.loading}>{vault.loading ? 'Unlocking…' : 'Unlock'}</button>
			</form>
		{:else}
			<p class="mt-2 text-xs text-rose-700 dark:text-rose-300">Unlocked · locks after 5 minutes idle or 1 minute in the background.</p>
			<input class="mt-4 w-full rounded-xl border border-stone-300 bg-transparent px-3 py-2 text-sm dark:border-stone-700" type="search" placeholder="Search entries" aria-label="Search vault entries" bind:value={vault.query} />
			<div class="mt-3 grid min-h-0 flex-1 gap-3 overflow-y-auto sm:grid-cols-2">
				<ul class="space-y-1">
					{#each matches as item (item.id)}
						<li><button type="button" class="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 {vault.selected === item.id ? 'bg-stone-100 dark:bg-stone-800' : ''}" onclick={() => select(item.id)}>
							<span class="block font-medium text-stone-900 dark:text-stone-100">{item.title || '(Untitled)'}</span>
							<span class="block truncate text-xs text-stone-500">{item.username || item.group}</span>
						</button></li>
					{:else}<li class="p-3 text-sm text-stone-500">No matching entries.</li>{/each}
				</ul>
				{#if row}
					<div class="min-w-0 space-y-3 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-800/60">
						<h3 class="break-words font-semibold text-stone-900 dark:text-stone-100">{row.title || '(Untitled)'}</h3>
						<p class="break-words text-xs text-stone-500">{row.group}</p>
						<div><p class="text-xs font-medium text-stone-500">Username</p><p class="break-all">{row.username || '—'}</p>{#if row.username}<button type="button" class="text-xs underline {copied === 'Username' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-300'}" onclick={() => copy(row.username, 'Username')}>{copied === 'Username' ? 'Copied!' : 'Copy username'}</button>{/if}</div>
						<div><p class="text-xs font-medium text-stone-500">Password</p><p class="break-all">{detail ? (revealed ? detail.password : '••••••••') : 'Loading…'}</p>{#if detail}
							<button type="button" class="mr-3 text-xs text-blue-700 underline dark:text-blue-300" onclick={() => revealed = !revealed}>{revealed ? 'Hide' : 'Reveal'}</button>
							<button type="button" class="text-xs underline {copied === 'Password' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-300'}" onclick={() => copy(detail.password, 'Password')}>{#if copied === 'Password'}<span transition:fade={{ duration: motionMs(180) }}>Copied!</span>{:else}Copy password{/if}</button>
						{/if}</div>
						{#if row.url}<div><p class="text-xs font-medium text-stone-500">URL</p>{#if safeUrl}<a class="break-all text-blue-700 underline dark:text-blue-300" href={safeUrl} target="_blank" rel="noopener noreferrer">{row.url}</a>{:else}<p class="break-all">{row.url}</p>{/if}</div>{/if}
						{#if detail?.notes}<div><p class="text-xs font-medium text-stone-500">Notes</p><p class="whitespace-pre-wrap break-words">{detail.notes}</p><button type="button" class="text-xs underline {copied === 'Notes' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-700 dark:text-blue-300'}" onclick={() => copy(detail.notes, 'Notes')}>{copied === 'Notes' ? 'Copied!' : 'Copy notes'}</button></div>{/if}
						{#if copied}<span class="sr-only" role="status">{copied} copied.</span>{/if}
						{#if copyError}<p class="text-xs text-rose-700 dark:text-rose-300" role="alert">{copyError}</p>{/if}
					</div>
				{:else}<p class="p-3 text-sm text-stone-500">Select an entry.</p>{/if}
			</div>
		{/if}
	</div>
</div>
