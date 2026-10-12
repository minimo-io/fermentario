import { pipeline, env, TextStreamer } from '@huggingface/transformers';
import type { PretrainedModelOptions } from '@huggingface/transformers';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DEFAULT_CHAT_MODEL_ID, CHAT_MODELS } from '$lib/chat-models';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

const CHAT_REPO: Record<string, string> = Object.fromEntries(CHAT_MODELS.map((m) => [m.id, m.repo]));

let activeChatModelId = DEFAULT_CHAT_MODEL_ID;
let readyChatModelId: string | null = null;

export function setActiveChatModel(id: string): boolean {
	if (!CHAT_REPO[id]) return false;
	const changed = id !== activeChatModelId;
	activeChatModelId = id;
	if (changed) {
		readyChatModelId = null;
		chatPromise = null;
		modelProgress.chat = { phase: 'idle', pct: null, message: 'Not started', error: null, updatedAt: 0 };
	}
	warmChatModel();
	return true;
}

export function getActiveChatModelId(): string {
	return activeChatModelId;
}

export function getChatModelReady(): boolean {
	return readyChatModelId === activeChatModelId && chatPromise !== null;
}

export type ModelPhase = 'idle' | 'download' | 'load' | 'ready' | 'error';
export type ModelProgress = {
	phase: ModelPhase;
	pct: number | null;
	message: string;
	error: string | null;
	updatedAt: number;
};

export const modelProgress: Record<'embedding' | 'chat', ModelProgress> = {
	embedding: { phase: 'idle', pct: null, message: 'Not started', error: null, updatedAt: 0 },
	chat: { phase: 'idle', pct: null, message: 'Not started', error: null, updatedAt: 0 },
};

export function pushProgress(
	kind: 'embedding' | 'chat',
	p: {
		status?: string;
		file?: string;
		progress?: number;
		loaded?: number;
		total?: number;
	}
): void {
	const s = modelProgress[kind];
	s.updatedAt = Date.now();
	if (p.status === 'initiate') { s.phase = 'download'; s.message = p.file ?? 'Preparing…'; return; }
	if (p.status === 'download') { s.pct = 0; s.message = 'Downloading…'; return; }
	if (p.status === 'progress') { s.pct = Math.round((p.progress ?? 0) * 100); s.message = `${s.pct}% of model downloaded or read from cache`; return; }
	if (p.status === 'done') { s.pct = 100; s.message = 'Downloaded or cached'; return; }
	if (p.status === 'ready') { s.phase = 'ready'; s.pct = 100; s.message = 'Loaded'; return; }
	if (p.status === 'error') { s.phase = 'error'; s.error = p.file ? `Failed near ${p.file}.` : 'Model failed to load.'; s.message = s.error; return; }
}

export function resetModel(kind: 'embedding' | 'chat'): void {
	modelProgress[kind] = { phase: 'idle', pct: null, message: 'Not started', error: null, updatedAt: 0 };
	if (kind === 'embedding') embedderPromise = null;
	else {
		chatPromise = null;
		readyChatModelId = null;
	}
}


const cacheDir = resolve(process.env['FERMENTARIO_MODEL_CACHE'] ?? '.cache/transformers');
mkdirSync(cacheDir, { recursive: true });
env.cacheDir = cacheDir;

export interface ChatPayload {
	maxNewTokens?: number;
	sample?: boolean;
	onToken?: (chunk: string) => void;
	signal?: AbortSignal;
}

// The transformers.js `pipeline()` overloads return a wide union; we cast to the
// callable shape we actually use. Runtime behaviour is fully supported.
type CallableTextGeneration = (model: unknown, opts: unknown) => Promise<unknown> & {
	tokenizer: { decode: (tokens: number[]) => string };
};

type ModelLoadState = {
	phase: 'idle' | 'loading' | 'ready' | 'error';
	pct: number | null;
	error: string | null;
};

export const modelLoadState: Record<'embedding' | 'chat', ModelLoadState> = {
	embedding: { phase: 'idle', pct: null, error: null },
	chat: { phase: 'idle', pct: null, error: null }
};

function setModelProgress(
	kind: 'embedding' | 'chat',
	p: { status?: string; progress?: number; loaded?: number; total?: number; file?: string }
): void {
	const s = modelLoadState[kind];
	if (p.status === 'error') {
		s.phase = 'error';
		s.error = `Download failed near '${p.file ?? 'a model file'}'.`;
		return;
	}
	if (p.status === 'progress' && typeof p.progress === 'number') s.pct = Math.round(p.progress * 100);
}

function loadDone(kind: 'embedding' | 'chat'): void {
	modelLoadState[kind] = { phase: 'ready', pct: 100, error: null };
}

