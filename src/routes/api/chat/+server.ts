import { json } from '@sveltejs/kit';
import { retrieve, ensureIndexed, contextFor } from '$lib/server/rag';
import { chat, resetModel } from '$lib/server/models';
import { insertAsk } from '$lib/server/db';

function sseEvent(controller: ReadableStreamDefaultController<Uint8Array>, data: unknown) {
	const encoder = new TextEncoder();
	controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const question = String(body?.question ?? '').trim();
	const history: { role: string; content: string }[] = Array.isArray(body?.history) ? body.history : [];

	if (!question) {
		return json({ error: 'empty question' }, { status: 400 });
	}

	let close: () => void = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			close = () => controller.close();

			(async () => {
				try {
					sseEvent(controller, { preparing: true });
					await ensureIndexed();
					const retrieved = await retrieve(question, { topK: 6 });
					const context = contextFor(retrieved);

					const system = [
						'You are a thoughtful companion who answers questions strictly from the excerpts of the user\'s private voice journal below.',
						'Quote or paraphrase only what the notes support. If the notes do not contain the answer, say so plainly.',
						'Keep answers warm, concise and human. Write 60-140 words unless the question demands more.',
						'',
						'--- Journal excerpts ---',
						context || '(no notes available yet)'
					].join('\n');

					const messages: { role: string; content: string }[] = [
						{ role: 'system', content: system },
						...history.slice(-8),
						{ role: 'user', content: question }
					];

				const full = await chat(messages, {
					maxNewTokens: 400,
					signal: request.signal,
					onToken: (chunk) => sseEvent(controller, { t: chunk })
				});

				// A cancelled answer is never stored: a partial reply must not
				// appear later as a finished entry.
				if (request.signal.aborted) {
					resetModel('chat');
					return;
				}

				const sources = retrieved.map((r) => ({
						id: r.note.id,
						at: r.note.created_at,
						content: r.note.content
					}));
					let entryId: string | undefined;
					try {
						entryId = full && full.trim() ? insertAsk(question, full, JSON.stringify(sources)) : undefined;
					} catch (err) {
						console.error('Failed to save ask history:', err);
					}

					sseEvent(controller, {
						done: true,
						full,
						entryId,
						sources
					});
			} catch (err) {
				if (request.signal.aborted) return;
				try {
					sseEvent(controller, { error: String((err as Error)?.message ?? err) });
				} catch {
					// The client is gone; nothing to report.
				}
			} finally {
				try {
					close();
				} catch {
					// Already closed or cancelled.
				}
			}
			})();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no'
		}
	});
}