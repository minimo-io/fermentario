import type { LinkRef } from './platform/journal';

export interface Note {
	id: string;
	content: string;
	created_at: number;
	updated_at: number;
	tags?: string[];
	pending?: boolean;
	featured?: boolean;
	video?: string;
	commentCount?: number;
	linkedNotes?: LinkRef[];
}

export type HoldingCategory = 'btc' | 'fii' | 'cash';

export type HoldingActionKind = 'opening' | 'buy' | 'sell';

export interface HoldingAction {
	id: string;
	holding_id: string;
	kind: HoldingActionKind;
	amount: number;
	/** Unit price at the time of the action; null when no quote was cached. */
	price: number | null;
	currency: string;
	created_at: number;
}

export interface Holding {
	id: string;
	ticker: string;
	amount: number;
	price: number | null;
	priceAuto: boolean;
	currency: string;
	category: HoldingCategory;
	goal: number | null;
	bank: string;
	country: string;
	position: number;
	created_at: number;
	updated_at: number;
	/** Last write of `price` (quote refresh or hand edit); 0 when never set. */
	price_updated_at: number;
	/** Average cost per unit on the opening row; null until set. */
	avgPrice: number | null;
	valueUsd?: number;
}

/** Buys and sells per calendar day, for the investments heatmap. */
export interface TradeDay {
	day: string;
	buys: number;
	sells: number;
}

export interface TradeHistoryItem {
	id: string;
	holding_id: string;
	ticker: string;
	bank: string;
	category: HoldingCategory;
	kind: 'buy' | 'sell';
	amount: number;
	price: number | null;
	currency: string;
	created_at: number;
}

export interface TradeHistoryCursor {
	created_at: number;
	id: string;
}

export interface TradeHistoryPage {
	items: TradeHistoryItem[];
	count: number;
	hasMore: boolean;
	nextCursor: TradeHistoryCursor | null;
}

export interface CategoryShare {
	category: HoldingCategory;
	actual: number;
	goal: number;
}

/** Absolute target, independent from the percent allocation goals. */
export interface CategoryValueGoal {
	amount: number;
	currency: string;
}

export interface CategoryValueProgress {
	category: HoldingCategory;
	target: number;
	currency: string;
	/** Current category value in the target currency; null when no rate exists. */
	actual: number | null;
	/** Current category value in USD, the value the totals use. */
	actualUsd: number;
	/** target - actual; null when no rate exists. */
	gap: number | null;
	/** actual / target * 100; null when no rate exists. */
	pct: number | null;
}

export interface HoldingsSummary {
	holdings: Holding[];
	totalUsd: number;
	asOf: number | null;
	/** True when a needed rate is missing or older than a day. */
	stale: boolean;
	goals: { btc: number; fii: number; cash: number } | null;
	/** Independent absolute targets; null when none are set. */
	valueGoals: { btc: CategoryValueGoal | null; fii: CategoryValueGoal | null; cash: CategoryValueGoal | null } | null;
	/** Progress for each category that has an absolute target. */
	valueProgress: CategoryValueProgress[];
	actual: { btc: number; fii: number; cash: number };
	/** Categories off their goal by more than 5 points. */
	drift: CategoryShare[];
	displayTotals: { USD: number; BRL: number | null; UYU: number | null };
}

export interface ChatCtx {
	role: 'user' | 'assistant';
	content: string;
}

export interface AskSource {
	id: string;
	at: number;
	content: string;
}

export interface AskEntry {
	id: string;
	question: string;
	answer: string;
	sources: AskSource[];
	created_at: number;
}

export interface TodoGroup {
	id: string;
	name: string;
	position: number;
	created_at: number;
}

export interface TodoItem {
	id: string;
	group_id: string;
	content: string;
	done: boolean;
	done_at: number;
	inProgress?: boolean;
	commentCount?: number;
	subgroup: string;
	position: number;
	created_at: number;
	updated_at: number;
	tags: string[];
}

export interface Principle {
	id: string;
	content: string;
	position: number;
	created_at: number;
	video: string;
	tags: string[];
	commentCount: number;
	linkedNotes?: LinkRef[];
}

export interface PrincipleComment {
	id: string;
	principle_id: string;
	content: string;
	created_at: number;
	pinned: boolean;
}

export interface TaskComment {
	id: string;
	item_id: string;
	content: string;
	created_at: number;
	pinned: boolean;
}

export interface NoteComment {
	id: string;
	note_id: string;
	content: string;
	created_at: number;
	pinned: boolean;
}

export interface TodoProgressItem extends TodoItem {
	groupName: string;
}

export interface TodoDoneCursor {
	done_at: number;
	id: string;
}

export interface TodoDonePage {
	items: TodoProgressItem[];
	count: number;
	hasMore: boolean;
	nextCursor: TodoDoneCursor | null;
}
