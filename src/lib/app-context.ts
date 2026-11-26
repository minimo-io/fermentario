import type { Note } from './types';

/** Shared key for the admin shell context. Routes are thin: the `admin`
 *  layout owns journal state and hands slices to each section page,
 *  which forwards them to the tab components as plain props. */
export const APP_KEY = Symbol('fermentario.app');

export interface NotesContext {
	featured: Note[];
	notes: Note[];
	/** The published-only filter pill state. */
	publishedOnly: boolean;
	onTogglePublished: () => void;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	onDeleteNote: (id: string) => void;
	onEditNote: (id: string, content: string, video?: string, createdAt?: number, title?: string) => Promise<void>;
	onFeatureNote: (note: Note) => void;
	onPublishNote: (note: Note) => void;
	onCoverNote: (note: Note, coverId: string | null) => void;
	onRemoveTag: (noteId: string, tag: string) => void;
}

export interface DisplayContext {
	lang: string;
	widthClass: string;
}

/** Per-ticker quote refresh, owned by the admin layout and shared with the
 *  Trading page, which is a child route rather than a layout prop. */
export interface MarketContext {
	onRefreshTicker: (ticker: string) => void;
	refreshingTicker: string | null;
}

export interface AppContext {
	notes: NotesContext;
	display: DisplayContext;
	market: MarketContext;
	onError: (message: string) => void;
}