function loadFailed(kind: 'embedding' | 'chat', msg: string): void {
	modelLoadState[kind] = { phase: 'error', pct: null, error: msg };
}

async function getEmbedder(): Promise<CallableTextGeneration> {
	const embedder = await pipeline('feature-extraction', EMBEDDING_MODEL, {
		pooling: 'mean',
		normalize: true,
		progress_callback: (p: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }) =>
			setModelProgress('embedding', p)
	} as unknown as PretrainedModelOptions);
	return embedder as unknown as CallableTextGeneration;
}

async function getChatModel(): Promise<CallableTextGeneration> {
	const repo = CHAT_REPO[activeChatModelId];
	// If the model is already local, load it without any remote Hub check —
	// otherwise a cached load can stall waiting on the network.
	// Only force local-only when the full weight file is present; a partial
	// cache (config/tokenizer present, weights missing) must be allowed to
	// fall back to a real download instead of throwing.
	const local = chatModelDownloaded(activeChatModelId);
	const previousRemote = env.allowRemoteModels;
	if (local) env.allowRemoteModels = false;
	try {
		const chatModel = (await pipeline('text-generation', repo, {
			dtype: 'int8',
			progress_callback: (p: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }) =>
				setModelProgress('chat', p)
		})) as unknown as CallableTextGeneration & {
			tokenizer: { decode: (tokens: number[]) => string };
		};
		return chatModel;
	} finally {
		if (local) env.allowRemoteModels = previousRemote;
	}
}

let embedderPromise: Promise<CallableTextGeneration> | null = null;
let chatPromise: Promise<CallableTextGeneration> | null = null;

/** True when the selected chat model's weights are fully present in the cache. */
export function chatModelDownloaded(id: string): boolean {
	const repo = CHAT_REPO[id];
	if (!repo) return false;
	return existsSync(join(cacheDir, repo, 'onnx', 'model_int8.onnx'));
}

function loadChat(): Promise<CallableTextGeneration> {
	return getChatModel()
		.then((m) => {
			readyChatModelId = activeChatModelId;
			modelProgress.chat.phase = 'ready';
			modelProgress.chat.message = 'Loaded';
			return m;
		})
		.catch((err) => {
			modelProgress.chat.phase = 'error';
			modelProgress.chat.message = err instanceof Error ? err.message : 'Chat model failed to load.';
			chatPromise = null;
			readyChatModelId = null;
			throw err;
		});
}

function ensureChatLoad(): Promise<CallableTextGeneration> {
	return (chatPromise ??= loadChat());
}

/** Start (or resume) loading the active chat model; idempotent. Never rejects. */
export function warmChatModel(): void {
	void ensureChatLoad().catch(() => {});
}

export async function embed(text: string): Promise<Float32Array> {
	const embedder = await (embedderPromise ??= getEmbedder());
	const output = await (embedder as unknown as (i: { input: string }, o: unknown) => Promise<unknown>)({ input: text }, {});
	const data = (output as unknown as { data: { data: Float32Array } | Float32Array }).data;
	const d = 'data' in (data as object) ? (data as { data: Float32Array }).data : (data as Float32Array);
	return d as Float32Array;
}

export async function chat(
	messages: { role: string; content: string }[],
	opts: ChatPayload = {}
): Promise<string> {
	const model = await ensureChatLoad();

	const REFUSAL = /\b(I'?m sorry|(can'?t|cannot)\s+(assist|help|do)|I\s+can'?t\s+(assist|help))\b/i;

	const generate = async (sample: boolean, injected: string) => {
		let full = '';
		const streamer = new TextStreamer((model as unknown as { tokenizer: { decode: (t: number[]) => string } }).tokenizer as never, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: (chunk: string) => {
				// Unwind the generation on the next token once the caller aborts.
				// The decode loop runs between steps, so leaving early does not
				// corrupt the ONNX session; the caller resets it when it needs to.
				if (opts.signal?.aborted) throw new DOMException('Generation aborted', 'AbortError');
				full += chunk;
				opts.onToken?.(chunk);
			}
		});

		const callable = model as unknown as (messages: unknown, opts: unknown) => Promise<unknown>;
		const payload = {
			max_new_tokens: opts.maxNewTokens ?? 512,
			do_sample: sample,
			...(sample ? { temperature: 0.9, repetition_penalty: 1.1 } : {}),
			streamer
		};
		const msgs = injected
			? [...messages, { role: 'user', content: injected }]
			: messages;

		await callable(msgs, payload);
		return full.trim();
	};

	let text = await generate(opts.sample ?? false, '');
	if (REFUSAL.test(text) && !opts.signal?.aborted) {
		text = await generate(true, 'The weekly recap may not be empty. Begin the summary now.');
	}

	return text;
}

/** Cosine similarity over (already unit-normalized) vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) dot += a[i] * b[i];
	return dot;
}