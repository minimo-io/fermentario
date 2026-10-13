/** YouTube references on notes. The stored value is the 11-char video id,
 *  never the raw URL, so an embed can never point anywhere but YouTube. */

const ID = '[A-Za-z0-9_-]{11}';

/** Extract the video id from watch, short, embed, live, and shorts URLs. */
export function extractYouTubeId(url: string): string | null {
	const raw = url.trim();
	if (!raw) return null;
	const m =
		raw.match(/[?&]v=([A-Za-z0-9_-]{11})/) ??
		raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ??
		raw.match(/youtube\.com\/(?:embed|live|shorts)\/([A-Za-z0-9_-]{11})/);
	if (!m) return null;
	return new RegExp(`^${ID}$`).test(m[1]) ? m[1] : null;
}

export function youTubeWatchUrl(id: string): string {
	return `https://www.youtube.com/watch?v=${id}`;
}

export function youTubeEmbedUrl(id: string): string {
	return `https://www.youtube.com/embed/${id}`;
}

export function youTubeThumbnailUrl(id: string): string {
	return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
