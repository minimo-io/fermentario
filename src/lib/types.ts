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
	/** Previous daily snapshot value; null until the second snapshot. */
	previous_value: number | null;
	previous_value_at: number;
	/** Average cost per unit on the opening row; null until set. */
	avgPrice: number | null;
	valueUsd?: number;
	/** Current value versus the previous snapshot, in percent; null when unknown. */
	changePct?: number | null;
}

/** One daily value point for a holding, in native currency and USD. */
export interface HoldingValuePoint {
	day: string;
	amount: number;
	price: number | null;
	value: number;
	currency: string;
	value_usd: number;
	recorded_at: number;
}

/** One daily portfolio total point, in USD. */
export interface PortfolioValuePoint {
	day: string;
	value_usd: number;
	recorded_at: number;
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
	/** Previous day's portfolio total; null on the first day. */
	previousTotalUsd: number | null;
	/** Current total versus the previous day, in percent; null when unknown. */
	totalChangePct: number | null;
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
	video: string;
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

export type StockKind = 'consumable' | 'durable';

export interface StockItemPhoto {
	id: string;
	created_at: number;
}

/** Amount goal for one consumable category. `amount` is per person; the
 *  target is `people × amount` in `unit` (g, kg, ml or L). */
export interface StockCategoryGoal {
	category_id: string;
	category: string;
	/** Parent group label (Food, Fun…); empty when unset. */
	group: string;
	people: number;
	amount: number;
	unit: string;
	note: string;
	target: number;
}

/** One logged consumption of a consumable. Amounts stay in the unit the
 *  user consumed in; `packages` is the deducted stock in package units. */
export interface StockAction {
	id: string;
	item_id: string;
	kind: string;
	amount: number;
	unit: string;
	packages: number;
	note: string;
	created_at: number;
}

export interface StockItem {
	id: string;
	kind: StockKind;
	name: string;
	brand: string;
	category: string;
	/** Parent group of the item's category (Food, Fun…); empty when unset. */
	group: string;
	/** Consumables only, ms epoch; null when unset. */
	expires_at: number | null;
	note: string;
	/** Consumables: packages in stock. Durables: unused. */
	quantity: number;
	/** Consumables: days one package lasts for one person. */
	duration_days: number;
	/** Consumables: optional size of one package and its unit. */
	package_size: number;
	package_unit: string;
	/** Durables only, ms epoch; null when unset. */
	bought_at: number | null;
	/** Durables only; null when unset. */
	price: number | null;
	/** Durables only, 3-letter code. */
	currency: string;
	/** Durables only: shop or place of purchase. */
	bought_where: string;
	/** Durables only, ms epoch; null while active. */
	ended_at: number | null;
	hasPhoto: boolean;
	photos: StockItemPhoto[];
	created_at: number;
	updated_at: number;
}export interface TodoDonePage {
	items: TodoProgressItem[];
	count: number;
	hasMore: boolean;
	nextCursor: TodoDoneCursor | null;
}
