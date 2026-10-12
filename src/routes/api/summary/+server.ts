import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { countNotes, latestTimestamp, notesBetween, getWeeklyRecap, saveWeeklyRecap } from '$lib/server/db';
import { ensureIndexed } from '$lib/server/rag';
import { chat, setActiveChatModel } from '$lib/server/models';
import { getCachedSummary, setCachedSummary, summaryLocks } from '$lib/server/summary-cache';
import { DEFAULT_CHAT_MODEL_ID } from '$lib/chat-models';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const LANG_DIRECTIVE: Record<string, string> = {
	en: 'Write the response in English.',
	es: 'Escribe la respuesta en español.',
	pt: 'Escreva a resposta em português.'
};

const REFUSAL_FALLBACK: Record<string, string> = {
	en: 'The weekly recap could not be generated this time. Try again in a moment.',
	es: 'No se pudo generar el resumen semanal esta vez. Inténtalo de nuevo en un momento.',
	pt: 'Não foi possível gerar o resumo semanal desta vez. Tente novamente em um momento.'
};

const REFUSAL = /\b(I'?m sorry|(can'?t|cannot)\s+(assist|help|do)|I\s+can'?t\s+(assist|help))\b/i;

function clean(text: string): string {
	let t = text.trim();
	const head = t.match(/^[^\n]+:\s*\n\n?/);
	if (head) t = t.slice(head[0].length).trim();
	t = t.split(/\n\s*\n/)[0].trim();
	t = t.replace(/^(summary|recap):\s*/i, '').trim();
	if (t.startsWith('"') && t.endsWith('"') && t.length > 1) t = t.slice(1, -1).trim();
	return t;
}

const SPARSE_HEAD: Record<string, string> = {
	en: 'The notes this week were just a few short entries:',
	es: 'Las notas de esta semana fueron solo unas pocas entradas cortas:',
	pt: 'As notas desta semana foram apenas algumas entradas curtas:'
};

const SPARSE_TAIL: Record<string, string> = {
	en: 'There was no other content.',
	es: 'No había más contenido.',
	pt: 'Não havia mais conteúdo.'
};

const SPARSE_WORD_LIMIT = 40;

const DEFAULT_INSTRUCTION =
	"Write one paragraph summarizing the following notes. Do not make things up, just a short summary of what's in the notes:";
const MAX_PROMPT_LENGTH = 2000;

/** Cheap non-cryptographic hash so the memo and lock keys change with the
 *  prompt. Without this a recap built with a custom prompt would be served
 *  from the cache of a default-prompt recap for the same week. */
function promptHash(prompt: string): string {
	let h = 5381;
	for (let i = 0; i < prompt.length; i++) h = ((h * 33) ^ prompt.charCodeAt(i)) >>> 0;
	return h.toString(36);
}

export async function GET({ url }: RequestEvent) {
	const force = url.searchParams.get('rf') === '1';
	const lang = url.searchParams.get('lang') ?? 'en';
	const model = url.searchParams.get('model') ?? DEFAULT_CHAT_MODEL_ID;
	const prompt = (url.searchParams.get('prompt') ?? '').trim().slice(0, MAX_PROMPT_LENGTH);
	setActiveChatModel(model);
	const now = Date.now();
	const since = now - WEEK_MS;
	const recent = notesBetween(since, now);

	if (recent.length === 0) {
		return json({ exists: false, week: null });
	}

	const notesText = recent.map((n) => n.content.trim()).join('\n');
	const wordCount = notesText.split(/\s+/).filter(Boolean).length;

	const weekKey = String(Math.floor(now / WEEK_MS));
	const stored = getWeeklyRecap(weekKey);
	if (!force && stored) {
		// show the stored recap immediately — a recompute replaces it on the next write
		return json({ exists: true, week: stored.content, cached: true });
	}

	const key = `${countNotes()}:${latestTimestamp()}:${promptHash(prompt)}`;
	const memo = getCachedSummary(key);
	if (!force && memo !== null) {
		return json({ exists: true, week: memo });
	}

	if (summaryLocks[key] !== undefined) {
		return json({ exists: true, week: await summaryLocks[key] });
	}

	if (wordCount < SPARSE_WORD_LIMIT) {
		const quotes = recent.map((n) => `"${n.content.trim()}"`).join(', ');
		const text = `${SPARSE_HEAD[lang] ?? SPARSE_HEAD.en} ${quotes}. ${SPARSE_TAIL[lang] ?? SPARSE_TAIL.en}`;
		setCachedSummary(key, text);
		saveWeeklyRecap(weekKey, text);
		return json({ exists: true, week: text, cached: false });
	}

	const task = (async () => {
		await ensureIndexed();

		const text = await chat(
			[
				{
					role: 'system',
					content:
						'You write short summaries of private journal notes.'
				},
				{
					role: 'user',
					// A custom prompt replaces the built-in instruction only; the
					// notes and the language directive stay below it in that order.
					content:
						`${prompt || DEFAULT_INSTRUCTION}\n\n` +
						`${notesText}\n\n` +
						(LANG_DIRECTIVE[lang] ?? LANG_DIRECTIVE.en)
				}
			],
			{ maxNewTokens: 256, sample: true }
		);

		return text && !REFUSAL.test(text) ? clean(text) : (REFUSAL_FALLBACK[lang] ?? REFUSAL_FALLBACK.en);
	})();

	summaryLocks[key] = task;
	try {
		const text = await task;
		setCachedSummary(key, text);
		saveWeeklyRecap(weekKey, text);
		return json({ exists: true, week: text, cached: false });
	} finally {
		delete summaryLocks[key];
	}
}
