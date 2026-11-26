import { getNote } from '$lib/server/db';
import { renderNoteContent } from '$lib/note-links';
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
	<div class="content markdown-body ${note.monospace ? 'monospace' : ''}">${renderNoteContent(note.content, note.linkedNotes)}</div>
	${tags ? `<p class="tags">${esc(tags)}</p>` : ''}
	${video}
</article>`;

	const html = htmlShell(title, () => body, {
		buttonLabel: 'Save as PDF',
		extraCss: `
  .meta { color: #666; font-size: 13px; margin: 0 0 16px; }
  .cover { display: block; max-height: 80mm; margin: 0 0 16px; border-radius: 6px; object-fit: cover; }
  .content { font-size: 15px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .content.monospace { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 { font-weight: 700; line-height: 1.25; margin: 0.85em 0 0.3em; }
  .content h1 { font-size: 1.45em; } .content h2 { font-size: 1.3em; } .content h3 { font-size: 1.15em; }
  .content ul { list-style: disc; padding-left: 1.5em; } .content ol { list-style: decimal; padding-left: 1.5em; }
  .content blockquote { border-left: 3px solid #a8a29e; margin-left: 0; padding-left: 0.8em; color: #666; }
  .content pre, .content code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .content pre { overflow-x: auto; background: #f5f5f4; border-radius: 6px; padding: 12px; }
  .content code { background: #f5f5f4; border-radius: 3px; padding: 1px 3px; }
  .content pre code { background: none; padding: 0; }
  .content table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; white-space: normal; }
  .content th, .content td { border: 1px solid #d6d3d1; padding: 4px 8px; text-align: left; }
  .content img { max-width: 100%; height: auto; }
  .content .wiki-link { border-radius: 999px; background: #e7e5e4; padding: 1px 8px; font-size: .86em; font-weight: 600; }
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
