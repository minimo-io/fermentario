import type { Note, AskEntry, AskSource } from './types';

/** Shared key for the admin shell context. Routes are thin: the `admin`
 *  layout owns journal state and hands slices to each section page,
 *  which forwards them to the tab components as plain props. */
export const APP_KEY = Symbol('fermentario.app');

export interface NotesContext {
	week: string | null;
	dismissed: boolean;
	summaryLoading: boolean;
	reading: boolean;
	onReadWeekly: () => void;
	onDismissWeekly: () => void;
	featured: Note[];
	notes: Note[];
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
	onDeleteNote: (id: string) => void;
	onEditNote: (id: string, content: string, video?: string, createdAt?: number) => Promise<void>;
	onFeatureNote: (note: Note) => void;
	onPublishNote: (note: Note) => void;
	onCoverNote: (note: Note, coverId: string | null) => void;
	onRemoveTag: (noteId: string, tag: string) => void;
	onCopyLoaded: () => void;
	copied: boolean;
}

export interface AskContext {
	asks: AskEntry[];
	lastQuestion: string;
	answer: string;
	answerSources: AskSource[];
	answering: boolean;
	answerStopped: boolean;
	onDeleteAsk: (id: string) => void;
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
	ask: AskContext;
	display: DisplayContext;
	market: MarketContext;
	onError: (message: string) => void;
}
