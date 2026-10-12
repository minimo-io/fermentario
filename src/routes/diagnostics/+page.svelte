<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft } from '@lucide/svelte';

	/** The app has no browser chrome, so a page reached by a link needs its own
	 *  way back. `history.back()` when there is somewhere to go, otherwise the
	 *  journal home. */
	function goBack() {
		if (window.history.length > 1) window.history.back();
		else goto('/');
	}

	/**
 * Report the things this app cannot assume.
 *
 * Every check here is a question whose answer differs between a desktop
 * browser, an iOS WebView and an Android WebView, and whose failure mode is
 * silence rather than an error. `crossOriginIsolated` being false does not
 * throw; it just means onnxruntime silently runs one thread, and the only
 * symptom is that generation is slow.
 *
 * Nothing on this page loads a model. Inference is a button press, because a
 * diagnostic that downloads 488 MB is worse than no diagnostic.
 */
interface Row {
	id: number;
	label: string;
	value: string;
	ok?: boolean | null;
	note?: string;
}

// Runes mode: a plain `let` is not reactive, so these must be $state. Without
// it the page renders empty, because the checks all run in onMount.
let rows: Row[] = $state([]);
let run = $state<(() => void) | null>(null);

/** Row ids, not labels, key the list: the download progress callback reports
 *  the same label on every tick, and keyed on the label Svelte throws
 *  `each_key_duplicate` and the whole list stops rendering. */
let seq = 0;
const add = (label: string, value: string, ok?: boolean | null, note?: string) => {
	rows.push({ id: ++seq, label, value, ok, note });
	rows = rows;
};

/** Replace a row in place, or add it when it is not there yet. */
const set = (label: string, value: string, ok?: boolean | null, note?: string) => {
	const found = rows.find((r) => r.label === label);
	if (found) Object.assign(found, { value, ok, note });
	else add(label, value, ok, note);
	rows = rows;
};

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// --- Isolation: required for multithreaded WASM ---------------------------
// --- Isolation: required for multithreaded WASM ---------------------------
// Client-only. Node 24 has a global `navigator`, so reading these at component
// init would not throw during SSR — it would render wrong values into the
// server HTML, which is worse than rendering nothing.
function isolation() {
	const isolated = globalThis.crossOriginIsolated === true;
	add(
		'Cross-origin isolated',
		String(isolated),
		isolated,
		isolated ? undefined : 'COOP/COEP are missing, so onnxruntime will use one thread'
	);
	const sab = typeof SharedArrayBuffer === 'function';
	add('SharedArrayBuffer', sab ? 'available' : 'absent', sab);
	add('hardwareConcurrency', String(navigator.hardwareConcurrency ?? 'unknown'));
}

// --- Storage -------------------------------------------------------------
async function storage() {
	try {
		const estimate = await navigator.storage?.estimate?.();
		add(
			'Storage quota',
			estimate ? `${fmt(estimate.quota ?? 0)} of ${fmt(estimate.usage ?? 0)} used` : 'unknown'
		);
	} catch {
		add('Storage quota', 'unavailable');
	}
	add('IndexedDB', indexedDB ? 'available' : 'absent', !!indexedDB);
}

function fmt(bytes: number): string {
	if (!bytes) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	let n = bytes;
	let i = 0;
	while (n >= 1024 && i < units.length - 1) {
		n /= 1024;
		i++;
	}
	return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Plain text, so it survives a paste into a chat window or an issue. */
function report(list: Row[]): string {
	const lines = list.map((r) => `${r.ok === true ? 'ok  ' : r.ok === false ? 'FAIL' : '-   '} ${r.label}: ${r.value}`);
	return ['fermentario diagnostics', new Date().toISOString(), ...lines].join('\n');
}

// --- WebGPU --------------------------------------------------------------
function webgpu() {
	const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
	if (!gpu) {
		add('WebGPU', 'not offered by this browser', false, 'The wasm backend will be used instead');
		return;
	}
	gpu
		.requestAdapter()
		.then((adapter) => {
			if (!adapter) {
				add('WebGPU', 'no adapter available', false);
				return;
			}
			const info = (adapter as { info?: { vendor?: string; architecture?: string } }).info;
			add('WebGPU', 'adapter available', true, info?.vendor ? `${info.vendor} ${info.architecture ?? ''}`.trim() : undefined);
		})
		.catch((err) => add('WebGPU', `requestAdapter failed: ${err}`, false));
}

// --- Speech and audio ---------------------------------------------------
function speech() {
	const sr = (window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown });
	const has = !!(sr.SpeechRecognition ?? sr.webkitSpeechRecognition);
	add(
		'SpeechRecognition',
		has ? 'available' : 'absent',
		has,
		has ? undefined : 'The Android WebView has none, so dictation needs another route'
	);
	const md = navigator.mediaDevices;
	add(
		'getUserMedia',
		md ? 'available' : 'absent',
		!!md,
		md ? undefined : 'Microphone capture is impossible without it'
	);
	if (typeof MediaRecorder === 'undefined') {
		add('MediaRecorder', 'absent', false);
		return;
	}
	const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
	const supported = types.filter((t) => MediaRecorder.isTypeSupported(t));
	add(
		'MediaRecorder mime types',
		supported.length ? supported.join(', ') : 'none of the common ones',
		supported.length > 0
	);
}

