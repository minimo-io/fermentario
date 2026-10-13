<script lang="ts">
	import type { ChatModelOption } from '$lib/chat-models';

	type Props = {
		summaryLoading: boolean;
		week: string | null;
		model: string;
		models: ChatModelOption[];
		prompt: string;
		onRerun: () => void;
		onModelChange: (id: string) => void;
		onPromptChange: (value: string) => void;
	};
	let { summaryLoading, week, model, models, prompt, onRerun, onModelChange, onPromptChange }: Props = $props();

	let embedding = $state<boolean | null>(null);
	let chat = $state<boolean | null>(null);
	let chatReady = $state(false);
	let chatDownloaded = $state(false);
	let activeId = $state('');
	let pct = $state<number | null>(null);
	let pctChat = $state<number | null>(null);
	let err = $state('');
	let errChat = $state('');
	let phase = $state('');
	let phaseChat = $state('');
	let notes = $state(0);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let sad = $state('');
	let failStreak = 0;

	const EMB = 'Xenova/all-MiniLM-L6-v2';

	let activeRepo = $derived(models.find((m) => m.id === model)?.repo ?? 'onnx-community/Qwen2.5-0.5B-Instruct');

	let downloadStarted = $derived(phaseChat === 'download' || (typeof pctChat === 'number' && pctChat > 0));
	let rebrewDisabled = $derived(
		summaryLoading || (chatReady ? false : chatDownloaded ? true : downloadStarted)
	);

	async function retry(kind: 'embedding' | 'chat') {
		try {
			await fetch('/api/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind }) });
			sad = '';
		} catch (e) { sad = (e as Error)?.message ?? 'Retry failed.'; }
		void poll();
	}

	async function poll() {
		try {
			const res = await fetch('/api/status');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const d = (await res.json()) as {
				notes?: number;
				embedding?: boolean;
				chat?: boolean;
				chatModel?: string;
				chatReady?: boolean;
				chatDownloaded?: boolean;
				progress?: {
					embedder?: { pct?: number | null; phase?: string; message?: string; error?: string | null };
					chat?: { pct?: number | null; phase?: string; message?: string; error?: string | null };
				};
			};
			notes = typeof d.notes === 'number' ? d.notes : 0;
			embedding = d.embedding === true;
			chat = d.chat === true;
			chatReady = d.chatReady === true;
			chatDownloaded = d.chatDownloaded === true;
			activeId = typeof d.chatModel === 'string' ? d.chatModel : model;
			phase = (d.progress?.embedder?.phase ?? '');
			phaseChat = (d.progress?.chat?.phase ?? '');
			pct = (d.progress?.embedder?.pct ?? null);
			pctChat = (d.progress?.chat?.pct ?? null);
			err = (d.progress?.embedder?.error ?? '');
			errChat = (d.progress?.chat?.error ?? '');
			sad = '';
			failStreak = 0;
		} catch (e) {
			failStreak += 1;
			sad = failStreak >= 2
				? 'Cannot reach the server. The app may have stopped — restart it and try again.'
				: 'Status temporarily unavailable — retrying…';
		}
	}

	$effect(() => {
		void poll();
		pollTimer = setInterval(poll, 4000);
		return () => {
			if (pollTimer) clearInterval(pollTimer);
		};
	});

	function dot(done: boolean | null): string {
		if (done === null) return 'unknown';
		return done ? 'loaded' : 'not loaded';
	}
</script>

<div class="space-y-2 text-sm">
	<div class="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
		<span class="text-stone-600">Embedding</span>
		<span class="flex flex-col items-end gap-1 text-stone-500">
			{#if err}
				<span class="text-[11px] text-red-600">{err}</span>
				<button class="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-700" onclick={() => retry('embedding')}>Retry</button>
			{:else}
				<span class="flex items-center gap-2">
					<span class="inline-block h-2 w-2 rounded-full {embedding === true ? 'bg-emerald-500' : embedding === false ? 'bg-stone-300' : 'bg-amber-400 animate-pulse'}" ></span>
					{EMB}
					{#if typeof pct === 'number'}<div class="flex items-center gap-1"><div class="h-1 w-12 overflow-hidden rounded-full bg-amber-100"><div class="h-full bg-amber-500" style="width: {Math.min(pct, 100)}%"></div></div><span class="text-[10px] text-amber-700">{phase}</span></div>{/if}
				</span>
			{/if}
		</span>
	</div>
	<div class="rounded-xl bg-stone-50 px-3 py-2">
		<div class="flex flex-col gap-2">
			<div class="flex items-center justify-between gap-3">
				<label class="text-stone-600" for="chat-model">Summary &amp; Ask model</label>
				<select
					id="chat-model"
					class="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
					value={model}
					onchange={(e) => { onModelChange((e.currentTarget as HTMLSelectElement).value); }}
				>
					{#each models as m}
						<option value={m.id} selected={m.id === model}>{m.label} — {m.detail}</option>
					{/each}
				</select>
			</div>
			<div class="flex items-center justify-between gap-2">
				<span class="break-all text-[11px] text-stone-400">{activeRepo}</span>
				<span class="flex shrink-0 items-center gap-1.5">
					{#if errChat}
						<span class="text-[11px] text-red-600">{errChat}</span>
						<button class="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-700" onclick={() => retry('chat')}>Retry</button>
					{:else}
						<span class="inline-block h-2 w-2 rounded-full {chatReady ? 'bg-emerald-500' : phaseChat === 'download' || phaseChat === 'loading' || phaseChat === '' ? 'bg-amber-400 animate-pulse' : 'bg-stone-300'}"></span>
						{#if typeof pctChat === 'number'}<div class="flex items-center gap-1"><div class="h-1 w-12 overflow-hidden rounded-full bg-amber-100"><div class="h-full bg-amber-500" style="width: {Math.min(pctChat, 100)}%"></div></div><span class="text-[10px] text-amber-700">{phaseChat}</span></div>{/if}
						{#if !chatDownloaded && phaseChat === ''}<span class="text-[10px] text-stone-400">not downloaded</span>{/if}
						{#if chatReady}<span class="text-[10px] text-emerald-600">loaded</span>{/if}
					{/if}
				</span>
			</div>
		</div>
	</div>
	<div class="rounded-xl bg-stone-50 px-3 py-2">
		<div class="flex items-center justify-between gap-3">
			<label class="text-stone-600" for="summary-prompt">Summary prompt</label>
			<button
				type="button"
				class="shrink-0 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
				disabled={!prompt}
				onclick={() => onPromptChange('')}
			>Reset to default</button>
		</div>
		<textarea
			id="summary-prompt"
			rows="3"
			class="mt-2 max-h-40 w-full resize-y rounded-xl border border-stone-300 bg-white p-2.5 text-[13px] leading-snug text-stone-700 outline-none placeholder:text-stone-400 focus:border-stone-400"
			value={prompt}
			oninput={(e) => onPromptChange(e.currentTarget.value)}
			placeholder="Write one paragraph summarizing the following notes. Do not make things up, just a short summary of what's in the notes:"
		></textarea>
		<p class="mt-1.5 text-[11px] text-stone-400">
			The week's notes and the language instruction are appended below this text. Leave it empty to use the built-in prompt.
		</p>
	</div>
	<div class="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
		<div class="flex items-center gap-2">
			<span class="text-stone-600">Weekly recap</span>
			<button
				type="button"
				class="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 disabled:hover:bg-amber-50"
				disabled={rebrewDisabled}
				onclick={onRerun}
			>
				{#if summaryLoading}
					Brewing…
				{:else if chatReady}
					Re-brew &#8635;
				{:else if chatDownloaded}
					Loading…
					{#if typeof pctChat === 'number' && pctChat > 0} {pctChat}%{/if}
				{:else if downloadStarted}
					Downloading…
					{#if typeof pctChat === 'number' && pctChat > 0} {pctChat}%{/if}
				{:else}
					Download &amp; re-brew
				{/if}
			</button>
		</div>
		<span class="flex items-center gap-2">
			{#if summaryLoading}
				<span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"></span>
				<span class="text-amber-700">processing…</span>
			{:else if week}
				<span class="inline-block h-2 w-2 rounded-full bg-emerald-500" ></span>
				<span class="text-emerald-700">ready</span>
			{:else}
				<span class="inline-block h-2 w-2 rounded-full bg-stone-300" ></span>
				<span class="text-stone-500">idle</span>
			{/if}
		</span>
	</div>
	<div class="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
		<span class="text-stone-600">Notes stored</span>
		<span class="font-medium text-stone-800">{notes}</span>
	</div>
	{#if sad}
		<p class="text-xs text-red-600">{sad}</p>
	{/if}
</div>

<div class="mt-2 text-center text-[11px] text-stone-400">
	status = which models are in the model cache; recap = whether the weekly summary is being built.
</div>
