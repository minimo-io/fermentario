<script lang="ts">
	import { showToast } from '$lib/toast.svelte';

	// Ripio Trade API credentials. They live in the journal DB and never
	// travel back to the browser: the panel only ever learns the status.
	type Status = { configured: boolean; updatedAt: number };
	let status = $state<Status>({ configured: false, updatedAt: 0 });
	let token = $state('');
	let secret = $state('');
	let saving = $state(false);
	let removing = $state(false);
	let testing = $state(false);
	let testResult = $state('');
	let testTone = $state<'ok' | 'warn' | 'error'>('ok');

	async function load() {
		try {
			const res = await fetch('/api/config/credentials/ripio');
			if (res.ok) status = (await res.json()) as Status;
		} catch {}
	}

	$effect(() => {
		void load();
	});

	async function save() {
		saving = true;
		try {
			const res = await fetch('/api/config/credentials/ripio', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: token.trim(), secret: secret.trim() })
			});
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Could not save the keys.');
			status = d as Status;
			token = '';
			secret = '';
			testResult = 'Keys saved — press Test quote to verify.';
			testTone = 'ok';
			showToast('Ripio keys saved.', 'success');
		} catch (e) {
			showToast((e as Error)?.message ?? 'Could not save the keys.');
		} finally {
			saving = false;
		}
	}

	async function remove() {
		removing = true;
		try {
			const res = await fetch('/api/config/credentials/ripio', { method: 'DELETE' });
			if (!res.ok) throw new Error();
			status = (await res.json()) as Status;
			testResult = 'Keys removed — Ripio quotes use the public endpoint again.';
			testTone = 'ok';
			showToast('Ripio keys removed.', 'success');
		} catch {
			testResult = 'Could not remove the keys.';
			testTone = 'error';
			showToast('Could not remove the keys.');
		} finally {
			removing = false;
		}
	}

	async function test() {
		testing = true;
		testResult = 'Fetching a quote…';
		testTone = 'ok';
		try {
			const res = await fetch('/api/quotes/ripio?pair=BTC_USDC');
			const d = await res.json().catch(() => ({}));
			if (d?.priceUsd) {
				const price = Number(d.priceUsd).toLocaleString(undefined, { maximumFractionDigits: 2 });
				if (d.authError) {
					testResult = `Saved key rejected: ${d.authError}. Showing the public quote (BTC ${price} USD). Re-check the token and secret, or Remove them.`;
					testTone = 'warn';
				} else {
					testResult = `BTC ${price} USD · ${d.live ? 'market ticker (live)' : 'public endpoint (lags up to 30 s)'}`;
					testTone = 'ok';
				}
			} else {
				testResult = `Quote failed: ${d?.error ?? 'no answer'}`;
				testTone = 'error';
			}
		} catch {
			testResult = 'Quote failed: network';
			testTone = 'error';
		} finally {
			testing = false;
		}
	}

	const inputClass =
		'w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';
</script>

<p class="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Ripio Trade API</p>
<p class="text-[11px] leading-snug text-stone-400 dark:text-stone-500">
	With your API token and secret, Ripio quotes come from the signed market ticker — real time.
	Without them the public endpoint is used, which Ripio caches up to 30 seconds. Keys live in this
	journal's database, so backups include them: create a <strong>read-only</strong> key in
	Ripio's API settings.
</p>
<p class="mt-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
	Keys must come from <strong>app.ripio.com/profile?tab=api</strong> (the Ripio wallet/retail app),
	not from trade.ripio.com (the exchange). The key needs at least
	<code class="rounded bg-stone-100 px-1 dark:bg-stone-800">general_data_read</code> permission.
	Empty fields never send.
</p>

<div class="mt-3 flex flex-col gap-2">
	<div class="flex items-center gap-2">
		<span class="rounded-full px-2.5 py-1 text-[11px] font-medium {status.configured ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400'}">
			{status.configured ? `Configured · ${new Date(status.updatedAt).toLocaleDateString()}` : 'Not configured'}
		</span>
		<span class="text-[11px] leading-snug text-stone-400 dark:text-stone-500">
			Saved keys stay in the journal until you Remove them; empty fields never send.
		</span>
	</div>
	{#if testResult}
		<p
			role="status"
			class="rounded-lg px-2.5 py-1.5 text-[12px] leading-snug {testTone === 'error' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' : testTone === 'warn' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-stone-50 text-stone-600 dark:bg-stone-900 dark:text-stone-300'}"
		>{testResult}</p>
	{/if}
</div>

<div class="mt-3 space-y-2">
	<input type="text" autocomplete="off" spellcheck="false" class={inputClass} placeholder="API token" bind:value={token} />
	<input type="password" autocomplete="new-password" class={inputClass} placeholder="Secret key" bind:value={secret} />
</div>

<div class="mt-3 flex flex-wrap items-center justify-end gap-2">
	{#if status.configured}
		<button
			type="button"
			class="rounded-full px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
			disabled={removing}
			onclick={() => void remove()}
		>Remove</button>
	{/if}
	<button
		type="button"
		class="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
		disabled={testing}
		onclick={() => void test()}
	>{testing ? 'Testing…' : 'Test quote'}</button>
	<button
		type="button"
		class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700 dark:hover:bg-stone-600"
		disabled={saving || !token.trim() || !secret.trim()}
		onclick={() => void save()}
	>{saving ? 'Saving…' : 'Save keys'}</button>
</div>
