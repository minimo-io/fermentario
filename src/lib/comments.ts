export type CommentOrder = {
	id: string;
	created_at: number;
	pinned: boolean;
};

/**
 * Pinned comments first, then newest first. The database uses the same order
 * (`pinned DESC, created_at DESC, id DESC`); the client re-sorts after an add
 * or a pin so the list updates without a reload.
 */
export function sortComments<T extends CommentOrder>(comments: T[]): T[] {
	return [...comments].sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		if (a.created_at !== b.created_at) return b.created_at - a.created_at;
		if (a.id === b.id) return 0;
		return a.id < b.id ? 1 : -1;
	});
}
