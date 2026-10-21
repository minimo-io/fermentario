import { json, type RequestEvent } from '@sveltejs/kit';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { countNotes } from '$lib/server/db';
import { getJournalStatus } from '$lib/server/journal-store';
import { modelProgress, resetModel, getActiveChatModelId, getChatModelReady, warmChatModel, setActiveChatModel, chatModelDownloaded } from '$lib/server/models';

const cacheDir = process.env['FERMENTARIO_MODEL_CACHE'] ?? '.cache/transformers';

function hasModel(substring: string): boolean {
	if (!existsSync(cacheDir)) return false;
	try {
		const walk = (dir: string): boolean =>
			readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && walk(join(dir, e.name))) ||
			readdirSync(dir).some((n) => n.toLowerCase().includes(substring));
		return walk(cacheDir);
	} catch {
		return false;
	}
}

export async function GET() {
	const chatModel = getActiveChatModelId();
	const downloaded = chatModelDownloaded(chatModel);
	// Warm only when the model is already downloaded: loading from disk is
	// quick and never touches the network. A model that still needs a download
	// is left in 'requires download' until the user triggers it (Re-brew), to
	// avoid background downloads hammering the Hub on every poll.
	if (!getChatModelReady() && downloaded && modelProgress.chat.phase !== 'error') warmChatModel();
	const journal = getJournalStatus();
	return json({
		notes: journal.state === 'active' ? countNotes() : 0,
		embedding: hasModel('minilm'),
		chat: hasModel('qwen'),
		chatModel,
		chatReady: getChatModelReady(),
		chatDownloaded: downloaded,
		modelCache: cacheDir,
		progress: {
			embedder: modelProgress.embedding,
			chat: modelProgress.chat
		}
	});
}

export async function POST({ request }: RequestEvent) {
	const b = (await request.json().catch(() => ({}))) as { kind?: string; id?: string };
	if (b.kind === 'chatModel' && typeof b.id === 'string') {
		setActiveChatModel(b.id);
		return json({ ok: true });
	}
	if (b.kind === 'embedding' || b.kind === 'chat') resetModel(b.kind);
	return json({ ok: true });
}