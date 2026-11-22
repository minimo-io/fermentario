import { getNote } from '$lib/server/db';
import { inlineMarkdown } from '$lib/markdown-inline';
import { esc, htmlShell } from '$lib/print';
import { youTubeWatchUrl } from '$lib/youtube';

/** Printable single note. The browser print dialog saves it as PDF; there is
 *  no download and no server-side PDF. */
export async function GET({ params }) {
	const note = getNote(params.id);
	if (!note) {
		return new Response('Note not found.', {
			status: 404,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}

	const firstLine = note.content.split('\n')[0].trim();
	const title = (note.title?.trim() || firstLine).slice(0, 60) || 'Note';
	const date = new Date(note.created_at).toLocaleString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
	const tags = (note.tags ?? []).map((t) => `#${t}`).join(' ');
	const cover = note.coverId
		? `<img class="cover" src="/api/notes/photos/${encodeURIComponent(note.coverId)}" alt="" />`
		: '';
	const video = note.video
		? `<p class="muted">YouTube: ${esc(youTubeWatchUrl(note.video))}</p>`
		: '';

	const body = `<article>
	<p class="meta">${esc(date)}${note.updated_at > note.created_at ? ' · edited' : ''}</p>
	${cover}
	<div class="content">${inlineMarkdown(note.content)}</div>
	${tags ? `<p class="tags">${esc(tags)}</p>` : ''}
	${video}
</article>`;

	const html = htmlShell(title, () => body, {
		buttonLabel: 'Save as PDF',
		extraCss: `
  .meta { color: #666; font-size: 13px; margin: 0 0 16px; }
  .cover { display: block; max-height: 80mm; margin: 0 0 16px; border-radius: 6px; object-fit: cover; }
  .content { font-size: 15px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .tags { margin: 16px 0 0; color: #555; font-size: 13px; }
  a { color: #111; }
`
	});

	return new Response(html, {
		status: 200,
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy':
				"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:",
			'x-content-type-options': 'nosniff',
			'cache-control': 'no-store'
		}
	});
}
