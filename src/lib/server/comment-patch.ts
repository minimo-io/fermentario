import type { CommentPatch } from '$lib/platform/journal';

/**
 * Read a comment PATCH body. A caller may send `{ content }`, `{ pinned }` or
 * both. Return null when the body has no usable field, so a bad request can
 * never erase the content or flip the pin by accident.
 */
export function parseCommentPatch(body: unknown): CommentPatch | null {
	if (!body || typeof body !== 'object') return null;
	const raw = body as { content?: unknown; pinned?: unknown };
	const patch: CommentPatch = {};

	if (raw.content !== undefined) {
		const content = String(raw.content).trim();
		if (!content) return null;
		patch.content = content;
	}
	if (raw.pinned !== undefined) {
		if (typeof raw.pinned !== 'boolean') return null;
		patch.pinned = raw.pinned;
	}
	return patch.content === undefined && patch.pinned === undefined ? null : patch;
}