// --- The database engine -------------------------------------------------
async function engine() {
	try {
		const res = await fetch('/api/status');
		const d = await res.json();
		const db = d?.database;
		if (db?.vfs) {
			// The VFS decides whether a saved note is still there tomorrow. A
			// main-thread `opfs` VFS that is not the SAH pool reads and writes
			// perfectly and loses everything, so it is called out by name.
			const persistent = db.vfs === 'opfs-sahpool';
			add('SQLite file', db.file, true);
			add('Storage backend', db.vfs, persistent, persistent ? undefined : 'Writes may not survive a restart');
			add('Notes in the database', String(d.notes ?? 0));
			add('Seeded from the web journal', d.seeded ? 'yes, on first run' : 'no');
			return;
		}
		add('SQLite engine', 'the server is answering — this is the web app', true);
	} catch (err) {
		add('SQLite engine', `unavailable: ${(err as Error)?.message ?? err}`, false);
	}
}

// --- Inference (opt-in) -------------------------------------------------
let busy = false;
async function benchmark() {
	if (busy) return;
	busy = true;
	try {
		const { pipeline, env } = await import('@huggingface/transformers');
		add('transformers.js', 'loaded');
		const t0 = performance.now();
		const pipe = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
			dtype: 'q4f16',
			device: ((navigator as { gpu?: unknown }).gpu ? 'webgpu' : 'wasm') as 'webgpu' | 'wasm',
			progress_callback: (p: { status?: string; progress?: number }) => {
				if (p.status === 'progress' && typeof p.progress === 'number') {
					set('Downloading', `${Math.round(p.progress)}%`, null, 'A one-off 488 MB download');
				}
			}
		});
		add('Model loaded', `${Math.round(performance.now() - t0)} ms`, null, env.localModelPath ?? '');

		const messages = [
			{ role: 'system', content: 'Reply with one short sentence.' },
			{ role: 'user', content: 'Name three colours.' }
		];
		const streamer = new (await import('@huggingface/transformers')).TextStreamer(
			pipe.tokenizer,
			{
				skip_prompt: true,
				callback_function: (chunk: string) => {
					firstToken ??= performance.now();
					text += chunk;
				}
			}
		);
		let firstToken: number | null = null;
		let text = '';
		const t1 = performance.now();
		await (pipe as unknown as (m: unknown, o: unknown) => Promise<unknown>)(messages, {
			max_new_tokens: 64,
			do_sample: false,
			streamer
		});
		const elapsed = (performance.now() - t1) / 1000;
		const words = text.trim().split(/\s+/).filter(Boolean).length;
		add('Time to first token', `${Math.round((firstToken ?? 0) - t1)} ms`);
		add('Speed', `${(words / elapsed).toFixed(1)} words/sec over ${elapsed.toFixed(1)} s`, null, 'Below ~4 words/sec an answer feels broken on a phone');
	} catch (err) {
		add('Inference', `failed: ${(err as Error)?.message ?? err}`, false);
	} finally {
		busy = false;
	}
}

onMount(() => {
	// Everything that touches window, navigator or document happens here. The
	// web app still server-renders, so touching them at component init throws
	// "window is not defined" and the page 500s.
	const tauri = isTauri();
	add('Tauri', tauri ? 'yes' : 'no — running in a plain browser', tauri);
	add('User agent', navigator.userAgent);
	isolation();
	storage();
	webgpu();
	speech();
	engine();
	run = benchmark;
});
</script>

<svelte:head><title>Diagnostics</title></svelte:head>

<div class="mx-auto max-w-2xl px-6 pt-14 pb-24">
	<button
		type="button"
		class="mb-4 inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
		onclick={goBack}><ArrowLeft class="h-3.5 w-3.5" /> Back</button
	>
	<h1 class="text-2xl font-semibold">Diagnostics</h1>
	<p class="mt-2 text-sm text-stone-600">
		Everything here is measured, not assumed. Copy the result when reporting a problem.
	</p>

	<div class="mt-6 flex flex-wrap gap-2">
		<button
			class="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-stone-50 disabled:opacity-40"
			disabled={!run}
			onclick={() => run?.()}>Measure inference speed</button
		>
		<button
			class="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
			onclick={() => navigator.clipboard?.writeText(report(rows))}>Copy report</button
		>
	</div>
	<p class="mt-2 text-xs text-stone-500">
		The button above downloads the 0.5 B model once, about 488 MB, and keeps it in the app
		cache. Nothing is downloaded until you press it.
	</p>

	<dl class="mt-6 divide-y divide-stone-200 border-t border-stone-200">
		{#each rows as r (r.id)}
			<div class="grid grid-cols-[1fr_auto] gap-4 py-2 text-sm">
				<dt class="text-stone-700">
					{r.label}
					{#if r.note}<span class="block text-xs text-stone-500">{r.note}</span>{/if}
				</dt>
				<dd class="text-right font-mono text-xs">
					{#if r.ok === true}<span class="text-emerald-700">ok</span>{/if}
					{#if r.ok === false}<span class="text-rose-700">{r.value}</span>{/if}
					{#if r.ok === null || r.ok === undefined}{r.value}{/if}
				</dd>
			</div>
		{/each}
	</dl>
</div>
