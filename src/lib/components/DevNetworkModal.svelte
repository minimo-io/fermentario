<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';

	type Props = { onClose: () => void };
	type Addresses = {
		lanAddress: string | null;
		tailscaleAddress: string | null;
	};

	let { onClose }: Props = $props();
	let loading = $state(true);
	let error = $state('');
	let qrUrl = $state('');
	let qrDataUrl = $state('');
	let addresses = $state<{ label: string; url: string }[]>([]);

	function urlFor(host: string) {
		const port = window.location.port ? `:${window.location.port}` : '';
		return `${window.location.protocol}//${host}${port}/`;
	}

	$effect(() => {
		let active = true;
		void (async () => {
			loading = true;
			error = '';
			qrDataUrl = '';
			try {
				const response = await fetch('/api/dev/network-addresses');
				if (!response.ok) throw new Error('Could not read this dev server’s network addresses.');
				const data = (await response.json()) as Addresses;
				if (!active) return;

				const localUrl = urlFor('127.0.0.1');
				const lanUrl = data.lanAddress ? urlFor(data.lanAddress) : null;
				const tailscaleUrl = data.tailscaleAddress ? urlFor(data.tailscaleAddress) : null;
				addresses = [
					{ label: 'This computer (127.0.0.1)', url: localUrl },
					...(lanUrl ? [{ label: 'Local network', url: lanUrl }] : []),
					...(tailscaleUrl ? [{ label: 'Tailscale', url: tailscaleUrl }] : [])
				];
				qrUrl = tailscaleUrl ?? lanUrl ?? localUrl;

				const QRCode = await import('qrcode');
				const image = await QRCode.toDataURL(qrUrl, {
					errorCorrectionLevel: 'M',
					margin: 2,
					width: 256
				});
				if (active) qrDataUrl = image;
			} catch (cause) {
				if (active) error = (cause as Error)?.message ?? 'Could not create the QR code.';
			} finally {
				if (active) loading = false;
			}
		})();
		return () => {
			active = false;
		};
	});
</script>

<div
	class="fixed inset-0 z-[70] grid place-items-center bg-stone-900/40 p-4 backdrop-blur-md dark:bg-black/60"
	role="dialog"
	aria-modal="true"
	aria-labelledby="dev-network-title"
	tabindex="-1"
	onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}
	onkeydown={(event) => { if (event.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-center justify-between gap-3">
			<h2 id="dev-network-title" class="text-sm font-semibold text-stone-900 dark:text-stone-100">
				Open this dev app on your phone
			</h2>
			<button
				type="button"
				class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
				aria-label="Close"
				onclick={onClose}
			><X class="h-4 w-4" /></button>
		</div>

		{#if loading}
			<div class="grid min-h-56 place-items-center text-stone-500" role="status">
				<LoaderCircle class="h-6 w-6 animate-spin" />
			</div>
		{:else if error}
			<p class="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
		{:else}
			<div class="mt-4 flex justify-center">
				{#if qrDataUrl}
					<img src={qrDataUrl} alt={`QR code for ${qrUrl}`} class="h-64 w-64 rounded-xl bg-white p-2" />
				{/if}
			</div>
			<p class="mt-2 text-center text-xs text-stone-500 dark:text-stone-400">
				Scan to open {addresses.find((address) => address.url === qrUrl)?.label ?? 'this app'}
			</p>
			<ul class="mt-4 space-y-2">
				{#each addresses as address (address.label)}
					<li class="rounded-xl bg-stone-50 px-3 py-2 dark:bg-stone-800/70">
						<p class="text-[10px] font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">{address.label}</p>
						<a
							href={address.url}
							class="mt-0.5 block break-all font-mono text-xs text-stone-700 underline decoration-stone-300 underline-offset-2 dark:text-stone-200 dark:decoration-stone-600"
						>{address.url}</a>
					</li>
				{/each}
			</ul>
			{#if addresses.length === 1}
				<p class="mt-3 text-xs text-amber-700 dark:text-amber-300">
					No local-network or active Tailscale address was found. The QR code only works on this computer.
				</p>
			{/if}
		{/if}
	</div>
</div>
