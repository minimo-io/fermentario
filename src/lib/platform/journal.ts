import type { SearchHit } from '../search.ts';
import type { TagCount } from '../tag-cloud.ts';
import type { SqlDb, SqlValue } from './sqlite';
import { splitHashtags } from '../hashtags.ts';
import { SLOGAN } from '../brand.ts';
import { sanitizeMotto } from '../motto.ts';

/**
 * Every query the app makes, written once against the `SqlDb` interface.
 *
 * This is the code that used to live in `src/lib/server/db.ts`, moved here
 * unchanged so that better-sqlite3 in Node and SQLite-in-WebAssembly in the
 * WebView run exactly the same SQL. `src/lib/server/db.ts` still exports the
 * same function names, so the 11 API routes are untouched.
 */

export const SCHEMA = `
	CREATE TABLE IF NOT EXISTS notes (
		id         TEXT PRIMARY KEY,
		content    TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		featured   INTEGER NOT NULL DEFAULT 0,
		video      TEXT NOT NULL DEFAULT '',
		published  INTEGER NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS note_tags (
		note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
		tag     TEXT NOT NULL,
		PRIMARY KEY (note_id, tag)
	);

	CREATE TABLE IF NOT EXISTS todo_groups (
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL,
		position   INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS todo_items (
		id         TEXT PRIMARY KEY,
		group_id   TEXT NOT NULL REFERENCES todo_groups(id) ON DELETE CASCADE,
		content    TEXT NOT NULL,
		done       INTEGER NOT NULL DEFAULT 0,
		done_at    INTEGER NOT NULL DEFAULT 0,
		in_progress INTEGER NOT NULL DEFAULT 0,
		subgroup   TEXT NOT NULL DEFAULT '',
		video      TEXT NOT NULL DEFAULT '',
		position   INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS todo_item_tags (
		item_id TEXT NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
		tag     TEXT NOT NULL,
		PRIMARY KEY (item_id, tag)
	);

	CREATE TABLE IF NOT EXISTS principles (
		id         TEXT PRIMARY KEY,
		content    TEXT NOT NULL,
		position   INTEGER NOT NULL,
		created_at INTEGER NOT NULL,
		video      TEXT NOT NULL DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS principle_tags (
		principle_id TEXT NOT NULL REFERENCES principles(id) ON DELETE CASCADE,
		tag          TEXT NOT NULL,
		PRIMARY KEY (principle_id, tag)
	);

	CREATE TABLE IF NOT EXISTS principle_comments (
		id           TEXT PRIMARY KEY,
		principle_id TEXT NOT NULL REFERENCES principles(id) ON DELETE CASCADE,
		content      TEXT NOT NULL,
		created_at   INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS tag_colors (
		tag   TEXT PRIMARY KEY,
		color TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS task_comments (
		id         TEXT PRIMARY KEY,
		item_id    TEXT NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
		content    TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS note_comments (
		id         TEXT PRIMARY KEY,
		note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
		content    TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
		content,
		note_id UNINDEXED,
		tokenize = 'porter unicode61'
	);
`;

export interface Note {
	id: string;
	/** Optional single-line title; empty when the note has none. */
	title: string;
	content: string;
	created_at: number;
	updated_at: number;
	featured: boolean;
	video: string;
	published: boolean;
	/** Cover photo id, when the note has one. */
	coverId: string | null;
	tags: string[];
	/** Comments live in note_comments; batched with the tags query. */
	commentCount?: number;
	/** Outgoing `[[id]]` links with live labels, batched with the tags query. */
	linkedNotes?: LinkRef[];
}

export interface NoteRow {
	id: string;
	title: string;
	content: string;
	created_at: number;
	updated_at: number;
	featured: number;
	video: string;
	published: number;
}

export interface NoteCursor {
	created_at: number;
	id: string;
}

export interface NotePage {
	notes: Note[];
	hasMore: boolean;
	nextCursor: NoteCursor | null;
}

/** Settings that control the public homepage and published note pages. */
export interface PublicConfig {
	siteTitle: string;
	description: string;
	notesEnabled: boolean;
	showCoverImages: boolean;
	updatedAt: number;
}

export const PUBLIC_CONFIG_DEFAULT: PublicConfig = {
	siteTitle: 'fermentario',
	description: SLOGAN,
	notesEnabled: true,
	showCoverImages: true,
	updatedAt: 0
};

/** Private admin presentation settings. The reminder is journal data, not a
 *  browser preference: every device that opens the journal shows it.
 *  `[[id]]` targets inside the motto resolve to `links` on read; the labels
 *  are never stored, so an edit to the target never leaves a stale pill. */
export interface AdminConfig {
	motto: string;
	updatedAt: number;
	links: LinkRef[];
}

export const ADMIN_CONFIG_DEFAULT: AdminConfig = { motto: '', updatedAt: 0, links: [] };

/** One Library entry: EPUB metadata plus the last reading position. The
 *  bytes never ride along — `getBookBytes` is the only reader. */
export interface Book {
	id: string;
	title: string;
	author: string;
	size: number;
	added_at: number;
	lastCfi: string;
	lastPct: number;
	lastChapter: string;
	lastReadAt: number;
}

/** A highlight (empty `note`) or a highlight + note, anchored by CFI range. */
export interface BookNote {
	id: string;
	book_id: string;
	cfi: string;
	excerpt: string;
	note: string;
	color: string;
	created_at: number;
	updated_at: number;
}

/** One page of notes for the drawer: (created_at, id) cursor, newest first,
 *  plus the full total so the badge stays honest before all pages load. */
export interface BookNotesPage {
	notes: BookNote[];
	hasMore: boolean;
	nextCursor: { created_at: number; id: string } | null;
	total: number;
}

/** What the admin UI may know about a stored service key: that it exists
 *  and when it was saved. The token and secret never leave the server. */
export interface ApiCredentialStatus {
	configured: boolean;
	updatedAt: number;
}

/** A Nostr account configured in the app (one for now; the schema allows
 *  more). The nsec is stored locally in the journal DB and never returned
 *  to the browser. */
export interface NostrProfile {
	id: number;
	nsec: string;
	npub: string;
	name: string;
	about: string;
	picture: string;
	relays: string[];
	updatedAt: number;
}

/** One published Nostr event kept locally. `isReply` marks events that
 *  carry an `e` tag (a reply). */
export interface NostrEvent {
	id: string;
	accountId: string;
	pubkey: string;
	kind: number;
	content: string;
	tags: string[][];
	createdAt: number;
	publishedAt: number;
	sourceNoteId: string | null;
	isReply: boolean;
	rawEvent: string;
}

export interface TimeEntry {
	id: string;
	comment: string;
	tags: string[];
	startedAt: number;
	endedAt: number | null;
	createdAt: number;
	updatedAt: number;
}

export interface TimeStatsSegment {
	tag: string;
	ms: number;
}

export interface TimeStatsBucket {
	key: string;
	label: string;
	start: number;
	end: number;
	totalMs: number;
	segments: TimeStatsSegment[];
}

export interface TimeTrackerStats {
	period: 'month' | 'week' | 'year';
	start: number;
	end: number;
	label: string;
	buckets: TimeStatsBucket[];
	tags: string[];
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
	inProgress: boolean;
	position: number;
	created_at: number;
	updated_at: number;
	commentCount: number;
	subgroup: string;
	video: string;
	photoId?: string | null;
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
	/** Outgoing `[[id]]` links with live labels, batched like note links. */
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

/** Comments read `pinned` from SQLite as 0/1; the public type is boolean. */
type CommentRow<T> = Omit<T, 'pinned'> & { pinned: number };

function rowToComment<T extends { pinned: boolean }>(row: CommentRow<T>): T {
	return { ...row, pinned: row.pinned === 1 } as T;
}

export type CommentPatch = { content?: string; pinned?: boolean };

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
	quantity: number;
	duration_days: number;
	package_size: number;
	package_unit: string;
	bought_at: number | null;
	price: number | null;
	currency: string;
	bought_where: string;
	ended_at: number | null;
	hasPhoto: boolean;
	photos: StockItemPhoto[];
	created_at: number;
	updated_at: number;
}

export interface StockItemInput {
	kind: StockKind;
	name: string;
	brand?: string | null;
	category?: string | null;
	note?: string;
	quantity?: number;
	duration_days?: number;
	package_size?: number;
	package_unit?: string;
	bought_at?: number | null;
	expires_at?: number | null;
	price?: number | null;
	currency?: string;
	bought_where?: string;
	ended_at?: number | null;
}

/** One category edit: group label plus an optional goal. */
export interface StockCategoryInput {
	category: string;
	group?: string | null;
	goal?: {
		people: number;
		amount: number;
		unit: string;
		note: string;
	} | null;
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

export interface StockCategoryGoalInput {
	category?: string | null;
	people?: number | null;
	amount?: number | null;
	unit?: string | null;
	note?: string | null;
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

/** A resolved `[[id]]` link: notes and principles share the syntax, and the
 *  label always renders live from the target. */
export interface LinkRef {
	id: string;
	label: string;
	kind: 'note' | 'principle';
}

export interface TodoDonePage {
	items: TodoProgressItem[];
	count: number;
	hasMore: boolean;
	nextCursor: TodoDoneCursor | null;
}

/** Outgoing note links use `[[uuid]]`. The label is never stored: it renders
 *  live from the target's current first line, so edits never go stale. */
const LINK_RE = /\[\[([0-9a-fA-F-]{36})\]\]/g;

export function noteLinkIds(content: string): string[] {
	const ids: string[] = [];
	LINK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = LINK_RE.exec(content)) !== null) {
		if (!ids.includes(m[1])) ids.push(m[1]);
	}
	return ids;
}

/** Pill label: first non-empty line, capped so a long note stays a pill. */
export function noteLabel(content: string): string {
	const line = content.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
	return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

export interface Holding {
	id: string;
	ticker: string;
	amount: number;
	/** Manual price in the holding's currency; null until set. */
	price: number | null;
	/** True when the price came from the rates refresh (BTC auto-price). */
	priceAuto: boolean;
	currency: string;
	category: HoldingCategory;
	/** Desired amount in the holding's currency; null until set. */
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
	/** Converted value in USD; present on list output. */
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

export type HoldingCategory = 'btc' | 'fii' | 'cash';

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
	/** Newest rate timestamp behind the total; null when no FX was needed. */
	asOf: number | null;
	/** True when a needed rate is missing or older than a day. */
	stale: boolean;
	goals: { btc: number; fii: number; cash: number } | null;
	/** Independent absolute targets; null when none are set. */
	valueGoals: { btc: CategoryValueGoal | null; fii: CategoryValueGoal | null; cash: CategoryValueGoal | null } | null;
	/** Progress for each category that has an absolute target. */
	valueProgress: CategoryValueProgress[];
	actual: { btc: number; fii: number; cash: number };
	/** Configured categories off their goal by more than 5 points. */
	drift: CategoryShare[];
	displayTotals: { USD: number; BRL: number | null; UYU: number | null };
}

const rowToNote = (r: NoteRow, tags: string[] = [], comments = 0, links: LinkRef[] = [], coverId: string | null = null): Note => ({
	id: r.id,
	title: r.title ?? '',
	content: r.content,
	created_at: r.created_at,
	updated_at: r.updated_at,
	featured: r.featured === 1,
	video: r.video ?? '',
	published: (r.published ?? 0) === 1,
	coverId,
	tags,
	commentCount: comments,
	linkedNotes: links
});

/** One-line preview around the first match. The palette highlights `query`. */
function clipSearchText(text: string, query: string, max = 200): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	const at = flat.toLowerCase().indexOf(query.toLowerCase());
	const start = Math.max(0, at < 0 ? 0 : at - 60);
	const end = Math.min(flat.length, start + max);
	return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

/** better-sqlite3 hands back `Buffer`, sqlite-wasm hands back `Uint8Array`.
 *  This is the one place that difference is allowed to exist. */
function toBytes(v: unknown): Uint8Array {
	if (v instanceof Uint8Array) return v;
	if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
	if (v instanceof ArrayBuffer) return new Uint8Array(v);
	return new Uint8Array(0);
}

/** HMAC-SHA256 → Base64 via WebCrypto, so the same code signs on Node and
 *  in any WebView engine that provides crypto.subtle + btoa. */
async function hmacBase64(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	let bin = '';
	for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
	return btoa(bin);
}

/** One quote attempt for the debug log: ticker, source, success or error. */
export interface QuoteFetchEntry {
	ticker: string;
	source: string;
	ok: number;
	price: number | null;
	previous_close: number | null;
	error: string;
	fetched_at: number;
}

/** A swing-trading venue and its editable cost rules. */
export interface TradingOrg {
	id: string;
	name: string;
	enabled: boolean;
	feeRate: number;
	/** Ripio's sale-side gap to the screen price. Zero on B3. */
	spreadRate: number;
	irrfRate: number;
	fixedFee: number;
	/** What the venue's percentage fee covers, in the user's words. */
	feeNote: string;
	exemptLimit: number;
	position: number;
	created_at: number;
}

/** One raw diary event: a buy adds to the position, a sale closes it. */
export interface TradingOrder {
	id: string;
	orgId: string;
	ticker: string;
	side: 'BUY' | 'SELL';
	qty: number;
	unitPrice: number;
	value: number;
	fees: number;
	irrf: number;
	net: number;
	/** The venue rules at the moment this order was recorded. A later fee
	 *  edit must not rewrite this row, so every recompute reads these. */
	feeRate: number;
	spreadRate: number;
	irrfRate: number;
	fixedFee: number;
	date: number;
	month: string;
	created_at: number;
}

/** A diary line; sales carry their profit over the open cost basis. A buy
 *  also carries the goal of the day it was recorded: the price and the net
 *  that goal asks for. */
export interface TradingDiaryLine extends TradingOrder {
	profit: number | null;
	profitPct: number | null;
	targetPct: number;
	goalPrice: number | null;
	netAtGoal: number | null;
}

/** An open ticker position with its live quote and recommendation. */
export interface TradingPosition {
	ticker: string;
	orgId: string;
	orgName: string;
	qty: number;
	avgPrice: number;
	cost: number;
	quote: number | null;
	quoteSource: string | null;
	quoteAt: number | null;
	targetPct: number;
	potentialPct: number | null;
	/** Every open buy is from today: selling now is a day trade. */
	sameDay: boolean;
	/** Earliest open buy: the position age counts from here. */
	since: number;
	/** Unit sell price whose net clears the target. */
	targetPrice: number | null;
	/** Cash the position would actually yield selling now, sell costs off. */
	netValue: number | null;
	/** Itemized sell costs behind the net value. */
	sellFees: {
		fee: number;
		spread: number;
		irrf: number;
		fixed: number;
		feeRatePct: number;
		spreadRatePct: number;
		irrfRatePct: number;
	} | null;
	/** The cost rules the open buys were recorded with, weighted by their
	 *  net. The goal price uses these, so a later fee edit cannot move the
	 *  target of a position that already exists. */
	goalFees: {
		feeRatePct: number;
		spreadRatePct: number;
		irrfRatePct: number;
		fixedFee: number;
	};
	recommendation: 'waiting' | 'hold' | 'sell' | 'daytrade';
}

/** One rolling month of the exemption panel. */
export interface TradingMonthRow {
	month: string;
	sales: number;
	limit: number;
	/** Buy plus sell fees paid that month. Never touches the ceiling. */
	fees: number;
	irrf: number;
	profit: number;
	exempt: boolean;
}

export interface TradingSummary {
	org: TradingOrg;
	orders: TradingDiaryLine[];
	positions: TradingPosition[];
	months: TradingMonthRow[];
}

/** One day of a position's own line: stored quote times the quantity
 *  still open that day. Days before the first buy never appear; a sale
 *  ends the line. */
export interface TradingQuotePoint {
	day: string;
	price: number;
	qty: number;
	value: number;
}

/** One home-page strip card: an open ticker in an enabled venue. */
export interface TradingStripItem {
	ticker: string;
	orgId: string;
	orgName: string;
	qty: number;
	avgPrice: number;
	cost: number;
	quote: number | null;
	targetPct: number;
	potentialPct: number | null;
	sameDay: boolean;
	since: number;
	/** Last fetch of the market quote. */
	quoteAt: number | null;
	/** Unit sell price whose net clears the target. */
	targetPrice: number | null;
	/** Cash the position would actually yield selling now, sell costs off. */
	netValue: number | null;
	/** Itemized sell costs behind the net value. */
	sellFees: {
		fee: number;
		spread: number;
		irrf: number;
		fixed: number;
		feeRatePct: number;
		spreadRatePct: number;
		irrfRatePct: number;
	} | null;
	/** The cost rules the open buys were recorded with, weighted by their
	 *  net. The goal price uses these, so a later fee edit cannot move the
	 *  target of a position that already exists. */
	goalFees: {
		feeRatePct: number;
		spreadRatePct: number;
		irrfRatePct: number;
		fixedFee: number;
	};
	recommendation: 'waiting' | 'hold' | 'sell' | 'daytrade';
}

/** One money figure shown in the three currencies the app displays. USD is
 *  the base; BRL and UYU divide it by the stored rate for that currency, so
 *  a missing rate is null instead of a 1:1 guess. */
export type TradingMoneyTriple = { USD: number | null; BRL: number | null; UYU: number | null };

/** Totals over every open trade in every enabled venue. `invested` counts
 *  the buy net (buy fees in), `now` the cash a sale at the stored quote
 *  would yield (sell costs out), `atGoal` the net each goal asks for. */
export interface TradingStripTotals {
	count: number;
	/** Open positions whose current value is unknown (no quote yet). */
	missingQuotes: number;
	invested: TradingMoneyTriple;
	now: TradingMoneyTriple;
	atGoal: TradingMoneyTriple;
}

/** The home-page trading rail plus its totals. */
export interface TradingStrip {
	positions: TradingStripItem[];
	totals: TradingStripTotals;
}

export function createJournal(db: SqlDb) {
	function tagsByNote(rows: { id: string }[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const tagRows = db
			.prepare(`SELECT note_id, tag FROM note_tags WHERE note_id IN (${placeholders}) ORDER BY tag`)
			.all(...ids) as unknown as { note_id: string; tag: string }[];
		for (const t of tagRows) {
			if (!map.has(t.note_id)) map.set(t.note_id, []);
			map.get(t.note_id)!.push(t.tag);
		}
		return map;
	}

	/** Comment totals per note id, batched the way tagsByNote batches tags. */
	function commentsByNote(rows: { id: string }[]): Map<string, number> {
		const map = new Map<string, number>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const countRows = db
			.prepare(`SELECT note_id, COUNT(*) AS c FROM note_comments WHERE note_id IN (${placeholders}) GROUP BY note_id`)
			.all(...ids) as unknown as { note_id: string; c: number }[];
		for (const row of countRows) map.set(row.note_id, row.c);
		return map;
	}

	/** Linked-entry labels per source id, batched the way tagsByNote batches
	 *  tags. Notes resolve first, then principles; ids with no live target
	 *  resolve to no entry and render as plain text. */
	function resolveLinks(wanted: Map<string, string[]>): Map<string, LinkRef[]> {
		const map = new Map<string, LinkRef[]>();
		if (wanted.size === 0) return map;
		const allIds = [...new Set([...wanted.values()].flat())];
		const placeholders = allIds.map(() => '?').join(',');
		const found = new Map<string, LinkRef>();
		const noteTargets = db
			.prepare(`SELECT id, content FROM notes WHERE id IN (${placeholders})`)
			.all(...allIds) as unknown as { id: string; content: string }[];
		for (const t of noteTargets) found.set(t.id, { id: t.id, label: noteLabel(t.content), kind: 'note' });
		const missing = allIds.filter((id) => !found.has(id));
		if (missing.length > 0) {
			const missingPlaceholders = missing.map(() => '?').join(',');
			const principleTargets = db
				.prepare(`SELECT id, content FROM principles WHERE id IN (${missingPlaceholders})`)
				.all(...missing) as unknown as { id: string; content: string }[];
			for (const t of principleTargets) found.set(t.id, { id: t.id, label: noteLabel(t.content), kind: 'principle' });
		}
		for (const [sourceId, ids] of wanted) {
			const links: LinkRef[] = [];
			for (const id of ids) {
				const target = found.get(id);
				if (target !== undefined) links.push(target);
			}
			if (links.length > 0) map.set(sourceId, links);
		}
		return map;
	}

	function linksByNote(rows: { id: string; content: string }[]): Map<string, LinkRef[]> {
		if (rows.length === 0) return new Map();
		const wanted = new Map<string, string[]>();
		for (const r of rows) {
			const ids = noteLinkIds(r.content).filter((id) => id !== r.id);
			if (ids.length > 0) wanted.set(r.id, ids);
		}
		return resolveLinks(wanted);
	}

	function linksByPrinciple(rows: { id: string; content: string }[]): Map<string, LinkRef[]> {
		if (rows.length === 0) return new Map();
		const wanted = new Map<string, string[]>();
		for (const r of rows) {
			const ids = noteLinkIds(r.content).filter((id) => id !== r.id);
			if (ids.length > 0) wanted.set(r.id, ids);
		}
		return resolveLinks(wanted);
	}

	function withTags(rows: NoteRow[]): Note[] {
		const tags = tagsByNote(rows);
		const comments = commentsByNote(rows);
		const links = linksByNote(rows);
		const covers = coversByNote(rows);
		return rows.map((r) =>
			rowToNote(r, tags.get(r.id) ?? [], comments.get(r.id) ?? 0, links.get(r.id) ?? [], covers.get(r.id) ?? null)
		);
	}

	/** Newest notes whose `[[id]]` tokens reference this entry — the reverse
	 *  of the outgoing links. The uuid carries no LIKE wildcards or escapes,
	 *  so the pre-filter stays exact; `noteLinkIds` is the real test. */
	function listNotesLinkingTo(id: string): Note[] {
		const token = `[[${id}]]`;
		const rows = db
			.prepare('SELECT * FROM notes WHERE content LIKE ? ORDER BY created_at DESC, id DESC LIMIT 100')
			.all(`%${token}%`) as unknown as NoteRow[];
		return withTags(rows.filter((r) => noteLinkIds(r.content).includes(id)));
	}

	function publicString(value: unknown, fallback: string, max: number): string {
		if (typeof value !== 'string') return fallback;
		const clean = value.replace(/\s+/g, ' ').trim().slice(0, max);
		return clean || fallback;
	}

	function publicBoolean(value: unknown, fallback: boolean): boolean {
		if (typeof value === 'boolean') return value;
		if (value === 1 || value === '1') return true;
		if (value === 0 || value === '0') return false;
		return fallback;
	}

	function sanitizePublicConfig(value: unknown): PublicConfig {
		const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
		return {
			siteTitle: publicString(input.siteTitle, PUBLIC_CONFIG_DEFAULT.siteTitle, 80),
			description: publicString(input.description, PUBLIC_CONFIG_DEFAULT.description, 200),
			notesEnabled: publicBoolean(input.notesEnabled, PUBLIC_CONFIG_DEFAULT.notesEnabled),
			showCoverImages: publicBoolean(input.showCoverImages, PUBLIC_CONFIG_DEFAULT.showCoverImages),
			updatedAt: Number.isFinite(Number(input.updatedAt ?? input.updated_at))
				? Math.max(0, Math.trunc(Number(input.updatedAt ?? input.updated_at)))
				: 0
		};
	}

	function getPublicConfig(): PublicConfig {
		try {
			const row = db
				.prepare(
					`SELECT site_title, description, notes_enabled, show_cover_images, updated_at
					 FROM public_config WHERE id = 1`
				)
				.get() as unknown as
				| {
						site_title: string;
						description: string;
						notes_enabled: number;
						show_cover_images: number;
						updated_at: number;
				  }
				| undefined;
			if (!row) return PUBLIC_CONFIG_DEFAULT;
			return sanitizePublicConfig({
				siteTitle: row.site_title,
				description: row.description,
				notesEnabled: row.notes_enabled,
				showCoverImages: row.show_cover_images,
				updatedAt: row.updated_at
			});
		} catch {
			// Migration 28 creates the row. Older databases fall back safely.
			return PUBLIC_CONFIG_DEFAULT;
		}
	}

	function setPublicConfig(input: Partial<PublicConfig>): PublicConfig {
		const next = sanitizePublicConfig({ ...getPublicConfig(), ...input, updatedAt: Date.now() });
		db.prepare(
			`INSERT INTO public_config (
				id, site_title, description, notes_enabled, show_cover_images, updated_at
			) VALUES (1, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET
				site_title = excluded.site_title,
				description = excluded.description,
				notes_enabled = excluded.notes_enabled,
				show_cover_images = excluded.show_cover_images,
				updated_at = excluded.updated_at`
		).run(
			next.siteTitle,
			next.description,
			next.notesEnabled ? 1 : 0,
			next.showCoverImages ? 1 : 0,
			next.updatedAt
		);
		return getPublicConfig();
	}

	function sanitizeAdminConfig(value: unknown): AdminConfig {
		const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
		const updated = Number(input.updatedAt ?? input.updated_at);
		return {
			motto: sanitizeMotto(input.motto),
			updatedAt: Number.isFinite(updated) ? Math.max(0, Math.trunc(updated)) : 0,
			links: []
		};
	}

	function getAdminConfig(): AdminConfig {
		let config = ADMIN_CONFIG_DEFAULT;
		try {
			const row = db
				.prepare('SELECT motto, updated_at FROM admin_config WHERE id = 1')
				.get() as unknown as { motto: string; updated_at: number } | undefined;
			if (row) config = sanitizeAdminConfig({ motto: row.motto, updatedAt: row.updated_at });
		} catch {
			// Migration 43 creates the row. Older databases fall back safely.
			config = ADMIN_CONFIG_DEFAULT;
		}
		const ids = noteLinkIds(config.motto);
		if (ids.length === 0) return config;
		return {
			...config,
			links: resolveLinks(new Map([['motto', ids]])).get('motto') ?? []
		};
	}

	function setAdminConfig(input: Partial<AdminConfig>): AdminConfig {
		const next = sanitizeAdminConfig({ ...getAdminConfig(), ...input, updatedAt: Date.now() });
		db.prepare(
			`INSERT INTO admin_config (id, motto, updated_at) VALUES (1, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET motto = excluded.motto, updated_at = excluded.updated_at`
		).run(next.motto, next.updatedAt);
		return getAdminConfig();
	}

	// --- Library ------------------------------------------------------------

	type BookMetaRow = {
		id: string;
		title: string;
		author: string;
		size: number;
		added_at: number;
		last_cfi: string;
		last_pct: number;
		last_chapter: string;
		last_read_at: number;
	};
	const BOOK_COLUMNS = 'id, title, author, size, added_at, last_cfi, last_pct, last_chapter, last_read_at';

	function rowToBook(r: BookMetaRow): Book {
		return {
			id: r.id,
			title: r.title,
			author: r.author,
			size: r.size,
			added_at: r.added_at,
			lastCfi: r.last_cfi ?? '',
			lastPct: r.last_pct ?? 0,
			lastChapter: r.last_chapter ?? '',
			lastReadAt: r.last_read_at ?? 0
		};
	}

	/** Library table rows, most recently read first. Never loads `bytes`. */
	function listBooks(): Book[] {
		const rows = db
			.prepare(`SELECT ${BOOK_COLUMNS} FROM books ORDER BY last_read_at DESC, added_at DESC, id DESC`)
			.all() as unknown as BookMetaRow[];
		return rows.map(rowToBook);
	}

	function getBook(id: string): Book | null {
		const r = db.prepare(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = ?`).get(id) as unknown as
			| BookMetaRow
			| undefined;
		return r ? rowToBook(r) : null;
	}

	/** The EPUB bytes for the file endpoint only. */
	function getBookBytes(id: string): Uint8Array | null {
		const r = db.prepare('SELECT bytes FROM books WHERE id = ?').get(id) as unknown as
			| { bytes: unknown }
			| undefined;
		if (!r || r.bytes === null || r.bytes === undefined) return null;
		const bytes = toBytes(r.bytes);
		return bytes.length > 0 ? bytes : null;
	}

	/** Store one upload. Title/author arrive from the client-side metadata
	 *  parse; the bytes keep their exact shape (the file endpoint must hand
	 *  back what epub.js would unzip). */
	function addBook(input: { bytes: Uint8Array; title: unknown; author: unknown }): Book | null {
		if (!(input.bytes instanceof Uint8Array) || input.bytes.length === 0) return null;
		const title = String(input.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Untitled';
		const author = String(input.author ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO books (id, title, author, bytes, size, added_at) VALUES (?, ?, ?, ?, ?, ?)').run(
			id,
			title,
			author,
			// Same cast as note covers: the SqlValue type is shared with the
			// WebView engine, which takes the Uint8Array as-is.
			input.bytes as unknown as string,
			input.bytes.length,
			now
		);
		return getBook(id);
	}

	function setBookPosition(
		id: string,
		input: { cfi: unknown; pct: unknown; chapter: unknown }
	): Book | null {
		const existing = getBook(id);
		if (!existing) return null;
		const cfi = String(input.cfi ?? '').trim().slice(0, 2048);
		const pct = Number(input.pct);
		const cleanPct = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 1) : existing.lastPct;
		const chapter = String(input.chapter ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
		db.prepare('UPDATE books SET last_cfi = ?, last_pct = ?, last_chapter = ?, last_read_at = ? WHERE id = ?').run(
			cfi || existing.lastCfi,
			cleanPct,
			chapter || existing.lastChapter,
			Date.now(),
			id
		);
		return getBook(id);
	}

	function deleteBook(id: string): boolean {
		// book_notes rows leave with the book (FK ON DELETE CASCADE).
		return db.prepare('DELETE FROM books WHERE id = ?').run(id).changes > 0;
	}

	type BookNoteRow = {
		id: string;
		book_id: string;
		cfi: string;
		excerpt: string;
		note: string;
		color: string;
		created_at: number;
		updated_at: number;
	};

	function rowToBookNote(r: BookNoteRow): BookNote {
		return {
			id: r.id,
			book_id: r.book_id,
			cfi: r.cfi,
			excerpt: r.excerpt,
			note: r.note,
			color: r.color,
			created_at: r.created_at,
			updated_at: r.updated_at
		};
	}

	function getBookNote(id: string): BookNote | null {
		const r = db.prepare('SELECT * FROM book_notes WHERE id = ?').get(id) as unknown as BookNoteRow | undefined;
		return r ? rowToBookNote(r) : null;
	}

	function listBookNotes(
		bookId: string,
		opts: { limit?: number; before?: number | null; beforeId?: string | null } = {}
	): BookNotesPage {
		const limit = Math.max(1, Math.min(100, Math.trunc(opts.limit ?? 50)));
		const total = (db.prepare('SELECT COUNT(*) AS c FROM book_notes WHERE book_id = ?').get(bookId) as {
			c: number;
		}).c;
		const useCursor = typeof opts.before === 'number' && Number.isFinite(opts.before) && !!opts.beforeId;
		const params: SqlValue[] = [bookId];
		if (useCursor) params.push(opts.before as number, opts.before as number, opts.beforeId as string);
		params.push(limit + 1);
		// Same (created_at,id) cursor rule as listNotesPage: ids break ties
		// for rows stored in the same millisecond.
		const rows = db
			.prepare(
				`SELECT * FROM book_notes WHERE book_id = ?${useCursor ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : ''}
				 ORDER BY created_at DESC, id DESC LIMIT ?`
			)
			.all(...params) as unknown as BookNoteRow[];
		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		return {
			notes: page.map(rowToBookNote),
			hasMore,
			nextCursor: last ? { created_at: last.created_at, id: last.id } : null,
			total
		};
	}

	/** A highlight with an optional note. The CFI range is the anchor; the
	 *  excerpt keeps the panel readable and survives a dead anchor. */
	function createBookNote(bookId: string, input: { cfi: unknown; excerpt?: unknown; note?: unknown }): BookNote | null {
		const cfi = String(input.cfi ?? '').trim().slice(0, 2048);
		if (!cfi || !getBook(bookId)) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare(
			`INSERT INTO book_notes (id, book_id, cfi, excerpt, note, color, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 'amber', ?, ?)`
		).run(id, bookId, cfi, String(input.excerpt ?? '').trim().slice(0, 500), String(input.note ?? '').trim().slice(0, 4000), now, now);
		return getBookNote(id);
	}

	function updateBookNote(id: string, input: { note?: unknown; excerpt?: unknown }): BookNote | null {
		if (!getBookNote(id)) return null;
		const note = input.note !== undefined ? String(input.note).trim().slice(0, 4000) : undefined;
		const excerpt = input.excerpt !== undefined ? String(input.excerpt).trim().slice(0, 500) : undefined;
		db.prepare('UPDATE book_notes SET note = COALESCE(?, note), excerpt = COALESCE(?, excerpt), updated_at = ? WHERE id = ?').run(
			note ?? null,
			excerpt ?? null,
			Date.now(),
			id
		);
		return getBookNote(id);
	}

	function deleteBookNote(id: string): boolean {
		return db.prepare('DELETE FROM book_notes WHERE id = ?').run(id).changes > 0;
	}

	// --- Service API credentials ----------------------------------------

	function getApiCredential(service: string): { token: string; secret: string } | null {
		const r = db.prepare('SELECT token, secret FROM api_credentials WHERE service = ?').get(service) as unknown as
			| { token: string; secret: string }
			| undefined;
		return r ?? null;
	}

	/** Everything the admin UI may learn about a credential: no token, no
	 *  secret, only existence and the save time. */
	function getApiCredentialStatus(service: string): ApiCredentialStatus {
		const r = db.prepare('SELECT updated_at FROM api_credentials WHERE service = ?').get(service) as unknown as
			| { updated_at: number }
			| undefined;
		return { configured: !!r, updatedAt: r?.updated_at ?? 0 };
	}

	function setApiCredential(service: string, token: unknown, secret: unknown): ApiCredentialStatus | null {
		const t = String(token ?? '').trim().slice(0, 200);
		const s = String(secret ?? '').trim().slice(0, 200);
		if (!t || !s) return null;
		db.prepare(
			`INSERT INTO api_credentials (service, token, secret, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT (service) DO UPDATE SET token = excluded.token, secret = excluded.secret, updated_at = excluded.updated_at`
		).run(service, t, s, Date.now());
		return getApiCredentialStatus(service);
	}

	function deleteApiCredential(service: string): ApiCredentialStatus {
		db.prepare('DELETE FROM api_credentials WHERE service = ?').run(service);
		return getApiCredentialStatus(service);
	}

	// --- Nostr -----------------------------------------------------------

	function getNostrProfile(): NostrProfile {
		const r = db.prepare('SELECT id, nsec, npub, name, about, picture, relays, updated_at FROM nostr_profile WHERE id = 1').get() as unknown as
			| { id: number; nsec: string; npub: string; name: string; about: string; picture: string; relays: string; updated_at: number }
			| undefined;
		if (!r) {
			return { id: 1, nsec: '', npub: '', name: '', about: '', picture: '', relays: [], updatedAt: 0 };
		}
		let relays: string[] = [];
		try { const p = JSON.parse(r.relays); if (Array.isArray(p)) relays = p.filter((x) => typeof x === 'string'); } catch {}
		return { id: r.id, nsec: r.nsec, npub: r.npub, name: r.name, about: r.about, picture: r.picture, relays, updatedAt: r.updated_at };
	}

	function setNostrProfile(input: { nsec?: unknown; npub?: unknown; name?: unknown; about?: unknown; picture?: unknown; relays?: unknown }): NostrProfile {
		const cur = getNostrProfile();
		// The nsec is stored verbatim; the npub is derived by the caller
		// (the API route uses nostr-tools so journal.ts stays free of that
		// dependency and runs on both engines).
		const nsec = input.nsec !== undefined ? String(input.nsec ?? '').trim() : cur.nsec;
		const npub = input.npub !== undefined ? String(input.npub ?? '').trim() : cur.npub;
		const name = input.name !== undefined ? String(input.name).trim().slice(0, 80) : cur.name;
		const about = input.about !== undefined ? String(input.about).trim().slice(0, 500) : cur.about;
		const picture = input.picture !== undefined ? String(input.picture).trim().slice(0, 500) : cur.picture;
		let relays = cur.relays;
		if (Array.isArray(input.relays)) {
			relays = input.relays.map((x) => String(x ?? '').trim()).filter((x) => x.startsWith('ws://') || x.startsWith('wss://')).slice(0, 50);
		}
		db.prepare(
			`UPDATE nostr_profile SET nsec = ?, npub = ?, name = ?, about = ?, picture = ?, relays = ?, updated_at = ? WHERE id = 1`
		).run(nsec, npub, name, about, picture, JSON.stringify(relays), Date.now());
		return getNostrProfile();
	}

	function deleteNostrProfile(): NostrProfile {
		db.prepare(`UPDATE nostr_profile SET nsec = '', npub = '', name = '', about = '', picture = '', relays = '[]', updated_at = ? WHERE id = 1`).run(Date.now());
		return getNostrProfile();
	}

	function listNostrEvents(kind: number | null = null, limit = 100): NostrEvent[] {
		const rows = db
			.prepare(
				`SELECT id, account_id, pubkey, kind, content, tags, created_at, published_at, source_note_id, is_reply, raw_event
				 FROM nostr_events ${kind === null ? '' : 'WHERE kind = ?'} ORDER BY created_at DESC, id DESC LIMIT ?`
			)
			.all(...(kind === null ? [] : [kind]), limit) as unknown as {
			id: string;
			account_id: string;
			pubkey: string;
			kind: number;
			content: string;
			tags: string;
			created_at: number;
			published_at: number;
			source_note_id: string | null;
			is_reply: number;
			raw_event: string;
		}[];
		return rows.map((r) => ({
			id: r.id,
			accountId: r.account_id,
			pubkey: r.pubkey,
			kind: r.kind,
			content: r.content,
			tags: (() => {
				try { const p = JSON.parse(r.tags); return Array.isArray(p) ? p : []; } catch { return []; }
			})(),
			createdAt: r.created_at,
			publishedAt: r.published_at,
			sourceNoteId: r.source_note_id,
			isReply: r.is_reply === 1,
			rawEvent: r.raw_event
		}));
	}

	function addNostrEvent(input: {
		accountId?: unknown;
		pubkey?: unknown;
		kind?: unknown;
		content: unknown;
		tags?: unknown;
		rawEvent: unknown;
		isReply?: unknown;
		sourceNoteId?: unknown;
		createdAt?: unknown;
	}): NostrEvent | null {
		const content = String(input.content ?? '').trim();
		if (!content) return null;
		const kind = Number(input.kind ?? 1);
		const id = String(input.rawEvent ? JSON.parse(String(input.rawEvent)).id ?? '' : '').trim();
		if (!id) return null;
		const now = Date.now();
		const tags = Array.isArray(input.tags) ? input.tags : [];
		db.prepare(
			`INSERT OR IGNORE INTO nostr_events (id, account_id, pubkey, kind, content, tags, created_at, published_at, source_note_id, is_reply, raw_event)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			id,
			String(input.accountId ?? '').trim(),
			String(input.pubkey ?? '').trim(),
			kind,
			content,
			JSON.stringify(tags),
			Number(input.createdAt ?? now),
			now,
			(input.sourceNoteId ?? null) as string | null,
			input.isReply ? 1 : 0,
			String(input.rawEvent)
		);
		return listNostrEvents(null, 1)[0] ?? null;
	}

	/** Counts for the backup card. `notes` are own kind-1 events without an
	 *  `e` tag, `replies` the ones that carry one (NIP-10 replies). */
	function getNostrStats(): {
		notes: number;
		replies: number;
		total: number;
		lastAt: number;
		lastStoredAt: number;
	} {
		const row = db
			.prepare(
				`SELECT
					COALESCE(SUM(CASE WHEN is_reply = 0 THEN 1 ELSE 0 END), 0) AS notes,
					COALESCE(SUM(CASE WHEN is_reply = 1 THEN 1 ELSE 0 END), 0) AS replies,
					COALESCE(COUNT(*), 0) AS total,
					COALESCE(MAX(created_at), 0) AS lastAt,
					COALESCE(MAX(published_at), 0) AS lastStoredAt
				 FROM nostr_events`
			)
			.get() as unknown as {
			notes: number;
			replies: number;
			total: number;
			lastAt: number;
			lastStoredAt: number;
		};
		return row;
	}

	/** Per-day counts for the heatmap: published notes (kind 1) and replies
	 *  (kind 1 with an e tag), split by day. */
	function getNostrHeatmap(): { published: { day: string; count: number }[]; replies: { day: string; count: number }[] } {
		const noteRows = db
			.prepare(`SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count FROM nostr_events WHERE is_reply = 0 GROUP BY day ORDER BY day`)
			.all() as { day: string; count: number }[];
		const replyRows = db
			.prepare(`SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count FROM nostr_events WHERE is_reply = 1 GROUP BY day ORDER BY day`)
			.all() as { day: string; count: number }[];
		return { published: noteRows, replies: replyRows };
	}

	/** One cover photo id per note, batched like the comment counts. */
	function coversByNote(rows: { id: string }[]): Map<string, string> {
		const map = new Map<string, string>();
		if (rows.length === 0) return map;
		const ids = [...new Set(rows.map((r) => r.id))];
		const placeholders = ids.map(() => '?').join(',');
		const found = db
			.prepare(`SELECT note_id, id FROM note_photos WHERE note_id IN (${placeholders})`)
			.all(...ids) as unknown as { note_id: string; id: string }[];
		for (const f of found) map.set(f.note_id, f.id);
		return map;
	}

	function createNote(content: string, createdAt: number): Note {
		const id = crypto.randomUUID();
		const now = createdAt;
		db.prepare('INSERT INTO notes (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
			id,
			content,
			now,
			now
		);
		db.prepare('INSERT INTO notes_fts (content, note_id) VALUES (?, ?)').run(content, id);
		return { id, title: '', content, created_at: now, updated_at: now, featured: false, video: '', published: false, coverId: null, tags: [] };
	}

	function deleteNote(id: string): boolean {
		const done = db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
		if (done) {
			db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
			db.prepare('DELETE FROM note_comments WHERE note_id = ?').run(id);
		}
		return done;
	}

	/** Replace a note's content and optionally its date. `updated_at` always
	 *  moves past `created_at` so the "edited" marker can rely on a strict
	 *  comparison. Returns null when the note does not exist. */
	function updateNote(id: string, content: string, createdAt?: number): Note | null {
		const existing = db.prepare('SELECT created_at FROM notes WHERE id = ?').get(id) as
			| { created_at: number }
			| undefined;
		if (!existing) return null;
		const created =
			typeof createdAt === 'number' && Number.isFinite(createdAt) && createdAt > 0
				? createdAt
				: existing.created_at;
		const now = Math.max(Date.now(), created + 1);
		db.prepare('UPDATE notes SET content = ?, created_at = ?, updated_at = ? WHERE id = ?').run(
			content,
			created,
			now,
			id
		);
		db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
		db.prepare('INSERT INTO notes_fts (content, note_id) VALUES (?, ?)').run(content, id);
		return getNote(id);
	}

	function getNote(id: string): Note | null {
		const r = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as unknown as NoteRow | undefined;
		return r ? withTags([r])[0] : null;
	}

	/** Pin or unpin a note. Touches only the flag: text, FTS row, vector
	 *  and tags are left alone. Returns null when the note does not exist. */
	function setNoteFeatured(id: string, featured: boolean): Note | null {
		const done = db.prepare('UPDATE notes SET featured = ? WHERE id = ?').run(featured ? 1 : 0, id).changes > 0;
		if (!done) return null;
		return getNote(id);
	}

	/** Publish or unpublish a note. Only the flag changes. */
	function setNotePublished(id: string, published: boolean): Note | null {
		const done = db.prepare('UPDATE notes SET published = ? WHERE id = ?').run(published ? 1 : 0, id).changes > 0;
		if (!done) return null;
		return getNote(id);
	}

	/** Set (replacing) a note's cover photo. Null bytes clear it. */
	function setNoteCover(noteId: string, photo: Uint8Array | null, mime: string): { id: string; created_at: number } | null {
		const exists = db.prepare('SELECT id FROM notes WHERE id = ?').get(noteId) as unknown as { id: string } | undefined;
		if (!exists) return null;
		if (photo === null) {
			db.prepare('DELETE FROM note_photos WHERE note_id = ?').run(noteId);
			return null;
		}
		const id = crypto.randomUUID();
		const now = Date.now();
		db.transaction(() => {
			db.prepare('DELETE FROM note_photos WHERE note_id = ?').run(noteId);
			db.prepare('INSERT INTO note_photos (id, note_id, photo, mime, created_at) VALUES (?, ?, ?, ?, ?)').run(
				id,
				noteId,
				photo as unknown as string,
				mime,
				now
			);
		});
		return { id, created_at: now };
	}

	/** Remove a note's cover photo. True when a row went away. */
	function removeNoteCover(noteId: string): boolean {
		return db.prepare('DELETE FROM note_photos WHERE note_id = ?').run(noteId).changes > 0;
	}

	/** Cover bytes by photo id, for the public image URL. */
	function getNotePhoto(photoId: string): { photo: Uint8Array; mime: string; createdAt: number } | null {
		let r: { photo: unknown; mime: string; created_at: number } | undefined;
		try {
			r = db
				.prepare('SELECT photo, mime, created_at FROM note_photos WHERE id = ?')
				.get(photoId) as unknown as { photo: unknown; mime: string; created_at: number } | undefined;
		} catch {
			return null;
		}
		if (!r || r.photo === null || r.photo === undefined) return null;
		const bytes = toBytes(r.photo);
		if (bytes.length === 0) return null;
		return { photo: bytes, mime: r.mime || 'image/jpeg', createdAt: r.created_at };
	}

	/** Set or clear the YouTube video id. Empty clears. Like featuring, this
	 *  touches only its column. Returns null when the note does not exist. */
	function setNoteVideo(id: string, video: string): Note | null {
		const done = db.prepare('UPDATE notes SET video = ? WHERE id = ?').run(video, id).changes > 0;
		if (!done) return null;
		return getNote(id);
	}

	/** Set or clear the optional title. Titles are single-line and capped;
	 *  only the title column and updated_at change. Returns null when the
	 *  note does not exist. */
	function setNoteTitle(id: string, title: string): Note | null {
		const existing = db.prepare('SELECT title, created_at FROM notes WHERE id = ?').get(id) as
			| { title: string; created_at: number }
			| undefined;
		if (!existing) return null;
		const clean = title.replace(/\s+/g, ' ').trim().slice(0, 120);
		if (existing.title === clean) return getNote(id);
		const updated = Math.max(Date.now(), existing.created_at + 1);
		db.prepare('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?').run(clean, updated, id);
		return getNote(id);
	}

	/** One page of notes, newest first, with a stable cursor.
	 *
	 *  The cursor is (created_at, id), not created_at alone: notes saved in the
	 *  same millisecond would otherwise be skipped or returned twice. The `tag`
	 *  variant joins note_tags, so every page of a tag view is filtered on the
	 *  server and the client only ever appends matching notes. */
	function listNotesPage(
		opts: { limit?: number; before?: number | null; beforeId?: string | null; tag?: string | null; featured?: 'only' | 'exclude'; published?: 'only' | 'exclude' } = {}
	): NotePage {
		const limit = Math.max(1, Math.min(100, Math.trunc(opts.limit ?? 50)));
		const tag = opts.tag?.trim().toLowerCase() || null;
		const featuredSql = opts.featured === 'only' ? ' AND n.featured = 1' : opts.featured === 'exclude' ? ' AND n.featured = 0' : '';
		const publishedSql = opts.published === 'only' ? ' AND n.published = 1' : opts.published === 'exclude' ? ' AND n.published = 0' : '';
		const useCursor =
			typeof opts.before === 'number' && Number.isFinite(opts.before) && !!opts.beforeId;
		const cursorSql = useCursor
			? ' AND (n.created_at < ? OR (n.created_at = ? AND n.id < ?))'
			: '';
		const params: SqlValue[] = [];
		let sql: string;
		if (tag) {
			sql = `SELECT n.* FROM notes n JOIN note_tags t ON t.note_id = n.id WHERE t.tag = ?${featuredSql}${publishedSql}${cursorSql}
				ORDER BY n.created_at DESC, n.id DESC LIMIT ?`;
			params.push(tag);
		} else {
			sql = `SELECT n.* FROM notes n WHERE 1 = 1${featuredSql}${publishedSql}${cursorSql}
				ORDER BY n.created_at DESC, n.id DESC LIMIT ?`;
		}
		if (useCursor) params.push(opts.before as number, opts.before as number, opts.beforeId as string);
		params.push(limit + 1);

		const rows = db.prepare(sql).all(...params) as unknown as NoteRow[];
		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		return {
			notes: withTags(page),
			hasMore,
			nextCursor: last ? { created_at: last.created_at, id: last.id } : null
		};
	}

	function countNotesByTag(tag: string): number {
		return (db
			.prepare('SELECT COUNT(*) AS c FROM note_tags WHERE tag = ?')
			.get(tag.trim().toLowerCase()) as { c: number }).c;
	}

	/** Replace a note's tags. Passing an empty array clears them. */
	function setNoteTags(noteId: string, tags: string[]): void {
		const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
		db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
		if (clean.length === 0) return;
		const ins = db.prepare('INSERT INTO note_tags (note_id, tag) VALUES (?, ?)');
		db.transaction(() => {
			for (const t of clean) ins.run(noteId, t);
		});
	}

	/** Remove one tag from one note. Returns false when the link did not exist.
	 *  The tag is normalised the same way setNoteTags stores it. */
	function removeNoteTag(noteId: string, tag: string): boolean {
		const clean = tag.trim().toLowerCase();
		if (!clean) return false;
		return (
			db.prepare('DELETE FROM note_tags WHERE note_id = ? AND tag = ?').run(noteId, clean).changes > 0
		);
	}

	// --- To-Do groups and items -------------------------------------------
	// Tags on items use the exact same normalisation as note tags
	// (trim + lowercase, max 12), so tags stay one concept across sections.

	function listTodoGroups(): TodoGroup[] {
		return db
			.prepare('SELECT * FROM todo_groups ORDER BY position ASC, created_at ASC, id ASC')
			.all() as unknown as TodoGroup[];
	}

	function createTodoGroup(name: string): TodoGroup | null {
		const clean = name.trim();
		if (!clean) return null;
		const now = Date.now();
		const id = crypto.randomUUID();
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todo_groups').get() as { m: number };
		db.prepare('INSERT INTO todo_groups (id, name, position, created_at) VALUES (?, ?, ?, ?)').run(id, clean, max.m + 1, now);
		return { id, name: clean, position: max.m + 1, created_at: now };
	}

	/** Persist a full group order. Unknown ids are ignored. */
	function setTodoGroupOrder(ids: string[]): void {
		const upd = db.prepare('UPDATE todo_groups SET position = ? WHERE id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id));
		});
	}

	/** Rename a group. Items follow because they reference the group id, which
	 *  never changes. Returns null when the group does not exist. */
	function renameTodoGroup(id: string, name: string): TodoGroup | null {
		const clean = name.trim();
		if (!clean) return null;
		const done = db.prepare('UPDATE todo_groups SET name = ? WHERE id = ?').run(clean, id).changes > 0;
		if (!done) return null;
		return db.prepare('SELECT * FROM todo_groups WHERE id = ?').get(id) as unknown as TodoGroup;
	}

	function deleteTodoGroup(id: string): boolean {
		return db.prepare('DELETE FROM todo_groups WHERE id = ?').run(id).changes > 0;
	}

	function tagsByItem(rows: { id: string }[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const tagRows = db
			.prepare(`SELECT item_id, tag FROM todo_item_tags WHERE item_id IN (${placeholders}) ORDER BY tag`)
			.all(...ids) as unknown as { item_id: string; tag: string }[];
		for (const t of tagRows) {
			if (!map.has(t.item_id)) map.set(t.item_id, []);
			map.get(t.item_id)!.push(t.tag);
		}
		return map;
	}

	interface TodoItemRow {
		id: string;
		group_id: string;
		content: string;
		done: number;
		done_at: number;
		in_progress: number;
		subgroup: string;
		video: string;
		position: number;
		created_at: number;
		updated_at: number;
		comment_count: number;
	}

	const rowToTodoItem = (r: TodoItemRow, tags: string[] = [], photoId: string | null = null): TodoItem => ({
		id: r.id,
		group_id: r.group_id,
		content: r.content,
		done: r.done === 1,
		done_at: r.done_at ?? 0,
		inProgress: r.in_progress === 1,
		position: r.position ?? 0,
		created_at: r.created_at,
		updated_at: r.updated_at,
		commentCount: r.comment_count ?? 0,
		subgroup: r.subgroup ?? '',
		video: r.video ?? '',
		photoId,
		tags
	});

	/** Photo id per item, one query for a whole list. */
	function photoIdsByItem(rows: { id: string }[]): Map<string, string> {
		const map = new Map<string, string>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const photoRows = db
			.prepare(`SELECT item_id, id FROM todo_item_photos WHERE item_id IN (${placeholders})`)
			.all(...ids) as unknown as { item_id: string; id: string }[];
		for (const p of photoRows) map.set(p.item_id, p.id);
		return map;
	}

	function listTodoItems(groupId: string): TodoItem[] {
		const rows = db
			.prepare(
				`SELECT i.*, (SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i WHERE i.group_id = ? ORDER BY i.in_progress DESC, i.position ASC, i.created_at ASC, i.id ASC`
			)
			.all(groupId) as unknown as TodoItemRow[];
		const tags = tagsByItem(rows);
		const photos = photoIdsByItem(rows);
		return rows.map((r) => rowToTodoItem(r, tags.get(r.id) ?? [], photos.get(r.id) ?? null));
	}

	function getTodoItem(id: string): TodoItem | null {
		const r = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as unknown as TodoItemRow | undefined;
		if (!r) return null;
		return rowToTodoItem(
			r,
			tagsByItem([r]).get(r.id) ?? [],
			photoIdsByItem([r]).get(r.id) ?? null
		);
	}

	/** Set (replacing) an item's image. Null bytes clear it. */
	function setTodoItemPhoto(
		itemId: string,
		photo: Uint8Array | null,
		mime: string
	): { id: string; created_at: number } | null {
		const exists = db.prepare('SELECT id FROM todo_items WHERE id = ?').get(itemId) as unknown as
			| { id: string }
			| undefined;
		if (!exists) return null;
		if (photo === null) {
			db.prepare('DELETE FROM todo_item_photos WHERE item_id = ?').run(itemId);
			return null;
		}
		const id = crypto.randomUUID();
		const now = Date.now();
		db.transaction(() => {
			db.prepare('DELETE FROM todo_item_photos WHERE item_id = ?').run(itemId);
			db.prepare(
				'INSERT INTO todo_item_photos (id, item_id, photo, mime, created_at) VALUES (?, ?, ?, ?, ?)'
			).run(id, itemId, photo as unknown as string, mime, now);
		});
		return { id, created_at: now };
	}

	/** Remove an item's image. True when a row went away. */
	function removeTodoItemPhoto(itemId: string): boolean {
		return db.prepare('DELETE FROM todo_item_photos WHERE item_id = ?').run(itemId).changes > 0;
	}

	/** Item image bytes by photo id. */
	function getTodoItemPhoto(photoId: string): { photo: Uint8Array; mime: string; createdAt: number } | null {
		let r: { photo: unknown; mime: string; created_at: number } | undefined;
		try {
			r = db
				.prepare('SELECT photo, mime, created_at FROM todo_item_photos WHERE id = ?')
				.get(photoId) as unknown as { photo: unknown; mime: string; created_at: number } | undefined;
		} catch {
			return null;
		}
		if (!r || r.photo === null || r.photo === undefined) return null;
		const bytes = toBytes(r.photo);
		if (bytes.length === 0) return null;
		return { photo: bytes, mime: r.mime || 'image/jpeg', createdAt: r.created_at };
	}

	function createTodoItem(groupId: string, content: string, createdAt: number, subgroup = '', video = ''): TodoItem | null {
		const group = db.prepare('SELECT id FROM todo_groups WHERE id = ?').get(groupId) as unknown as { id: string } | undefined;
		if (!group) return null;
		const clean = content.trim();
		if (!clean) return null;
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todo_items WHERE group_id = ?').get(groupId) as { m: number };
		const id = crypto.randomUUID();
		db.prepare(
			'INSERT INTO todo_items (id, group_id, content, done, done_at, in_progress, subgroup, video, position, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)'
		).run(id, groupId, clean, subgroup, video, max.m + 1, createdAt, createdAt);
		return { id, group_id: groupId, content: clean, done: false, done_at: 0, inProgress: false, position: max.m + 1, created_at: createdAt, updated_at: createdAt, commentCount: 0, subgroup, video, photoId: null, tags: [] };
	}

	/** Edit text and/or checked state. `updated_at` always moves past
	 *  `created_at`. Checking stamps `done_at`; unchecking clears it.
	 *  Returns null when the item does not exist. */
	function updateTodoItem(id: string, patch: { content?: string; done?: boolean; inProgress?: boolean; subgroup?: string; video?: string; group_id?: string }): TodoItem | null {
		const existing = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as unknown as TodoItemRow | undefined;
		if (!existing) return null;
		const content = patch.content !== undefined ? patch.content.trim() : existing.content;
		if (!content) return null;
		// Moving groups appends at the end of the target list.
		let groupId = existing.group_id;
		let position = existing.position ?? 0;
		if (patch.group_id !== undefined && patch.group_id !== existing.group_id) {
			const target = db.prepare('SELECT id FROM todo_groups WHERE id = ?').get(patch.group_id) as unknown as { id: string } | undefined;
			if (!target) return null;
			const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todo_items WHERE group_id = ?').get(patch.group_id) as { m: number };
			groupId = patch.group_id;
			position = max.m + 1;
		}
		const done = patch.done !== undefined ? (patch.done ? 1 : 0) : existing.done;
		const now = Math.max(Date.now(), existing.created_at + 1);
		const doneAt = patch.done !== undefined ? (patch.done ? now : 0) : (existing.done_at ?? 0);
		// Completing a task always ends its in-progress state.
		const inProgress = done
			? 0
			: patch.inProgress !== undefined
				? patch.inProgress
					? 1
					: 0
				: (existing.in_progress ?? 0);
		const subgroup = patch.subgroup !== undefined ? patch.subgroup : (existing.subgroup ?? '');
		const video = patch.video !== undefined ? patch.video : (existing.video ?? '');
		db.prepare('UPDATE todo_items SET content = ?, done = ?, done_at = ?, in_progress = ?, subgroup = ?, video = ?, group_id = ?, position = ?, updated_at = ? WHERE id = ?').run(content, done, doneAt, inProgress, subgroup, video, groupId, position, now, id);
		return getTodoItem(id);
	}

	function deleteTodoItem(id: string): boolean {
		return db.prepare('DELETE FROM todo_items WHERE id = ?').run(id).changes > 0;
	}

	/** Items carrying a tag, newest first. Powers the To-Do group on tag pages. */
	function listTodoItemsByTag(tag: string): TodoItem[] {
		const clean = tag.trim().toLowerCase();
		if (!clean) return [];
		const rows = db
			.prepare(
				`SELECT i.*, (SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i JOIN todo_item_tags t ON t.item_id = i.id
				 WHERE t.tag = ? ORDER BY i.created_at DESC, i.id DESC`
			)
			.all(clean) as unknown as TodoItemRow[];
		const tags = tagsByItem(rows);
		const photos = photoIdsByItem(rows);
		return rows.map((r) => rowToTodoItem(r, tags.get(r.id) ?? [], photos.get(r.id) ?? null));
	}

	/** Every in-progress item across groups, with its group name attached. */
	function listInProgressItems(): TodoProgressItem[] {
		const rows = db
			.prepare(
				`SELECT i.*, g.name AS group_name,
					(SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i JOIN todo_groups g ON g.id = i.group_id
				 WHERE i.in_progress = 1 AND i.done = 0 ORDER BY i.updated_at DESC, i.id DESC`
			)
			.all() as unknown as (TodoItemRow & { group_name: string })[];
		const tags = tagsByItem(rows);
		const photos = photoIdsByItem(rows);
		return rows.map((r) => ({
			...rowToTodoItem(r, tags.get(r.id) ?? [], photos.get(r.id) ?? null),
			groupName: r.group_name
		}));
	}

	/** Done items across every group, latest completion first. */
	function listDoneItems(limit = 50, cursor: TodoDoneCursor | null = null): TodoDonePage {
		const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 50;
		const cursorSql = cursor ? 'AND (i.done_at < ? OR (i.done_at = ? AND i.id < ?))' : '';
		const params: SqlValue[] = cursor ? [cursor.done_at, cursor.done_at, cursor.id] : [];
		const rows = db
			.prepare(
				`SELECT i.*, g.name AS group_name,
					(SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i JOIN todo_groups g ON g.id = i.group_id
				 WHERE i.done = 1 ${cursorSql}
				 ORDER BY i.done_at DESC, i.id DESC LIMIT ?`
			)
			.all(...params, safeLimit + 1) as unknown as (TodoItemRow & { group_name: string })[];
		const hasMore = rows.length > safeLimit;
		const page = hasMore ? rows.slice(0, safeLimit) : rows;
		const tags = tagsByItem(page);
		const photos = photoIdsByItem(page);
		const items = page.map((r) => ({
			...rowToTodoItem(r, tags.get(r.id) ?? [], photos.get(r.id) ?? null),
			groupName: r.group_name
		}));
		const last = page[page.length - 1];
		const count = (db.prepare('SELECT COUNT(*) AS c FROM todo_items WHERE done = 1').get() as { c: number }).c;
		return {
			items,
			count,
			hasMore,
			nextCursor: hasMore && last ? { done_at: last.done_at, id: last.id } : null
		};
	}

	/** Persist a full item order inside one group. Unknown ids are ignored. */
	function setTodoItemOrder(groupId: string, ids: string[]): void {
		const upd = db.prepare('UPDATE todo_items SET position = ? WHERE id = ? AND group_id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id, groupId));
		});
	}

	// --- Task comments -----------------------------------------------------
	// History of a task's evolution. Edits keep the original timestamp, so
	// the timeline does not reorder. Deleting needs a confirm on the client.

	function listTaskComments(itemId: string): TaskComment[] {
		const rows = db
			.prepare('SELECT * FROM task_comments WHERE item_id = ? ORDER BY pinned DESC, created_at DESC, id DESC')
			.all(itemId) as unknown as CommentRow<TaskComment>[];
		return rows.map(rowToComment);
	}

	function createTaskComment(itemId: string, content: string): TaskComment | null {
		const group = db.prepare('SELECT id FROM todo_items WHERE id = ?').get(itemId) as unknown as { id: string } | undefined;
		if (!group) return null;
		const clean = content.trim();
		if (!clean) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO task_comments (id, item_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, itemId, clean, now);
		return { id, item_id: itemId, content: clean, created_at: now, pinned: false };
	}

	function updateTaskComment(itemId: string, id: string, patch: CommentPatch): TaskComment | null {
		const current = db
			.prepare('SELECT * FROM task_comments WHERE id = ? AND item_id = ?')
			.get(id, itemId) as unknown as CommentRow<TaskComment> | undefined;
		if (!current) return null;
		const clean = patch.content === undefined ? current.content : patch.content.trim();
		if (!clean) return null;
		const pinned = patch.pinned === undefined ? current.pinned === 1 : patch.pinned;
		if (current.content !== clean || (current.pinned === 1) !== pinned) {
			db.prepare('UPDATE task_comments SET content = ?, pinned = ? WHERE id = ? AND item_id = ?').run(
				clean,
				pinned ? 1 : 0,
				id,
				itemId
			);
		}
		return { ...current, content: clean, pinned };
	}

	function deleteTaskComment(itemId: string, id: string): boolean {
		return db.prepare('DELETE FROM task_comments WHERE id = ? AND item_id = ?').run(id, itemId).changes > 0;
	}

	function listNoteComments(noteId: string): NoteComment[] {
		const rows = db
			.prepare('SELECT * FROM note_comments WHERE note_id = ? ORDER BY pinned DESC, created_at DESC, id DESC')
			.all(noteId) as unknown as CommentRow<NoteComment>[];
		return rows.map(rowToComment);
	}

	function createNoteComment(noteId: string, content: string): NoteComment | null {
		const note = db.prepare('SELECT id FROM notes WHERE id = ?').get(noteId) as unknown as
			| { id: string }
			| undefined;
		if (!note) return null;
		const clean = content.trim();
		if (!clean) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO note_comments (id, note_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, noteId, clean, now);
		return { id, note_id: noteId, content: clean, created_at: now, pinned: false };
	}

	function updateNoteComment(noteId: string, id: string, patch: CommentPatch): NoteComment | null {
		const current = db
			.prepare('SELECT * FROM note_comments WHERE id = ? AND note_id = ?')
			.get(id, noteId) as unknown as CommentRow<NoteComment> | undefined;
		if (!current) return null;
		const clean = patch.content === undefined ? current.content : patch.content.trim();
		if (!clean) return null;
		const pinned = patch.pinned === undefined ? current.pinned === 1 : patch.pinned;
		if (current.content !== clean || (current.pinned === 1) !== pinned) {
			db.prepare('UPDATE note_comments SET content = ?, pinned = ? WHERE id = ? AND note_id = ?').run(
				clean,
				pinned ? 1 : 0,
				id,
				noteId
			);
		}
		return { ...current, content: clean, pinned };
	}

	function deleteNoteComment(noteId: string, id: string): boolean {
		return db.prepare('DELETE FROM note_comments WHERE id = ? AND note_id = ?').run(id, noteId).changes > 0;
	}

	/** Replace an item's tags. Passing an empty array clears them. */
	function setTodoItemTags(itemId: string, tags: string[]): void {
		const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
		db.prepare('DELETE FROM todo_item_tags WHERE item_id = ?').run(itemId);
		if (clean.length === 0) return;
		const ins = db.prepare('INSERT INTO todo_item_tags (item_id, tag) VALUES (?, ?)');
		db.transaction(() => {
			for (const t of clean) ins.run(itemId, t);
		});
	}

	// --- Principles ------------------------------------------------------
	// Numbering is positional: `position` stores the order, the display
	// derives 1..N from it. Reorder writes the whole order in one
	// transaction so numbers can never gap.

	function tagsByPrinciple(rows: { id: string }[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const tagRows = db
			.prepare(`SELECT principle_id, tag FROM principle_tags WHERE principle_id IN (${placeholders}) ORDER BY tag`)
			.all(...ids) as unknown as { principle_id: string; tag: string }[];
		for (const t of tagRows) {
			if (!map.has(t.principle_id)) map.set(t.principle_id, []);
			map.get(t.principle_id)!.push(t.tag);
		}
		return map;
	}

	/** One principle by id, with the same batched tags, links and comment
	 *  count as the list. Null when it does not exist. */
	function getPrinciple(id: string): Principle | null {
		const row = db
			.prepare(
				`SELECT p.*, (SELECT COUNT(*) FROM principle_comments c WHERE c.principle_id = p.id) AS comment_count
				 FROM principles p WHERE p.id = ?`
			)
			.get(id) as unknown as (Omit<Principle, 'tags' | 'commentCount' | 'video' | 'linkedNotes'> & { video: string; comment_count: number } | undefined);
		if (!row) return null;
		const tags = tagsByPrinciple([row]);
		const links = linksByPrinciple([row]);
		return { ...row, video: row.video ?? '', tags: tags.get(row.id) ?? [], commentCount: row.comment_count ?? 0, linkedNotes: links.get(row.id) ?? [] };
	}

	function listPrinciples(): Principle[] {
		const rows = db
			.prepare(
				`SELECT p.*, (SELECT COUNT(*) FROM principle_comments c WHERE c.principle_id = p.id) AS comment_count
				 FROM principles p ORDER BY p.position ASC, p.created_at ASC, p.id ASC`
			)
			.all() as unknown as (Omit<Principle, 'tags' | 'commentCount' | 'video' | 'linkedNotes'> & { video: string; comment_count: number })[];
		const tags = tagsByPrinciple(rows);
		const links = linksByPrinciple(rows);
		return rows.map((r) => ({ ...r, video: r.video ?? '', tags: tags.get(r.id) ?? [], commentCount: r.comment_count ?? 0, linkedNotes: links.get(r.id) ?? [] }));
	}

	function listPrinciplesByTag(tag: string): Principle[] {
		const clean = tag.trim().toLowerCase();
		if (!clean) return [];
		const rows = db
			.prepare(
				`SELECT p.*, (SELECT COUNT(*) FROM principle_comments c WHERE c.principle_id = p.id) AS comment_count
				 FROM principles p JOIN principle_tags t ON t.principle_id = p.id
				 WHERE t.tag = ? ORDER BY p.position ASC, p.created_at ASC, p.id ASC`
			)
			.all(clean) as unknown as (Omit<Principle, 'tags' | 'commentCount' | 'video' | 'linkedNotes'> & { video: string; comment_count: number })[];
		const tags = tagsByPrinciple(rows);
		const links = linksByPrinciple(rows);
		return rows.map((r) => ({ ...r, video: r.video ?? '', tags: tags.get(r.id) ?? [], commentCount: r.comment_count ?? 0, linkedNotes: links.get(r.id) ?? [] }));
	}

	function createPrinciple(content: string): Principle | null {
		const clean = content.trim();
		if (!clean) return null;
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM principles').get() as { m: number };
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO principles (id, content, position, created_at) VALUES (?, ?, ?, ?)').run(
			id,
			clean,
			max.m + 1,
			now
		);
		return { id, content: clean, position: max.m + 1, created_at: now, video: '', tags: [], commentCount: 0 };
	}

	function updatePrinciple(id: string, content: string): Principle | null {
		const clean = content.trim();
		if (!clean) return null;
		const done = db.prepare('UPDATE principles SET content = ? WHERE id = ?').run(clean, id).changes > 0;
		if (!done) return null;
		return updatePrincipleKeepTags(id);
	}

	/** Set or clear the YouTube video id. Empty clears. Touches only its column. */
	function setPrincipleVideo(id: string, video: string): Principle | null {
		const done = db.prepare('UPDATE principles SET video = ? WHERE id = ?').run(video, id).changes > 0;
		if (!done) return null;
		return updatePrincipleKeepTags(id);
	}

	function updatePrincipleKeepTags(id: string): Principle | null {
		const row = db.prepare('SELECT * FROM principles WHERE id = ?').get(id) as unknown as (Omit<Principle, 'tags' | 'commentCount' | 'video' | 'linkedNotes'> & { video: string } | undefined);
		if (!row) return null;
		const count = db.prepare('SELECT COUNT(*) AS c FROM principle_comments WHERE principle_id = ?').get(id) as { c: number };
		return { ...row, video: row.video ?? '', tags: tagsByPrinciple([row]).get(id) ?? [], commentCount: count.c ?? 0, linkedNotes: linksByPrinciple([row]).get(id) ?? [] };
	}

	/** Replace a principle's tags. Passing an empty array clears them. */
	function setPrincipleTags(principleId: string, tags: string[]): void {
		const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
		db.prepare('DELETE FROM principle_tags WHERE principle_id = ?').run(principleId);
		if (clean.length === 0) return;
		const ins = db.prepare('INSERT INTO principle_tags (principle_id, tag) VALUES (?, ?)');
		db.transaction(() => {
			for (const t of clean) ins.run(principleId, t);
		});
	}

	function deletePrinciple(id: string): boolean {
		return db.prepare('DELETE FROM principles WHERE id = ?').run(id).changes > 0;
	}

	// --- Principle comments ---------------------------------------------------
	// History mirroring task comments. Edits keep the original timestamp;
	// deleting one needs a confirm on the client.

	function listPrincipleComments(principleId: string): PrincipleComment[] {
		const rows = db
			.prepare(
				'SELECT * FROM principle_comments WHERE principle_id = ? ORDER BY pinned DESC, created_at DESC, id DESC'
			)
			.all(principleId) as unknown as CommentRow<PrincipleComment>[];
		return rows.map(rowToComment);
	}

	function createPrincipleComment(principleId: string, content: string): PrincipleComment | null {
		const exists = db.prepare('SELECT id FROM principles WHERE id = ?').get(principleId) as unknown as { id: string } | undefined;
		if (!exists) return null;
		const clean = content.trim();
		if (!clean) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO principle_comments (id, principle_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, principleId, clean, now);
		return { id, principle_id: principleId, content: clean, created_at: now, pinned: false };
	}

	function updatePrincipleComment(
		principleId: string,
		id: string,
		patch: CommentPatch
	): PrincipleComment | null {
		const current = db
			.prepare('SELECT * FROM principle_comments WHERE id = ? AND principle_id = ?')
			.get(id, principleId) as unknown as CommentRow<PrincipleComment> | undefined;
		if (!current) return null;
		const clean = patch.content === undefined ? current.content : patch.content.trim();
		if (!clean) return null;
		const pinned = patch.pinned === undefined ? current.pinned === 1 : patch.pinned;
		if (current.content !== clean || (current.pinned === 1) !== pinned) {
			db.prepare('UPDATE principle_comments SET content = ?, pinned = ? WHERE id = ? AND principle_id = ?').run(
				clean,
				pinned ? 1 : 0,
				id,
				principleId
			);
		}
		return { ...current, content: clean, pinned };
	}

	function deletePrincipleComment(principleId: string, id: string): boolean {
		return db.prepare('DELETE FROM principle_comments WHERE id = ? AND principle_id = ?').run(id, principleId).changes > 0;
	}

	/** Persist a full order. Unknown ids are ignored; missing rows keep
	 *  their relative order after the listed ones. */
	function setPrincipleOrder(ids: string[]): void {
		const upd = db.prepare('UPDATE principles SET position = ? WHERE id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id));
		});
	}

	// --- Holdings ------------------------------------------------------------
	// Investing boxes on the home carousel. Prices are manual until the rates
	// refresh fills them: fiat converts through fx_rates, BTC-ticker rows take
	// the fetched BTC price while their price is auto (or unset). A manual
	// price edit clears the auto flag so refreshes never overwrite it.

	type HoldingRow = {
		id: string;
		ticker: string;
		amount: number;
		price: number | null;
		price_auto: number;
		currency: string;
		category: string;
		goal: number | null;
		bank: string;
		country: string;
		position: number;
		created_at: number;
		updated_at: number;
		price_updated_at: number;
		previous_value: number | null;
		previous_value_at: number;
	};

	const DAY_MS = 24 * 60 * 60 * 1000;
	const RATES_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=USD';
	const YAHOO_UA =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

	/** Yahoo symbol: B3 codes get `.SA` (`SNEL11` → `SNEL11.SA`); a ticker
	 *  that already carries a dot is used as-is (`AAPL` stays US). */
	function yahooSymbol(ticker: string): string {
		const t = ticker.toUpperCase();
		if (t.includes('.')) return t;
		return isB3(t) ? `${t}.SA` : t;
	}

	function isB3(ticker: string): boolean {
		const t = ticker.toUpperCase();
		return !t.includes('.') && /^[A-Z]{4}\d{1,2}[A-Z0-9]?$/.test(t);
	}

	/** Every quote attempt lands here: ticker, source, success, price and
	 *  error. The debug modal reads this table, so a stale card can always
	 *  explain itself. Best effort: logging never breaks a refresh. */
	function logQuoteFetch(entry: {
		ticker: string;
		source: string;
		ok: boolean;
		price?: number | null;
		previousClose?: number | null;
		error?: string;
	}): void {
		try {
			db.prepare(
				'INSERT INTO quote_fetch_log (id, ticker, source, ok, price, previous_close, error, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			).run(
				crypto.randomUUID(),
				entry.ticker.toUpperCase().slice(0, 24),
				entry.source.slice(0, 24),
				entry.ok ? 1 : 0,
				entry.price ?? null,
				entry.previousClose ?? null,
				String(entry.error ?? '').slice(0, 200),
				Date.now()
			);
			db.prepare(
				'DELETE FROM quote_fetch_log WHERE id NOT IN (SELECT id FROM quote_fetch_log ORDER BY fetched_at DESC, id DESC LIMIT 500)'
			).run();
		} catch {
			// Table arrives with migration 23; older journals skip logging.
		}
	}

	function listQuoteFetchLog(limit = 100): QuoteFetchEntry[] {
		const safe = Math.min(500, Math.max(1, Math.trunc(limit) || 100));
		try {
			return db
				.prepare(
					'SELECT ticker, source, ok, price, previous_close, error, fetched_at FROM quote_fetch_log ORDER BY fetched_at DESC, rowid DESC LIMIT ?'
				)
				.all(safe) as unknown as QuoteFetchEntry[];
		} catch {
			return [];
		}
	}

	/** Ripio quote for the Ripio venue, priced in USD (BTC_USDC tracks
	 *  the dollar). With saved credentials it uses the signed Market
	 *  ticker (real time); without them, or after an auth rejection, the
	 *  public endpoint (which Ripio itself caches up to 30 s). Ripio
	 *  throttles fast callers, so results cache for a minute and a
	 *  throttled refresh serves the cached price instead of failing.
	 *  Independent from the holdings BTC price (Coinbase): neither
	 *  source can break the other. */
	let ripioCache: {
		at: number;
		pair: string;
		price: number;
		high: number | null;
		low: number | null;
		change: number | null;
		bid: number | null;
		ask: number | null;
		live: boolean;
	} | null = null;
	const RIPIO_TTL_MS = 60_000;

	type RipioQuote =
		| {
				pair: string;
				priceUsd: number;
				high24h: number | null;
				low24h: number | null;
				changePct24h: number | null;
				/** Best bid/ask — only the signed Market ticker answers with
				 *  them; null on the public path. */
				bid: number | null;
				ask: number | null;
				fetchedAt: number;
				cached: boolean;
				/** true = signed Market ticker; false = public endpoint. */
				live: boolean;
				/** Present only when the stored key was rejected (401/403)
				 *  and the public endpoint answered instead; the string is the
				 *  HTTP status plus whatever Ripio's body reported. */
				authError?: string;
		  }
		| { error: string };

	async function getRipioQuote(rawPair: unknown, force = false): Promise<RipioQuote> {
		const pair = String(rawPair ?? 'BTC_USDC').trim().toUpperCase();
		if (!/^[A-Z0-9]{2,10}_[A-Z0-9]{2,10}$/.test(pair)) return { error: 'bad pair' };
		const now = Date.now();
		const fromCache = (): RipioQuote => ({
			pair,
			priceUsd: ripioCache!.price,
			high24h: ripioCache!.high,
			low24h: ripioCache!.low,
			changePct24h: ripioCache!.change,
			bid: ripioCache!.bid,
			ask: ripioCache!.ask,
			fetchedAt: ripioCache!.at,
			cached: true,
			live: ripioCache!.live
		});
		// force = the page's Refresh button: an honest re-read, never the
		// minute-old cache.
		if (ripioCache && ripioCache.pair === pair && !force && now - ripioCache.at < RIPIO_TTL_MS) {
			return fromCache();
		}
		const fail = (error: string): RipioQuote => {
			logQuoteFetch({ ticker: pair, source: 'ripio', ok: false, error });
			if (ripioCache && ripioCache.pair === pair) return fromCache();
			return { error };
		};
		let cred: { token: string; secret: string } | null = null;
		try {
			cred = getApiCredential('ripio');
		} catch {
			cred = null;
		}
		const send = async (
			signed: boolean
		): Promise<{
			status: number;
			body?: {
				data?: { last?: unknown; high?: unknown; low?: unknown; bid?: unknown; ask?: unknown; price_change_percent_24h?: unknown };
				message?: unknown;
				error?: unknown;
				error_code?: unknown;
			};
		}> => {
			const path = signed
				? `/trade/ticker/${encodeURIComponent(pair)}`
				: `/trade/public/tickers/${encodeURIComponent(pair)}`;
			const headers: Record<string, string> = { 'user-agent': YAHOO_UA, 'content-type': 'application/json' };
			if (signed && cred) {
				const ts = String(Date.now());
				// Ripio signs Timestamp + HTTP Method + Path + JSON Payload;
				// GET takes the path WITHOUT query and an empty payload.
				headers.authorization = cred.token;
				headers.timestamp = ts;
				headers.signature = await hmacBase64(cred.secret, `${ts}GET${path}`);
				// Handle minor clock skew between this machine and Ripio.
				headers['timestamp-tolerance'] = '5000';
			}
			const res = await fetch(`https://api.ripio.com${path}`, { signal: AbortSignal.timeout(10000), headers });
			// Parse the body even on non-OK so the auth rejection carries
			// Ripio's own error message, not just the status code.
			const body = await res.json().catch(() => undefined);
			return { status: res.status, body };
		};
		try {
			let status = 0;
			let body: Awaited<ReturnType<typeof send>>['body'];
			let live = false;
			let authFellBack = false;
			let authMsg = '';
			if (cred) {
				const signed = await send(true);
				if (signed.status === 401 || signed.status === 403) {
					// A bad or expired key must never empty the cards:
					// log the rejection and serve the public quote instead.
					// Surface whatever Ripio reported so the user sees the
					// real reason (bad token, missing permission, clock skew)
					// instead of a bare status code.
					authFellBack = true;
					const detail = (signed.body as any)?.message ?? (signed.body as any)?.error ?? (signed.body as any)?.error_code ?? (signed.body as any)?.data?.message ?? '';
					authMsg = detail ? `auth ${signed.status}: ${detail}` : `auth ${signed.status}`;
					logQuoteFetch({ ticker: pair, source: 'ripio', ok: false, error: `${authMsg}, used public` });
					const pub = await send(false);
					status = pub.status;
					body = pub.body;
				} else {
					status = signed.status;
					body = signed.body;
					live = signed.status === 200;
				}
			} else {
				const pub = await send(false);
				status = pub.status;
				body = pub.body;
			}
			if (status !== 200) return fail(`HTTP ${status}`);
			const last = Number(body?.data?.last);
			if (!Number.isFinite(last) || last <= 0) return fail('no quote');
			const num = (v: unknown): number | null => {
				const n = Number(v);
				return Number.isFinite(n) && n > 0 ? n : null;
			};
			const pct = Number(body?.data?.price_change_percent_24h);
			ripioCache = {
				at: now,
				pair,
				price: last,
				high: num(body?.data?.high),
				low: num(body?.data?.low),
				bid: num(body?.data?.bid),
				ask: num(body?.data?.ask),
				change: Number.isFinite(pct) ? pct : null,
				live
			};
			logQuoteFetch({ ticker: pair, source: live ? 'ripio-market' : 'ripio', ok: true, price: last });
			return {
				pair,
				priceUsd: last,
				high24h: ripioCache.high,
				low24h: ripioCache.low,
				changePct24h: ripioCache.change,
				bid: ripioCache.bid,
				ask: ripioCache.ask,
				fetchedAt: now,
				cached: false,
				live,
				...(authFellBack ? { authError: authMsg } : {})
			};
		} catch (e) {
			return fail((e as Error)?.message ?? 'network');
		}
	}

	/** Canonical BTC-USD for comparison: the same Coinbase exchange-rates
	 *  row Holdings prices BTC with. Serves the stored fx_rates row while it
	 *  is under a day old — the number must match the holdings card exactly;
	 *  a network fetch on every view would also drift between the two. */
	type GlobalBtc = { priceUsd: number; fetchedAt: number; cached: boolean } | { error: string };

	async function getGlobalBtcQuote(force = false): Promise<GlobalBtc> {
		const row = (() => {
			try {
				return db.prepare('SELECT rate_to_usd, fetched_at FROM fx_rates WHERE currency = ?').get('BTC') as unknown as
					| { rate_to_usd: number; fetched_at: number }
					| undefined;
			} catch {
				return undefined;
			}
		})();
		if (!force && row && Date.now() - row.fetched_at < DAY_MS) {
			return { priceUsd: row.rate_to_usd, fetchedAt: row.fetched_at, cached: true };
		}
		try {
			if (typeof fetch !== 'function') throw new Error('network unavailable');
			const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(10000) });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { data?: { rates?: Record<string, string> } };
			const btcPerUsd = Number(body?.data?.rates?.['BTC']);
			if (!Number.isFinite(btcPerUsd) || btcPerUsd <= 0) throw new Error('no rate in payload');
			const price = 1 / btcPerUsd;
			const now = Date.now();
			db.prepare(
				'INSERT INTO fx_rates (currency, rate_to_usd, fetched_at) VALUES (?, ?, ?) ON CONFLICT (currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, fetched_at = excluded.fetched_at'
			).run('BTC', price, now);
			// Deliberately NOT logged: the Logs modal tracks the venue quote
			// hunt (ripio/yahoo/google/b3) plus refreshRates' own Coinbase BTC
			// line. Logging every comparison-card read would flood it with
			// duplicate BTC/coinbase entries that mean nothing new.
			return { priceUsd: price, fetchedAt: now, cached: false };
		} catch (e) {
			const error = (e as Error)?.message ?? 'network';
			// A stored (even stale) row beats no number for the comparison.
			if (row) return { priceUsd: row.rate_to_usd, fetchedAt: row.fetched_at, cached: true };
			return { error };
		}
	}

	/** One shared B3 quote path for Holdings and Trading: Google Finance
	 *  first (intraday), Fundamentus fallback (session close). Every attempt
	 *  is logged, success or failure. */
	async function fetchB3Quote(
		ticker: string
	): Promise<{ price: number; previousClose: number | null; source: string } | null> {
		const google = await fetchGoogleB3Quote(ticker);
		if (google) {
			logQuoteFetch({ ticker, source: 'google', ok: true, price: google.price, previousClose: google.previousClose });
			return { ...google, source: 'google' };
		}
		logQuoteFetch({ ticker, source: 'google', ok: false, error: 'no quote' });
		const fallback = await fetchFundamentusQuote(ticker);
		if (fallback !== null) {
			logQuoteFetch({ ticker, source: 'fundamentus', ok: true, price: fallback });
			return { price: fallback, previousClose: null, source: 'fundamentus' };
		}
		logQuoteFetch({ ticker, source: 'fundamentus', ok: false, error: 'no quote' });
		return null;
	}

	/** Latest quote for a B3 ticker from Google Finance. The page embeds the
	 *  main quote as `["TICKER","BVMF"],"Name",0,"BRL",[price,change,pct,…],
	 *  null,previousClose,…`. Google updates intraday, unlike Fundamentus,
	 *  which returns the regular-session close. Null on any failure. */
	async function fetchGoogleB3Quote(
		ticker: string
	): Promise<{ price: number; previousClose: number | null } | null> {
		const t = ticker.toUpperCase();
		try {
			const res = await fetch(
				`https://www.google.com/finance/quote/${encodeURIComponent(t)}:BVMF?hl=en`,
				{ signal: AbortSignal.timeout(10000), headers: { 'user-agent': YAHOO_UA } }
			);
			if (!res.ok) return null;
			const html = await res.text();
			const m = new RegExp(
				`\\["${t}","BVMF"\\],"(?:[^"\\\\]|\\\\.)*",\\d+,"BRL",\\[([^\\]]+)\\],null,([-\\d.eE+]+)`
			).exec(html);
			if (!m) return null;
			const [price, , pct] = m[1].split(',').map(Number);
			if (!Number.isFinite(price) || price <= 0) return null;
			let previousClose = Number(m[2]);
			if (!Number.isFinite(previousClose) || previousClose <= 0) {
				previousClose = Number.isFinite(pct) && pct !== -100 ? price / (1 + pct / 100) : NaN;
			}
			return {
				price,
				previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null
			};
		} catch {
			return null;
		}
	}

	/** Latest quote for a B3 ticker from Fundamentus (`Cotação` row).
	 *  Null on any failure — unknown ticker, layout change, non-numeric. */
	async function fetchFundamentusQuote(ticker: string): Promise<number | null> {
		try {
			const res = await fetch(
				`https://www.fundamentus.com.br/detalhes.php?papel=${encodeURIComponent(ticker.toUpperCase())}`,
				{ signal: AbortSignal.timeout(10000), headers: { 'user-agent': YAHOO_UA } }
			);
			if (!res.ok) return null;
			const html = new TextDecoder('iso-8859-1').decode(new Uint8Array(await res.arrayBuffer()));
			const m = /Cotação<\/span><\/td>\s*<td class="data[^"]*"><span class="txt">([\d.,]+)<\/span>/.exec(html);
			if (!m) return null;
			// Brazilian format: dots group thousands, comma is the decimal.
			const v = Number(m[1].replace(/\./g, '').replace(',', '.'));
			return Number.isFinite(v) && v > 0 ? v : null;
		} catch {
			return null;
		}
	}

	/** Latest price from the Yahoo chart API. Null on any failure — the
	 *  caller keeps the cached price and marks the summary stale instead. */
	async function fetchQuote(symbol: string): Promise<number | null> {
		try {
			const res = await fetch(
				`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
				{ signal: AbortSignal.timeout(8000), headers: { 'user-agent': YAHOO_UA } }
			);
			if (!res.ok) return null;
			const body = (await res.json()) as {
				chart?: { result?: { meta?: { regularMarketPrice?: unknown } }[] };
			};
			const p = body?.chart?.result?.[0]?.meta?.regularMarketPrice;
			return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
		} catch {
			return null;
		}
	}

	function cleanBank(v: unknown): string {
		return String(v ?? '').trim().slice(0, 40);
	}

	function cleanCountry(v: unknown): string {
		const c = String(v ?? '').trim().toUpperCase();
		return /^[A-Z]{2}$/.test(c) ? c : '';
	}

	/** Cash holdings are named by bank: the ticker is a slug of it. */
	function bankTicker(bank: string): string | null {
		const t = bank
			.trim()
			.toUpperCase()
			.replace(/\s+/g, '-')
			.replace(/[^A-Z0-9._-]/g, '')
			.slice(0, 12);
		return /^[A-Z0-9._-]{1,12}$/.test(t) ? t : null;
	}

	function rowToHolding(r: HoldingRow, toUsd: Map<string, number>, avgPrice: number | null = null): Holding {
		const rate = toUsd.get(r.currency) ?? 1;
		const value = r.amount * (r.price ?? 0);
		const previous = r.previous_value;
		const changePct =
			r.price !== null && previous !== null && previous > 0 ? ((value - previous) / previous) * 100 : null;
		return {
			id: r.id,
			ticker: r.ticker,
			amount: r.amount,
			price: r.price,
			priceAuto: r.price_auto === 1,
			currency: r.currency,
			category: cleanCategory(r.category, r.ticker),
			goal: r.goal,
			bank: r.bank ?? '',
			country: r.country ?? '',
			position: r.position,
			created_at: r.created_at,
			updated_at: r.updated_at,
			price_updated_at: r.price_updated_at ?? 0,
			previous_value: r.previous_value ?? null,
			previous_value_at: r.previous_value_at ?? 0,
			avgPrice,
			valueUsd: value * rate,
			changePct
		};
	}

	/** Opening average prices in one query; keep listing holdings cheap. */
	function openingPrices(): Map<string, number | null> {
		const rows = db
			.prepare("SELECT holding_id, price FROM holding_actions WHERE kind = 'opening'")
			.all() as unknown as { holding_id: string; price: number | null }[];
		return new Map(rows.map((r) => [r.holding_id, r.price]));
	}

	function fxToUsd(): { rates: Map<string, number>; at: Map<string, number> } {
		const rates = new Map<string, number>([['USD', 1]]);
		const at = new Map<string, number>();
		try {
			const rows = db.prepare('SELECT currency, rate_to_usd, fetched_at FROM fx_rates').all() as unknown as {
				currency: string;
				rate_to_usd: number;
				fetched_at: number;
			}[];
			for (const row of rows) {
				rates.set(row.currency, row.rate_to_usd);
				at.set(row.currency, row.fetched_at);
			}
		} catch {
			// Table arrives with migration 3; an older open journal reads USD-only.
		}
		return { rates, at };
	}

	function listHoldings(): Holding[] {
		const { rates } = fxToUsd();
		const avg = openingPrices();
		const rows = db
			.prepare('SELECT * FROM holdings ORDER BY position ASC, created_at ASC, id ASC')
			.all() as unknown as HoldingRow[];
		// Totals stay fixed first in the UI; the rest sort by money, with
		// position only breaking ties. Rates are known only post-query, so
		// the sort happens here, not in SQL.
		return rows
			.map((r) => rowToHolding(r, rates, avg.get(r.id) ?? null))
			.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || a.position - b.position);
	}

	// --- Holding value snapshots ----------------------------------------
	// One row per holding per day, plus one portfolio total per day. Later
	// fetches on the same day upsert that row, so the graph keeps the last
	// value seen for the day. The previous row feeds the card delta.

	function localDayKey(now = Date.now()): string {
		const d = new Date(now);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	function snapshotHoldingValue(holdingId: string, now = Date.now()): void {
		try {
			const row = db.prepare('SELECT * FROM holdings WHERE id = ?').get(holdingId) as unknown as HoldingRow | undefined;
			if (!row) return;
			const { rates } = fxToUsd();
			const rate = rates.get(row.currency) ?? 1;
			const value = row.amount * (row.price ?? 0);
			const valueUsd = value * rate;
			const day = localDayKey(now);
			const previous = db
				.prepare(
					'SELECT value, recorded_at FROM holding_value_history WHERE holding_id = ? AND day < ? ORDER BY day DESC LIMIT 1'
				)
				.get(holdingId, day) as unknown as { value: number; recorded_at: number } | undefined;
			db.transaction(() => {
				// Always compare the current day with the previous day. Same-day
				// refreshes only update today's row and never move the baseline.
				const baseline = previous ? previous.value : value;
				const baselineAt = previous ? previous.recorded_at : now;
				db.prepare('UPDATE holdings SET previous_value = ?, previous_value_at = ? WHERE id = ?').run(
					baseline,
					baselineAt,
					holdingId
				);
				db.prepare(
					`INSERT INTO holding_value_history (holding_id, day, amount, price, value, currency, value_usd, recorded_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT (holding_id, day) DO UPDATE SET
						amount = excluded.amount, price = excluded.price, value = excluded.value,
						currency = excluded.currency, value_usd = excluded.value_usd, recorded_at = excluded.recorded_at`
				).run(holdingId, day, row.amount, row.price, value, row.currency, valueUsd, now);
			});
		} catch {
			// Table arrives with migration 21; older journals skip snapshots.
		}
	}

	function snapshotPortfolioValue(now = Date.now()): void {
		try {
			const total = listHoldings().reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
			db.prepare(
				`INSERT INTO portfolio_value_history (day, value_usd, recorded_at)
				 VALUES (?, ?, ?)
				 ON CONFLICT (day) DO UPDATE SET value_usd = excluded.value_usd, recorded_at = excluded.recorded_at`
			).run(localDayKey(now), total, now);
		} catch {
			// Table arrives with migration 21; older journals skip snapshots.
		}
	}

	function snapshotAllValues(now = Date.now()): void {
		for (const h of listHoldings()) snapshotHoldingValue(h.id, now);
		snapshotPortfolioValue(now);
	}

	function listHoldingValueHistory(holdingId: string, days = 365): HoldingValuePoint[] {
		const safeDays = Math.min(3650, Math.max(1, Math.trunc(days)));
		const from = localDayKey(Date.now() - safeDays * DAY_MS);
		try {
			return db
				.prepare(
					`SELECT day, amount, price, value, currency, value_usd, recorded_at
					 FROM holding_value_history WHERE holding_id = ? AND day >= ?
					 ORDER BY day ASC`
				)
				.all(holdingId, from) as unknown as HoldingValuePoint[];
		} catch {
			return [];
		}
	}

	function listPortfolioValueHistory(days = 365): PortfolioValuePoint[] {
		const safeDays = Math.min(3650, Math.max(1, Math.trunc(days)));
		const from = localDayKey(Date.now() - safeDays * DAY_MS);
		try {
			return db
				.prepare(
					'SELECT day, value_usd, recorded_at FROM portfolio_value_history WHERE day >= ? ORDER BY day ASC'
				)
				.all(from) as unknown as PortfolioValuePoint[];
		} catch {
			return [];
		}
	}

	function cleanTicker(v: unknown): string | null {
		const t = String(v ?? '').trim().toUpperCase();
		return /^[A-Z0-9._-]{1,12}$/.test(t) ? t : null;
	}

	function cleanCurrency(v: unknown): string {
		const c = String(v ?? 'USD').trim().toUpperCase();
		return /^[A-Z]{3}$/.test(c) ? c : 'USD';
	}

	const HOLDING_CATEGORIES = ['btc', 'fii', 'cash'] as const;

	function cleanCategory(v: unknown, ticker: string): HoldingCategory {
		if (v === 'btc' || v === 'fii' || v === 'cash') return v;
		return ticker.toUpperCase() === 'BTC' ? 'btc' : 'fii';
	}

	function createHolding(
		ticker: string,
		amount: number,
		price?: number | null,
		currency?: string,
		category?: string,
		goal?: number | null,
		bank?: string,
		country?: string,
		avgPrice?: number | null
	): Holding | null {
		const a = Number(amount);
		const p = price === undefined || price === null ? null : Number(price);
		const g = goal === undefined || goal === null ? null : Number(goal);
		const avg = avgPrice === undefined || avgPrice === null ? null : Number(avgPrice);
		if (!Number.isFinite(a) || a < 0) return null;
		if (p !== null && (!Number.isFinite(p) || p < 0)) return null;
		if (g !== null && (!Number.isFinite(g) || g < 0)) return null;
		if (avg !== null && (!Number.isFinite(avg) || avg < 0)) return null;
		const cat = cleanCategory(category, String(ticker ?? ''));
		const t = cat === 'cash' ? bankTicker(bank ?? '') : cleanTicker(ticker);
		if (!t) return null;
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM holdings').get() as { m: number };
		const id = crypto.randomUUID();
		const now = Date.now();
		const c = cat === 'btc' ? 'USD' : cleanCurrency(currency);
		// Cash counts at face value; BTC takes the fetched price — both hide
		// the price field, so the stored price is derived, never typed.
		const storedPrice = cat === 'cash' ? 1 : cat === 'btc' ? null : p;
		const b = cat === 'cash' ? cleanBank(bank) : '';
		const co = cat === 'cash' ? cleanCountry(country) : '';
		// The opening row is the base quantity. Its price is the average cost
		// the user enters; it never becomes the live quote.
		const openingPrice = cat === 'cash' ? 1 : avg;
		db.transaction(() => {
			db.prepare(
				'INSERT INTO holdings (id, ticker, amount, price, price_auto, currency, category, goal, bank, country, position, created_at, updated_at, price_updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
			).run(id, t, a, storedPrice, c, cat, g, b, co, max.m + 1, now, now, storedPrice === null ? 0 : now);
			db.prepare(
				'INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			).run(crypto.randomUUID(), id, 'opening', a, openingPrice, c, now);
		});
		const { rates } = fxToUsd();
		snapshotHoldingValue(id, now);
		snapshotPortfolioValue(now);
		return rowToHolding(
			{ id, ticker: t, amount: a, price: storedPrice, price_auto: 0, currency: c, category: cat, goal: g, bank: b, country: co, position: max.m + 1, created_at: now, updated_at: now, price_updated_at: storedPrice === null ? 0 : now, previous_value: null, previous_value_at: 0 },
			rates,
			openingPrice
		);
	}

	function updateHolding(
		id: string,
		patch: { ticker?: string; amount?: number; price?: number | null; currency?: string; category?: string; goal?: number | null; bank?: string; country?: string; avgPrice?: number | null }
	): Holding | null {
		const current = db.prepare('SELECT * FROM holdings WHERE id = ?').get(id) as unknown as HoldingRow | undefined;
		if (!current) return null;
		const prevCategory = cleanCategory(current.category, current.ticker);
		const category = patch.category === undefined ? prevCategory : cleanCategory(patch.category, patch.ticker ?? current.ticker);
		const bank = patch.bank === undefined ? (current.bank ?? '') : cleanBank(patch.bank);
		const country = patch.country === undefined ? (current.country ?? '') : cleanCountry(patch.country);
		const ticker = category === 'cash' ? bankTicker(bank) : patch.ticker === undefined ? current.ticker : cleanTicker(patch.ticker);
		if (!ticker) return null;
		const amount = patch.amount === undefined ? current.amount : Number(patch.amount);
		if (!Number.isFinite(amount) || amount < 0) return null;
		const currency = category === 'btc' ? 'USD' : patch.currency === undefined ? current.currency : cleanCurrency(patch.currency);
		// A different ticker or category makes the stored quote meaningless:
		// drop it and re-arm auto mode so the next refresh fills the new one.
		// An explicit price still wins (API compatibility); cash never uses
		// one, and BTC always prices itself.
		const identityChanged = category !== prevCategory || ticker !== current.ticker;
		let price: number | null;
		if (category === 'cash') price = 1;
		else if (category === 'btc') price = identityChanged ? null : current.price;
		else if (patch.price !== undefined) price = patch.price === null ? null : Number(patch.price);
		else price = identityChanged ? null : current.price;
		if (price !== null && (!Number.isFinite(price) || price < 0)) return null;
		const goal = patch.goal === undefined ? current.goal : patch.goal === null ? null : Number(patch.goal);
		if (goal !== null && (!Number.isFinite(goal) || goal < 0)) return null;
		const priceAuto = category === 'cash' ? 0 : patch.price === undefined ? (identityChanged ? 1 : current.price_auto) : 0;
		// The average cost lives on the opening row. An API amount change
		// shifts that row by the same delta, so the ledger keeps summing to
		// the current total; the UI changes quantity through actions only.
		const avgProvided = patch.avgPrice !== undefined;
		const avg = avgProvided ? (category === 'cash' ? 1 : patch.avgPrice === null ? null : Number(patch.avgPrice)) : null;
		if (avg !== null && (!Number.isFinite(avg) || avg < 0)) return null;
		type OpeningRow = { id: string; amount: number; price: number | null };
		const opening = db
			.prepare("SELECT id, amount, price FROM holding_actions WHERE holding_id = ? AND kind = 'opening' ORDER BY created_at ASC, rowid ASC LIMIT 1")
			.get(id) as unknown as OpeningRow | undefined;
		const nextOpeningAmount = opening ? opening.amount + (amount - current.amount) : amount;
		if (nextOpeningAmount < 0) return null;
		const now = Date.now();
		// The date shown on the card means "price fetched or typed", so only a
		// real price change moves it — editing the amount must not fake it.
		const priceUpdatedAt = price === current.price ? current.price_updated_at ?? 0 : price === null ? 0 : now;
		db.transaction(() => {
			db.prepare(
				'UPDATE holdings SET ticker = ?, amount = ?, price = ?, price_auto = ?, currency = ?, category = ?, goal = ?, bank = ?, country = ?, updated_at = ?, price_updated_at = ? WHERE id = ?'
			).run(ticker, amount, price, priceAuto, currency, category, goal, bank, country, now, priceUpdatedAt, id);
			if (opening) {
				if (nextOpeningAmount !== opening.amount) {
					db.prepare('UPDATE holding_actions SET amount = ? WHERE id = ?').run(nextOpeningAmount, opening.id);
				}
				if (avgProvided) {
					db.prepare('UPDATE holding_actions SET price = ?, currency = ? WHERE id = ?').run(avg, currency, opening.id);
				}
			} else {
				db.prepare(
					'INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
				).run(crypto.randomUUID(), id, 'opening', amount, avgProvided ? avg : null, currency, current.created_at);
			}
		});
		const openingNow = db
			.prepare("SELECT price FROM holding_actions WHERE holding_id = ? AND kind = 'opening' LIMIT 1")
			.get(id) as unknown as { price: number | null } | undefined;
		const { rates } = fxToUsd();
		snapshotHoldingValue(id, now);
		snapshotPortfolioValue(now);
		return rowToHolding(
			{ ...current, ticker, amount, price, price_auto: priceAuto, currency, category, goal, bank, country, updated_at: now, price_updated_at: priceUpdatedAt },
			rates,
			openingNow?.price ?? null
		);
	}

	function deleteHolding(id: string): boolean {
		const deleted = db.transaction(() => {
			db.prepare('DELETE FROM holding_actions WHERE holding_id = ?').run(id);
			return db.prepare('DELETE FROM holdings WHERE id = ?').run(id).changes > 0;
		});
		if (deleted) snapshotPortfolioValue();
		return deleted;
	}

	function readHoldingActions(holdingId: string): HoldingAction[] {
		return db
			.prepare(
				'SELECT id, holding_id, kind, amount, price, currency, created_at FROM holding_actions WHERE holding_id = ? ORDER BY created_at DESC, rowid DESC'
			)
			.all(holdingId) as unknown as HoldingAction[];
	}

	// --- Stock items ----------------------------------------------------

	interface StockItemRow {
		id: string;
		kind: string;
		name: string;
		brand_name: string | null;
		category_name: string | null;
		category_parent: string | null;
		note: string;
		quantity: number;
		duration_days: number;
		package_size: number;
		package_unit: string;
		bought_at: number | null;
		price: number | null;
		currency: string;
		bought_where: string;
		ended_at: number | null;
		expires_at: number | null;
		has_photo: number;
		created_at: number;
		updated_at: number;
	}

	/** One-tap market refresh for the home Market card: forced holdings
	 *  refresh plus fresh quotes for every open trading ticker. Never
	 *  throws: a dead network returns cached data with the error noted. */
	async function refreshMarket(): Promise<{
		summary: HoldingsSummary;
		tickers: string[];
		errors: string[];
		quotes: { ticker: string; ok: boolean; source: string | null; price: number | null; error: string | null }[];
		ripio: { pair: string; priceUsd: number; fetchedAt: number; cached: boolean } | null;
	}> {
		const errors: string[] = [];
		let summary: HoldingsSummary;
		try {
			summary = await refreshRates(true);
		} catch (e) {
			errors.push((e as Error)?.message ?? 'holdings refresh failed');
			summary = getHoldingsSummary();
		}
		const tickers = [
			...new Set(
				listTradingOrgs()
					.filter((o) => o.enabled)
					.flatMap((o) => listTradingOrders(o.id).map((t) => t.ticker))
			)
		];
		let quotes: { ticker: string; ok: boolean; source: string | null; price: number | null; error: string | null }[] = [];
		try {
			quotes = await refreshTradingQuotes(tickers);
			for (const q of quotes) {
				if (!q.ok) errors.push(`${q.ticker}: ${q.error ?? 'no quote'}`);
			}
		} catch (e) {
			errors.push((e as Error)?.message ?? 'trading quotes failed');
		}
		let ripio: { pair: string; priceUsd: number; fetchedAt: number; cached: boolean } | null = null;
		try {
			const r = await getRipioQuote('BTC_USDC');
			if (!('error' in r)) ripio = { pair: r.pair, priceUsd: r.priceUsd, fetchedAt: r.fetchedAt, cached: r.cached };
		} catch {
			// The Ripio quote never fails the market refresh.
		}
		return { summary, tickers, errors, quotes, ripio };
	}

	function cleanStockKind(v: unknown): StockKind {
		return v === 'durable' ? 'durable' : 'consumable';
	}

	const rowToStockItem = (r: StockItemRow, photos: StockItemPhoto[] = []): StockItem => ({
		id: r.id,
		kind: cleanStockKind(r.kind),
		name: r.name,
		brand: r.brand_name ?? '',
		category: r.category_name ?? '',
		group: r.category_parent ?? '',
		note: r.note ?? '',
		quantity: Number(r.quantity ?? 0),
		duration_days: Number(r.duration_days ?? 0),
		package_size: Number(r.package_size ?? 0),
		package_unit: r.package_unit ?? 'g',
		bought_at: r.bought_at ?? null,
		expires_at: r.expires_at ?? null,
		price: r.price ?? null,
		currency: r.currency ?? 'BRL',
		bought_where: r.bought_where ?? '',
		ended_at: r.ended_at ?? null,
		hasPhoto: photos.length > 0,
		photos,
		created_at: r.created_at,
		updated_at: r.updated_at
	});

	/** Registry names are display text with a normalized unique key. */
	function cleanRegistryName(raw: unknown): { name: string; key: string } | null {
		const name = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
		if (!name) return null;
		return { name, key: name.normalize('NFC').toLowerCase() };
	}

	function ensureStockRegistry(kind: 'brand' | 'category', raw: unknown): string | null {
		const clean = cleanRegistryName(raw);
		if (!clean) return null;
		try {
			const existing = db
				.prepare('SELECT id FROM stock_registries WHERE kind = ? AND name_key = ?')
				.get(kind, clean.key) as unknown as { id: string } | undefined;
			if (existing) return existing.id;
			const id = crypto.randomUUID();
			db.prepare(
				'INSERT INTO stock_registries (id, kind, name, name_key, created_at) VALUES (?, ?, ?, ?, ?)'
			).run(id, kind, clean.name, clean.key, Date.now());
			return id;
		} catch {
			return null;
		}
	}

	function listStockRegistries(): { brands: string[]; categories: string[]; groups: string[] } {
		try {
			const rows = db
				.prepare('SELECT kind, name, parent FROM stock_registries ORDER BY name COLLATE NOCASE ASC, name ASC')
				.all() as unknown as { kind: string; name: string; parent: string | null }[];
			return {
				brands: rows.filter((r) => r.kind === 'brand').map((r) => r.name),
				categories: rows.filter((r) => r.kind === 'category').map((r) => r.name),
				groups: [
					...new Set(
						rows
							.filter((r) => r.kind === 'category')
							.map((r) => (r.parent ?? '').trim())
							.filter(Boolean)
					)
				].sort((a, b) => a.localeCompare(b))
			};
		} catch {
			// Table arrives with migration 13.
			return { brands: [], categories: [], groups: [] };
		}
	}

	// --- Category groups ------------------------------------------------
	// Groups are labels on category rows; every item in the category inherits
	// one. No separate table: `stock_registries.parent` is the source.

	function deleteStockGroup(raw: unknown): { group: string; cleared: number } | null {
		const group = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
		if (!group) return null;
		try {
			const result = db
				.prepare("UPDATE stock_registries SET parent = '' WHERE kind = 'category' AND parent = ?")
				.run(group);
			return { group, cleared: result.changes };
		} catch {
			return null;
		}
	}

	function listShoppingExtras(): { id: string; text: string }[] {
		try {
			return db
				.prepare('SELECT id, text FROM shopping_extras ORDER BY position ASC, created_at ASC, id ASC')
				.all() as unknown as { id: string; text: string }[];
		} catch {
			return [];
		}
	}

	function addShoppingExtra(raw: unknown): { id: string; text: string } | null {
		const text = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
		if (!text) return null;
		try {
			const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM shopping_extras').get() as {
				m: number;
			};
			const id = crypto.randomUUID();
			db.prepare('INSERT INTO shopping_extras (id, text, position, created_at) VALUES (?, ?, ?, ?)').run(
				id,
				text,
				max.m + 1,
				Date.now()
			);
			return { id, text };
		} catch {
			return null;
		}
	}

	function removeShoppingExtra(id: string): boolean {
		try {
			return db.prepare('DELETE FROM shopping_extras WHERE id = ?').run(id).changes > 0;
		} catch {
			return false;
		}
	}

	// --- B3 ticker universe -------------------------------------------------
	// Liquid names seeded by migration 24; a future admin adds custom rows.
	// Read through a 24-hour in-memory cache: the DB stays the source of
	// truth, but the picker never pays for the same query twice a day.
	let b3TickerCache: { at: number; tickers: string[] } | null = null;

	function listB3Tickers(): string[] {
		const now = Date.now();
		if (b3TickerCache && now - b3TickerCache.at < 24 * 60 * 60 * 1000) return b3TickerCache.tickers;
		try {
			const rows = db.prepare('SELECT ticker FROM b3_tickers ORDER BY ticker ASC').all() as unknown as {
				ticker: string;
			}[];
			b3TickerCache = { at: now, tickers: rows.map((r) => r.ticker) };
			return b3TickerCache.tickers;
		} catch {
			return b3TickerCache?.tickers ?? [];
		}
	}

	function addB3Ticker(raw: unknown): { ticker: string } | { error: string } {
		const ticker = String(raw ?? '').trim().toUpperCase().slice(0, 12);
		if (!isB3(ticker)) return { error: 'not a B3 ticker' };
		try {
			db.prepare("INSERT OR IGNORE INTO b3_tickers (ticker, source, created_at) VALUES (?, 'custom', ?)").run(
				ticker,
				Date.now()
			);
			b3TickerCache = null;
			return { ticker };
		} catch {
			return { error: 'could not save the ticker' };
		}
	}

	// --- Swing trading summary ----------------------------------------------
	// Orders are raw events: buys add to the open ticker position, a sale
	// always closes the whole position. Positions, profits and the monthly
	// panel all derive from the order list, so nothing else is stored.

	type TradingOrgRow = {
		id: string;
		name: string;
		enabled: number;
		fee_rate: number;
		spread_rate: number;
		irrf_rate: number;
		fixed_fee: number;
		fee_note: string;
		exempt_limit: number;
		position: number;
		created_at: number;
	};

	type TradingOrderRow = {
		id: string;
		org_id: string;
		ticker: string;
		side: string;
		qty: number;
		unit_price: number;
		value: number;
		fees: number;
		irrf: number;
		net: number;
		fee_rate: number;
		spread_rate: number;
		irrf_rate: number;
		fixed_fee: number;
		date: number;
		month: string;
		created_at: number;
	};

	function tradingMonthKey(date: number): string {
		const d = new Date(date);
		return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
	}

	function monthKeyToDate(key: string): number {
		const m = /^(\d{2})\/(\d{4})$/.exec(key);
		if (!m) return 0;
		return new Date(Number(m[2]), Number(m[1]) - 1, 1).getTime();
	}

	function rowToTradingOrg(r: TradingOrgRow): TradingOrg {
		return {
			id: r.id,
			name: r.name,
			enabled: r.enabled === 1,
			feeRate: r.fee_rate ?? 0,
			spreadRate: r.spread_rate ?? 0,
			irrfRate: r.irrf_rate ?? 0,
			fixedFee: r.fixed_fee ?? 0,
			feeNote: r.fee_note ?? '',
			exemptLimit: r.exempt_limit ?? 20000,
			position: r.position ?? 0,
			created_at: r.created_at ?? 0
		};
	}

	function getTradingOrg(id: string): TradingOrg | null {
		try {
			const row = db.prepare('SELECT * FROM trading_orgs WHERE id = ?').get(id) as unknown as TradingOrgRow | undefined;
			return row ? rowToTradingOrg(row) : null;
		} catch {
			return null;
		}
	}

	function listTradingOrgs(): TradingOrg[] {
		try {
			const rows = db.prepare('SELECT * FROM trading_orgs ORDER BY position ASC, id ASC').all() as unknown as TradingOrgRow[];
			return rows.map(rowToTradingOrg);
		} catch {
			return [];
		}
	}

	function updateTradingOrg(
		id: string,
		patch: {
			feeRate?: unknown;
			spreadRate?: unknown;
			irrfRate?: unknown;
			fixedFee?: unknown;
			feeNote?: unknown;
			exemptLimit?: unknown;
			enabled?: unknown;
		}
	): TradingOrg | null {
		const org = getTradingOrg(id);
		if (!org) return null;
		// The enabled flag is the one thing a disabled venue accepts, so a
		// venue can be previewed and switched off again without a migration.
		let enabled = org.enabled;
		if (patch.enabled !== undefined) {
			const raw = patch.enabled;
			if (raw === true || raw === 1 || raw === 'true' || raw === '1') enabled = true;
			else if (raw === false || raw === 0 || raw === 'false' || raw === '0') enabled = false;
			else return null;
		}
		if (!org.enabled && !enabled) return null;
		const num = (v: unknown): number | null => {
			if (v === undefined) return null;
			const n = Number(v);
			return Number.isFinite(n) && n >= 0 ? n : NaN;
		};
		const feeRate = patch.feeRate === undefined ? org.feeRate : num(patch.feeRate);
		const spreadRate = patch.spreadRate === undefined ? org.spreadRate : num(patch.spreadRate);
		const irrfRate = patch.irrfRate === undefined ? org.irrfRate : num(patch.irrfRate);
		const fixedFee = patch.fixedFee === undefined ? org.fixedFee : num(patch.fixedFee);
		const feeNote = patch.feeNote === undefined ? org.feeNote : String(patch.feeNote ?? '').trim().slice(0, 160);
		const exemptLimit = patch.exemptLimit === undefined ? org.exemptLimit : num(patch.exemptLimit);
		if (feeRate === null || Number.isNaN(feeRate as number)) return null;
		if (spreadRate === null || Number.isNaN(spreadRate as number)) return null;
		if (irrfRate === null || Number.isNaN(irrfRate as number)) return null;
		if (fixedFee === null || Number.isNaN(fixedFee as number)) return null;
		if (exemptLimit === null || Number.isNaN(exemptLimit as number)) return null;
		if ((feeRate as number) > 0.1 || (spreadRate as number) > 0.1 || (irrfRate as number) > 0.1) return null;
		try {
			db.prepare('UPDATE trading_orgs SET fee_rate = ?, spread_rate = ?, irrf_rate = ?, fixed_fee = ?, fee_note = ?, exempt_limit = ?, enabled = ? WHERE id = ?').run(
				feeRate as number,
				spreadRate as number,
				irrfRate as number,
				fixedFee as number,
				feeNote,
				exemptLimit as number,
				enabled ? 1 : 0,
				id
			);
			return getTradingOrg(id);
		} catch {
			return null;
		}
	}

	function listTradingOrders(orgId: string): TradingOrder[] {
		try {
			const rows = db
				.prepare('SELECT * FROM trading_orders WHERE org_id = ? ORDER BY date ASC, created_at ASC, id ASC')
				.all(orgId) as unknown as TradingOrderRow[];
			return rows.map((r) => ({
				id: r.id,
				orgId: r.org_id,
				ticker: r.ticker,
				side: r.side === 'SELL' ? 'SELL' : 'BUY',
				qty: r.qty,
				unitPrice: r.unit_price,
				value: r.value,
				fees: r.fees ?? 0,
				irrf: r.irrf ?? 0,
				net: r.net,
				feeRate: r.fee_rate ?? 0,
				spreadRate: r.spread_rate ?? 0,
				irrfRate: r.irrf_rate ?? 0,
				fixedFee: r.fixed_fee ?? 0,
				date: r.date,
				month: r.month,
				created_at: r.created_at
			}));
		} catch {
			return [];
		}
	}

	/** Open quantities and cost basis per ticker, replaying the diary in
	 *  order. A sale always empties its ticker, so at most one open group
	 *  exists per ticker. `since` is the earliest open buy: selling while it
	 *  is today is a day trade, not a swing trade. */
	type OpenPosition = {
		qty: number;
		cost: number;
		value: number;
		since: number;
		/** Each buy's rate times its net, summed: divided by `cost` it gives
		 *  the rate the position's goal is priced with. */
		feeWeight: number;
		spreadWeight: number;
		irrfWeight: number;
		/** One sale pays one fixed fee, so the largest buy rule wins. */
		fixed: number;
	};

	function openTradingPositions(orders: TradingOrder[]): Map<string, OpenPosition> {
		const open = new Map<string, OpenPosition>();
		for (const o of orders) {
			const cur =
				open.get(o.ticker) ?? { qty: 0, cost: 0, value: 0, since: o.date, feeWeight: 0, spreadWeight: 0, irrfWeight: 0, fixed: 0 };
			if (o.side === 'BUY') {
				cur.qty += o.qty;
				cur.cost += o.net;
				cur.value += o.value;
				cur.feeWeight += o.net * o.feeRate;
				cur.spreadWeight += o.net * o.spreadRate;
				cur.irrfWeight += o.net * o.irrfRate;
				cur.fixed = Math.max(cur.fixed, o.fixedFee);
				if (o.date < cur.since) cur.since = o.date;
				open.set(o.ticker, cur);
			} else if (cur.qty > 0) {
				open.delete(o.ticker);
			}
		}
		return open;
	}

	/** The rate the position's goal is priced with: the open buys' own rules,
	 *  weighted by net. A fee edit in Fees applies to new buys only. */
	function goalRules(pos: { cost: number; feeWeight: number; spreadWeight: number; irrfWeight: number; fixed: number }): {
		feeRate: number;
		spreadRate: number;
		irrfRate: number;
		fixedFee: number;
	} {
		const base = pos.cost > 0 ? pos.cost : 1;
		return {
			feeRate: pos.feeWeight / base,
			spreadRate: pos.spreadWeight / base,
			irrfRate: pos.irrfWeight / base,
			fixedFee: pos.fixed
		};
	}

	function createTradingOrder(input: {
		orgId?: unknown;
		ticker?: unknown;
		side?: unknown;
		qty?: unknown;
		unitPrice?: unknown;
		date?: unknown;
		/** Goal for this buy, as a fraction (0.03 = 3%). */
		targetPct?: unknown;
	}): TradingOrder | { error: string } {
		const org = getTradingOrg(String(input.orgId ?? ''));
		if (!org || !org.enabled) return { error: 'unknown or disabled organization' };
		const ticker = String(input.ticker ?? '').trim().toUpperCase().slice(0, 12);
		if (!/^[A-Z0-9._-]{1,12}$/.test(ticker)) return { error: 'ticker is required' };
		const side = String(input.side ?? '').toUpperCase() === 'SELL' ? 'SELL' : String(input.side ?? '').toUpperCase() === 'BUY' ? 'BUY' : null;
		if (!side) return { error: 'side must be BUY or SELL' };
		const qty = Number(input.qty);
		const unitPrice = Number(input.unitPrice);
		if (!Number.isFinite(qty) || qty <= 0) return { error: 'quantity must be > 0' };
		if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: 'unit price must be > 0' };
		const date = Number(input.date);
		const at = Number.isFinite(date) && date > 0 ? Math.min(date, Date.now()) : Date.now();
		// The goal belongs to the buy that sets it: a later buy of the same
		// ticker overwrites it, and a sale does not touch it.
		const rawTarget = input.targetPct === undefined || input.targetPct === null ? NaN : Number(input.targetPct);
		const targetPct = Number.isFinite(rawTarget) && rawTarget >= 0 && rawTarget <= 10 ? rawTarget : null;
		if (side === 'BUY' && input.targetPct !== undefined && targetPct === null) return { error: 'goal must be between 0 and 1000%' };
		const open = openTradingPositions(listTradingOrders(org.id)).get(ticker) ?? { qty: 0, cost: 0, value: 0 };
		if (side === 'SELL') {
			// Full-position sales only: the diary never holds a remainder.
			if (open.qty <= 0) return { error: 'no open position in this ticker' };
			if (Math.abs(qty - open.qty) > 1e-9) return { error: `a sale must close the full position (${open.qty})` };
		}
		const value = qty * unitPrice;
		const fees = value * org.feeRate + org.fixedFee;
		const irrf = side === 'SELL' ? value * org.irrfRate : 0;
		const net = side === 'BUY' ? value + fees : value - fees - irrf;
		try {
			const id = crypto.randomUUID();
			// The four rates travel with the row: a later fee edit belongs to
			// future orders, never to this one.
			db.prepare(
				'INSERT INTO trading_orders (id, org_id, ticker, side, qty, unit_price, value, fees, irrf, net, fee_rate, spread_rate, irrf_rate, fixed_fee, date, month, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
			).run(
				id, org.id, ticker, side, qty, unitPrice, value, fees, irrf, net,
				org.feeRate, org.spreadRate, org.irrfRate, org.fixedFee,
				at, tradingMonthKey(at), Date.now()
			);
			if (side === 'BUY' && targetPct !== null) {
				db.prepare(
					'INSERT INTO trading_targets (org_id, ticker, target_pct, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (org_id, ticker) DO UPDATE SET target_pct = excluded.target_pct, updated_at = excluded.updated_at'
				).run(org.id, ticker, targetPct, Date.now());
			}
			const row = db.prepare('SELECT * FROM trading_orders WHERE id = ?').get(id) as unknown as TradingOrderRow;
			return {
				id: row.id,
				orgId: row.org_id,
				ticker: row.ticker,
				side: row.side === 'SELL' ? 'SELL' : 'BUY',
				qty: row.qty,
				unitPrice: row.unit_price,
				value: row.value,
				fees: row.fees ?? 0,
				irrf: row.irrf ?? 0,
				net: row.net,
				feeRate: row.fee_rate ?? 0,
				spreadRate: row.spread_rate ?? 0,
				irrfRate: row.irrf_rate ?? 0,
				fixedFee: row.fixed_fee ?? 0,
				date: row.date,
				month: row.month,
				created_at: row.created_at
			};
		} catch {
			return { error: 'could not save the order' };
		}
	}

	/** Correct the latest order of its venue. Earlier rows are the cost basis
	 *  of later sales, so a rewrite would change history: the rule that guards
	 *  delete guards edit too. Value, fees, net and month come from the venue's
	 *  current cost rules, never from the client. The ticker stays put, because
	 *  a rename would orphan the goal stored under that ticker. */
	function updateTradingOrder(
		id: string,
		input: { qty?: unknown; unitPrice?: unknown; date?: unknown; targetPct?: unknown }
	): TradingOrder | { error: string } {
		let row: TradingOrderRow | undefined;
		try {
			row = db.prepare('SELECT * FROM trading_orders WHERE id = ?').get(String(id)) as unknown as TradingOrderRow | undefined;
		} catch {
			return { error: 'could not read the order' };
		}
		if (!row) return { error: 'order not found' };
		const latest = db
			.prepare('SELECT id FROM trading_orders WHERE org_id = ? ORDER BY date DESC, created_at DESC, id DESC LIMIT 1')
			.get(row.org_id) as unknown as { id: string } | undefined;
		if (!latest || latest.id !== row.id) return { error: 'only the latest order can be edited' };
		const org = getTradingOrg(row.org_id);
		if (!org || !org.enabled) return { error: 'unknown or disabled organization' };
		const side = row.side === 'SELL' ? 'SELL' : 'BUY';
		const qty = input.qty === undefined ? row.qty : Number(input.qty);
		const unitPrice = input.unitPrice === undefined ? row.unit_price : Number(input.unitPrice);
		if (!Number.isFinite(qty) || qty <= 0) return { error: 'quantity must be > 0' };
		if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: 'unit price must be > 0' };
		const rawDate = Number(input.date);
		const at = Number.isFinite(rawDate) && rawDate > 0 ? Math.min(rawDate, Date.now()) : row.date;
		const rawTarget = input.targetPct === undefined || input.targetPct === null ? NaN : Number(input.targetPct);
		const targetPct = Number.isFinite(rawTarget) && rawTarget >= 0 && rawTarget <= 10 ? rawTarget : null;
		if (side === 'BUY' && input.targetPct !== undefined && targetPct === null) return { error: 'goal must be between 0 and 1000%' };
		// The date keeps its place in the replay: moving the row behind an
		// order that already ran would leave a sale without its cost basis.
		const previous = db
			.prepare('SELECT MAX(date) AS at FROM trading_orders WHERE org_id = ? AND id != ?')
			.get(org.id, row.id) as unknown as { at: number | null };
		if (previous.at !== null && at < previous.at) return { error: 'the date cannot be earlier than the previous order' };
		if (side === 'SELL') {
			// A sale always closes the whole position, now against the other.
			const others = listTradingOrders(org.id).filter((o) => o.id !== row.id);
			const open = openTradingPositions(others).get(row.ticker) ?? { qty: 0 };
			if (!(open.qty > 0)) return { error: 'no open position in this ticker' };
			if (Math.abs(qty - open.qty) > 1e-9) return { error: `a sale must close the full position (${open.qty})` };
		}
		// Recompute with the rates this order was recorded with, not with the
		// venue's current rules: a fee edit must leave past money alone.
		const rules = { feeRate: row.fee_rate ?? 0, spreadRate: row.spread_rate ?? 0, irrfRate: row.irrf_rate ?? 0, fixedFee: row.fixed_fee ?? 0 };
		const value = qty * unitPrice;
		const fees = value * rules.feeRate + rules.fixedFee;
		const irrf = side === 'SELL' ? value * rules.irrfRate : 0;
		const net = side === 'BUY' ? value + fees : value - fees - irrf;
		try {
			db.prepare(
				'UPDATE trading_orders SET qty = ?, unit_price = ?, value = ?, fees = ?, irrf = ?, net = ?, date = ?, month = ? WHERE id = ?'
			).run(qty, unitPrice, value, fees, irrf, net, at, tradingMonthKey(at), row.id);
			if (side === 'BUY' && targetPct !== null) {
				db.prepare(
					'INSERT INTO trading_targets (org_id, ticker, target_pct, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (org_id, ticker) DO UPDATE SET target_pct = excluded.target_pct, updated_at = excluded.updated_at'
				).run(org.id, row.ticker, targetPct, Date.now());
			}
			const fresh = db.prepare('SELECT * FROM trading_orders WHERE id = ?').get(row.id) as unknown as TradingOrderRow;
			return {
				id: fresh.id,
				orgId: fresh.org_id,
				ticker: fresh.ticker,
				side: fresh.side === 'SELL' ? 'SELL' : 'BUY',
				qty: fresh.qty,
				unitPrice: fresh.unit_price,
				value: fresh.value,
				fees: fresh.fees ?? 0,
				irrf: fresh.irrf ?? 0,
				net: fresh.net,
				feeRate: fresh.fee_rate ?? 0,
				spreadRate: fresh.spread_rate ?? 0,
				irrfRate: fresh.irrf_rate ?? 0,
				fixedFee: fresh.fixed_fee ?? 0,
				date: fresh.date,
				month: fresh.month,
				created_at: fresh.created_at
			};
		} catch {
			return { error: 'could not save the order' };
		}
	}

	/** Only the latest order of an org can go: earlier rows are the cost
	 *  basis of later sales, so removing them would rewrite history. */
	function deleteTradingOrder(id: string): { ok: true } | { error: string } {
		try {
			const row = db.prepare('SELECT * FROM trading_orders WHERE id = ?').get(String(id)) as unknown as TradingOrderRow | undefined;
			if (!row) return { error: 'order not found' };
			const latest = db
				.prepare('SELECT id FROM trading_orders WHERE org_id = ? ORDER BY date DESC, created_at DESC, id DESC LIMIT 1')
				.get(row.org_id) as unknown as { id: string } | undefined;
			if (!latest || latest.id !== row.id) return { error: 'only the latest order can be removed' };
			db.prepare('DELETE FROM trading_orders WHERE id = ?').run(row.id);
			return { ok: true };
		} catch {
			return { error: 'could not delete the order' };
		}
	}

	function setTradingTarget(orgId: string, ticker: string, targetPct: unknown): { ticker: string; targetPct: number } | null {
		const org = getTradingOrg(String(orgId ?? ''));
		const t = String(ticker ?? '').trim().toUpperCase().slice(0, 12);
		const pct = Number(targetPct);
		if (!org || !org.enabled || !/^[A-Z0-9._-]{1,12}$/.test(t)) return null;
		if (!Number.isFinite(pct) || pct < 0 || pct > 10) return null;
		try {
			db.prepare(
				'INSERT INTO trading_targets (org_id, ticker, target_pct, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (org_id, ticker) DO UPDATE SET target_pct = excluded.target_pct, updated_at = excluded.updated_at'
			).run(org.id, t, pct, Date.now());
			return { ticker: t, targetPct: pct };
		} catch {
			return null;
		}
	}

	function getStoredTradingQuote(ticker: string): { price: number; previousClose: number | null; source: string; fetchedAt: number } | null {
		try {
			const row = db.prepare('SELECT * FROM trading_quotes WHERE ticker = ?').get(ticker.toUpperCase()) as unknown as
				| { price: number; previous_close: number | null; source: string; fetched_at: number }
				| undefined;
			if (!row) return null;
			return { price: row.price, previousClose: row.previous_close ?? null, source: row.source ?? '', fetchedAt: row.fetched_at ?? 0 };
		} catch {
			return null;
		}
	}

	/** Store one quote for the monitor: the current price plus the day's
	 *  point. Best effort, because the tables arrive with migrations 23/25. */
	function storeTradingQuote(
		ticker: string,
		price: number,
		previousClose: number | null,
		source: string,
		now = Date.now()
	): void {
		try {
			db.prepare(
				'INSERT INTO trading_quotes (ticker, price, previous_close, source, fetched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (ticker) DO UPDATE SET price = excluded.price, previous_close = excluded.previous_close, source = excluded.source, fetched_at = excluded.fetched_at'
			).run(ticker, price, previousClose, source, now);
			db.prepare(
				'INSERT INTO trading_quote_history (ticker, day, price, source, recorded_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (ticker, day) DO UPDATE SET price = excluded.price, source = excluded.source, recorded_at = excluded.recorded_at'
			).run(ticker, localDayKey(now), price, source, now);
		} catch {
			// Tables arrive with migration 23/25.
		}
	}

	/** Fresh B3 quotes for the given tickers through the shared quote path,
	 *  stored for the monitor. Staggered like the holdings refresh. Reports
	 *  per ticker, so a silent no-op refresh is impossible: a failed ticker
	 *  comes back with its error instead of vanishing. */
	async function refreshTradingQuotes(
		tickers: string[],
		force = false
	): Promise<{ ticker: string; ok: boolean; source: string | null; price: number | null; error: string | null }[]> {
		const all = [...new Set(tickers.map((t) => t.toUpperCase()))];
		const unique = all.filter((t) => isB3(t));
		// Ripio venue tickers are pairs (BASE_QUOTE): they quote through the
		// signed/public Ripio path and store USD, like the venue itself.
		const pairs = all.filter((t) => !isB3(t) && /^[A-Z0-9]{2,10}_[A-Z0-9]{2,10}$/.test(t));
		const out: { ticker: string; ok: boolean; source: string | null; price: number | null; error: string | null }[] = [];
		for (const p of pairs) {
			const q = await getRipioQuote(p, force);
			if ('priceUsd' in q) {
				const source = q.live ? 'ripio-market' : 'ripio';
				storeTradingQuote(p, q.priceUsd, null, source);
				out.push({ ticker: p, ok: true, source, price: q.priceUsd, error: null });
			} else {
				out.push({ ticker: p, ok: false, source: null, price: null, error: q.error });
			}
		}
		for (let i = 0; i < unique.length; i++) {
			if (i > 0) await new Promise((r) => setTimeout(r, 500));
			const t = unique[i]!;
			const quote = await fetchB3Quote(t);
			if (quote) {
				storeTradingQuote(t, quote.price, quote.previousClose, quote.source);
				out.push({ ticker: t, ok: true, source: quote.source, price: quote.price, error: null });
			} else {
				out.push({ ticker: t, ok: false, source: null, price: null, error: 'no quote from Google or Fundamentus' });
			}
		}
		return out;
	}

	/** One ticker, one network fetch, both surfaces: update its auto-priced
	 *  holdings rows and its trading quote, then snapshot. Cash and a
	 *  hand-priced holding (`price_auto = 0`) are never touched, so a single
	 *  refresh cannot overwrite a manual value. This path is separate from
	 *  `refreshMarket`: the global updater keeps its own multi-ticker run. */
	async function refreshTickerQuote(tickerRaw: string): Promise<{
		ticker: string;
		ok: boolean;
		price: number | null;
		previousClose: number | null;
		source: string | null;
		error: string | null;
		summary: HoldingsSummary;
	}> {
		const ticker = String(tickerRaw ?? '').trim().toUpperCase();
		const fail = (error: string) => ({
			ticker,
			ok: false,
			price: null,
			previousClose: null,
			source: null,
			error,
			summary: getHoldingsSummary()
		});
		if (!ticker) return fail('ticker required');
		let quote: { price: number; previousClose: number | null; source: string } | null = null;
		try {
			if (ticker === 'BTC') {
				const q = await getGlobalBtcQuote(true);
				if ('error' in q) return fail(q.error);
				quote = { price: q.priceUsd, previousClose: null, source: 'coinbase' };
			} else if (isB3(ticker)) {
				quote = await fetchB3Quote(ticker);
				if (!quote) return fail('no quote from Google or Fundamentus');
			} else if (/^[A-Z0-9]{2,10}_[A-Z0-9]{2,10}$/.test(ticker)) {
				const q = await getRipioQuote(ticker, true);
				if ('error' in q) return fail(q.error);
				quote = { price: q.priceUsd, previousClose: null, source: q.live ? 'ripio-market' : 'ripio' };
			} else {
				const price = await fetchQuote(yahooSymbol(ticker));
				if (price === null) {
					logQuoteFetch({ ticker, source: 'yahoo', ok: false, error: 'no quote' });
					return fail('no quote from Yahoo');
				}
				logQuoteFetch({ ticker, source: 'yahoo', ok: true, price });
				quote = { price, previousClose: null, source: 'yahoo' };
			}
		} catch (e) {
			return fail((e as Error)?.message ?? 'network');
		}
		const q = quote;
		if (!q) return fail('no quote');
		// Holdings: auto-priced rows only. A manual price stays manual.
		const rows = db
			.prepare("SELECT id FROM holdings WHERE UPPER(ticker) = ? AND category != 'cash' AND price_auto = 1")
			.all(ticker) as unknown as { id: string }[];
		if (rows.length > 0) {
			const at = Date.now();
			const upd = db.prepare(
				'UPDATE holdings SET price = ?, price_auto = 1, updated_at = ?, price_updated_at = ? WHERE id = ?'
			);
			db.transaction(() => {
				for (const r of rows) upd.run(q.price, at, at, r.id);
			});
			if (ticker === 'BTC') logQuoteFetch({ ticker: 'BTC', source: 'coinbase', ok: true, price: q.price });
		}
		storeTradingQuote(ticker, q.price, q.previousClose, q.source);
		snapshotAllValues();
		return {
			ticker,
			ok: true,
			price: q.price,
			previousClose: q.previousClose,
			source: q.source,
			error: null,
			summary: getHoldingsSummary()
		};
	}

	/** Net cash of selling `qty` units at `quote` right now: the quote
	 *  value minus the venue's spread, sell fee, dedo-duro and fixed fee.
	 *  Null without a usable quote. */
	function saleNet(
		qty: number,
		quote: number | null,
		org: { feeRate: number; spreadRate: number; irrfRate: number; fixedFee: number }
	): number | null {
		return saleBreakdown(qty, quote, org)?.net ?? null;
	}

	/** Itemized sell costs behind the net value, with their configured rates. */
	function saleBreakdown(
		qty: number,
		quote: number | null,
		org: { feeRate: number; spreadRate: number; irrfRate: number; fixedFee: number }
	): {
		net: number;
		fee: number;
		spread: number;
		irrf: number;
		fixed: number;
		feeRatePct: number;
		spreadRatePct: number;
		irrfRatePct: number;
	} | null {
		if (quote === null || !Number.isFinite(quote) || quote <= 0 || !(qty > 0)) return null;
		const value = qty * quote;
		const fee = value * org.feeRate;
		const spread = value * org.spreadRate;
		const irrf = value * org.irrfRate;
		const fixed = org.fixedFee;
		const net = value - fee - spread - irrf - fixed;
		if (!Number.isFinite(net)) return null;
		return {
			net,
			fee,
			spread,
			irrf,
			fixed,
			feeRatePct: org.feeRate * 100,
			spreadRatePct: org.spreadRate * 100,
			irrfRatePct: org.irrfRate * 100
		};
	}

	/** Forward-looking swing estimate for one open position, using the
	 *  venue's current rules: a sale pays fees, dedo-duro and the fixed
	 *  fee again, so the target compares against the net profit, not the
	 *  gross price move. Null without a usable quote or cost basis. */
	function positionPotential(
		qty: number,
		cost: number,
		quote: number | null,
		org: { feeRate: number; spreadRate: number; irrfRate: number; fixedFee: number }
	): number | null {
		if (quote === null || !Number.isFinite(quote) || quote <= 0 || cost <= 0) return null;
		const net = saleNet(qty, quote, org);
		if (net === null) return null;
		return ((net - cost) / cost) * 100;
	}	/** Unit sell price whose net clears the target: `qty × P` minus the
	 *  spread, sell fees, dedo-duro and the fixed fee must equal
	 *  `cost × (1 + target)`. Null without a usable position or a
	 *  degenerate fee config. */
	function targetSellPrice(
		qty: number,
		cost: number,
		targetPct: number,
		org: { feeRate: number; spreadRate: number; irrfRate: number; fixedFee: number }
	): number | null {
		const rate = 1 - org.feeRate - org.spreadRate - org.irrfRate;
		if (!(qty > 0) || !(cost > 0) || !(rate > 0)) return null;
		const price = (cost * (1 + targetPct) + org.fixedFee) / (qty * rate);
		return Number.isFinite(price) && price > 0 ? price : null;
	}

	/** Full panel for one org: diary with sale profits, open positions with
	 *  live quotes, and the rolling monthly exemption panel. */
	function getTradingSummary(orgId: string): TradingSummary | null {
		const org = getTradingOrg(String(orgId ?? ''));
		if (!org) return null;
		const orders = listTradingOrders(org.id);
		let targets: Record<string, number> = {};
		try {
			const rows = db.prepare('SELECT ticker, target_pct FROM trading_targets WHERE org_id = ?').all(org.id) as unknown as {
				ticker: string;
				target_pct: number;
			}[];
			for (const r of rows) targets[r.ticker] = r.target_pct;
		} catch {
			targets = {};
		}
		// Diary: replay in order, attaching each sale its profit over the
		// open cost basis before the position closes.
		const diary: TradingDiaryLine[] = [];
		const open = new Map<string, OpenPosition>();
		for (const o of orders) {
			const cur: OpenPosition =
				open.get(o.ticker) ?? { qty: 0, cost: 0, value: 0, since: o.date, feeWeight: 0, spreadWeight: 0, irrfWeight: 0, fixed: 0 };
			if (o.side === 'BUY') {
				cur.qty += o.qty;
				cur.cost += o.net;
				cur.value += o.value;
				cur.feeWeight += o.net * o.feeRate;
				cur.spreadWeight += o.net * o.spreadRate;
				cur.irrfWeight += o.net * o.irrfRate;
				cur.fixed = Math.max(cur.fixed, o.fixedFee);
				if (o.date < cur.since) cur.since = o.date;
				open.set(o.ticker, cur);
				// A buy carries the goal it was recorded with, so the diary can
				// name the price that goal asks for and the net it yields.
				const targetPct = targets[o.ticker] ?? 0.03;
				diary.push({
					...o,
					profit: null,
					profitPct: null,
					targetPct,
					goalPrice: targetSellPrice(o.qty, o.net, targetPct, o),
					netAtGoal: o.net * (1 + targetPct)
				});
			} else {
				const profit = o.net - cur.cost;
				diary.push({
					...o,
					profit,
					profitPct: cur.cost > 0 ? (profit / cur.cost) * 100 : null,
					targetPct: targets[o.ticker] ?? 0.03,
					goalPrice: null,
					netAtGoal: null
				});
				open.delete(o.ticker);
			}
		}
		const today = localDayKey(Date.now());
		const positions: TradingPosition[] = [];
		for (const [ticker, pos] of open) {
			const quote = getStoredTradingQuote(ticker);
			const avgPrice = pos.qty > 0 ? pos.value / pos.qty : 0;
			const targetPct = targets[ticker] ?? 0.03;
			const potentialPct = positionPotential(pos.qty, pos.cost, quote?.price ?? null, org);
			const rules = goalRules(pos);
			// Selling while every open buy is from today is a day trade
			// (20% IR, no exemption), never a swing sale — even past target.
			const sameDay = localDayKey(pos.since) === today;
			const hit = potentialPct !== null && potentialPct >= targetPct * 100;
			positions.push({
				ticker,
				orgId: org.id,
				orgName: org.name,
				qty: pos.qty,
				avgPrice,
				cost: pos.cost,
				quote: quote?.price ?? null,
				quoteSource: quote?.source ?? null,
				quoteAt: quote?.fetchedAt ?? null,
				targetPct,
				potentialPct,
				sameDay,
				since: pos.since,
				targetPrice: targetSellPrice(pos.qty, pos.cost, targetPct, rules),
				netValue: saleNet(pos.qty, quote?.price ?? null, org),
				sellFees: saleBreakdown(pos.qty, quote?.price ?? null, org),
				goalFees: {
					feeRatePct: rules.feeRate * 100,
					spreadRatePct: rules.spreadRate * 100,
					irrfRatePct: rules.irrfRate * 100,
					fixedFee: rules.fixedFee
				},
				recommendation:
					quote === null || quote.price === null ? 'waiting' : hit ? (sameDay ? 'daytrade' : 'sell') : 'hold'
			});
		}
		positions.sort((a, b) => b.cost - a.cost);
		// Rolling months: from the first order month through the current
		// month, so the panel grows with use instead of fixing a year.
		const months: TradingMonthRow[] = [];
		if (orders.length > 0) {
			// Fees count every order, buys included: the round trip costs
			// the fee twice, while sales alone feed the exemption ceiling.
			const feesByMonth = new Map<string, number>();
			for (const o of orders) {
				feesByMonth.set(o.month, (feesByMonth.get(o.month) ?? 0) + o.fees);
			}
			const sells = diary.filter((d) => d.side === 'SELL');
			const byMonth = new Map<string, { sales: number; irrf: number; profit: number }>();
			for (const s of sells) {
				const cur = byMonth.get(s.month) ?? { sales: 0, irrf: 0, profit: 0 };
				cur.sales += s.value;
				cur.irrf += s.irrf;
				cur.profit += s.profit ?? 0;
				byMonth.set(s.month, cur);
			}
			const first = monthKeyToDate(orders[0]!.month);
			const cursor = new Date(first);
			cursor.setDate(1);
			const end = new Date();
			end.setDate(1);
			while (cursor <= end) {
				const key = tradingMonthKey(cursor.getTime());
				const agg = byMonth.get(key) ?? { sales: 0, irrf: 0, profit: 0 };
				months.push({
					month: key,
					sales: agg.sales,
					limit: org.exemptLimit,
					fees: feesByMonth.get(key) ?? 0,
					irrf: agg.irrf,
					profit: agg.profit,
					exempt: agg.sales <= org.exemptLimit
				});
				cursor.setMonth(cursor.getMonth() + 1);
			}
			months.reverse();
		}
		return { org, orders: diary, positions, months };
	}

	/** One card per open ticker across every enabled venue, plus the money
	 *  totals of the whole rail: the home-page strip below the holdings
	 *  carousel. */
	function getTradingStrip(): TradingStrip {
		const out: TradingStripItem[] = [];
		for (const org of listTradingOrgs().filter((o) => o.enabled)) {
			const orders = listTradingOrders(org.id);
			if (orders.length === 0) continue;
			let targets: Record<string, number> = {};
			try {
				const rows = db.prepare('SELECT ticker, target_pct FROM trading_targets WHERE org_id = ?').all(org.id) as unknown as {
					ticker: string;
					target_pct: number;
				}[];
				for (const r of rows) targets[r.ticker] = r.target_pct;
			} catch {
				targets = {};
			}
			for (const [ticker, pos] of openTradingPositions(orders)) {
				const quote = getStoredTradingQuote(ticker);
				const avgPrice = pos.qty > 0 ? pos.value / pos.qty : 0;
				const targetPct = targets[ticker] ?? 0.03;
				const potentialPct = positionPotential(pos.qty, pos.cost, quote?.price ?? null, org);
				const sameDay = localDayKey(pos.since) === localDayKey(Date.now());
				const rules = goalRules(pos);
				const hit = potentialPct !== null && potentialPct >= targetPct * 100;
				out.push({
					ticker,
					orgId: org.id,
					orgName: org.name,
					qty: pos.qty,
					avgPrice,
					cost: pos.cost,
					quote: quote?.price ?? null,
					targetPct,
					potentialPct,
					sameDay,
					since: pos.since,
					quoteAt: quote?.fetchedAt ?? null,
					targetPrice: targetSellPrice(pos.qty, pos.cost, targetPct, rules),
					netValue: saleNet(pos.qty, quote?.price ?? null, org),
					sellFees: saleBreakdown(pos.qty, quote?.price ?? null, org),
					goalFees: {
						feeRatePct: rules.feeRate * 100,
						spreadRatePct: rules.spreadRate * 100,
						irrfRatePct: rules.irrfRate * 100,
						fixedFee: rules.fixedFee
					},
					recommendation:
						quote === null || quote.price === null ? 'waiting' : hit ? (sameDay ? 'daytrade' : 'sell') : 'hold'
				});
			}
		}
		// Currencies never add up: each venue's money goes to USD first. The
		// rest of the app states holdings totals with these same rates.
		const { rates } = fxToUsd();
		const native = new Map<string, { invested: number; now: number; atGoal: number; missing: number }>();
		for (const p of out) {
			const currency = p.orgId === 'ripio' ? 'USD' : 'BRL';
			const sum = native.get(currency) ?? { invested: 0, now: 0, atGoal: 0, missing: 0 };
			sum.invested += p.cost;
			// The goal is defined on net after sell costs, so this needs no quote.
			sum.atGoal += p.cost * (1 + p.targetPct);
			if (p.netValue === null) sum.missing += 1;
			else sum.now += p.netValue;
			native.set(currency, sum);
		}
		let investedUsd = 0;
		let nowUsd = 0;
		let atGoalUsd = 0;
		let missingQuotes = 0;
		let complete = true;
		for (const [currency, sum] of native) {
			const rate = rates.get(currency);
			if (rate === undefined) {
				complete = false;
				continue;
			}
			investedUsd += sum.invested * rate;
			nowUsd += sum.now * rate;
			atGoalUsd += sum.atGoal * rate;
			missingQuotes += sum.missing;
		}
		const triple = (usd: number | null): TradingMoneyTriple => {
			if (usd === null) return { USD: null, BRL: null, UYU: null };
			const brl = rates.get('BRL');
			const uyu = rates.get('UYU');
			return {
				USD: usd,
				BRL: brl === undefined ? null : usd / brl,
				UYU: uyu === undefined ? null : usd / uyu
			};
		};
		const totals: TradingStripTotals = {
			count: out.length,
			missingQuotes,
			invested: triple(complete ? investedUsd : null),
			now: triple(complete ? nowUsd : null),
			atGoal: triple(complete ? atGoalUsd : null)
		};
		return { positions: out.sort((a, b) => b.cost - a.cost), totals };
	}

	function getTradingQuoteHistory(orgId: string, rawTicker: unknown): TradingQuotePoint[] {
		const t = String(rawTicker ?? '').trim().toUpperCase();
		if (!/^[A-Z0-9._-]{1,12}$/.test(t)) return [];
		try {
			const rows = db
				.prepare('SELECT day, price FROM trading_quote_history WHERE ticker = ? ORDER BY day ASC')
				.all(t) as unknown as { day: string; price: number }[];
			if (rows.length === 0) return [];
			const orders = listTradingOrders(String(orgId ?? '')).filter((o) => o.ticker === t);
			const out: TradingQuotePoint[] = [];
			for (const r of rows) {
				const cutoff = new Date(`${r.day}T00:00:00`).getTime() + 86400000;
				if (!Number.isFinite(cutoff)) continue;
				const open = openTradingPositions(orders.filter((o) => o.date < cutoff)).get(t);
				const qty = open?.qty ?? 0;
				if (qty <= 0) continue;
				out.push({ day: r.day, price: r.price, qty, value: qty * r.price });
			}
			return out;
		} catch {
			return [];
		}
	}

	function cleanStockInput(input: StockItemInput): Omit<StockItem, 'id' | 'hasPhoto' | 'photos' | 'created_at' | 'updated_at' | 'brand' | 'category' | 'group'> | null {
		const kind = cleanStockKind(input.kind);
		const name = String(input.name ?? '').trim().slice(0, 80);
		// Consumables can go nameless (the category goal needs the size, not
		// the name); durables still require one. Either way the item needs
		// at least one of name, brand or category to be identifiable.
		if (kind === 'durable' && !name) return null;
		if (!name && !String(input.brand ?? '').trim() && !String(input.category ?? '').trim()) return null;
		const note = String(input.note ?? '').trim().slice(0, 2000);
		const num = (v: unknown): number => {
			const n = Number(v);
			return Number.isFinite(n) && n >= 0 ? n : NaN;
		};
		const currency = /^[A-Z]{3}$/.test(String(input.currency ?? 'BRL').trim().toUpperCase())
			? String(input.currency ?? 'BRL').trim().toUpperCase()
			: 'BRL';
		const boughtWhere = String(input.bought_where ?? '').trim().slice(0, 80);
		const priceRaw = input.price === undefined || input.price === null ? null : Number(input.price);
		if (priceRaw !== null && (!Number.isFinite(priceRaw) || priceRaw < 0)) return null;
		const packageSize =
			input.package_size === undefined || input.package_size === null ? 0 : Number(input.package_size);
		if (!Number.isFinite(packageSize) || packageSize < 0) return null;
		const packageUnitRaw = String(input.package_unit ?? 'g').trim().toLowerCase();
		const packageUnit = ['g', 'kg', 'ml', 'l'].includes(packageUnitRaw) ? packageUnitRaw : 'g';
		if (kind === 'consumable') {
			const quantity = num(input.quantity ?? NaN);
			if (!Number.isFinite(quantity)) return null;
			const expiresAt = input.expires_at === undefined || input.expires_at === null ? null : Number(input.expires_at);
			if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= 0)) return null;
			// Consumables carry no days-per-package or price: progress comes
			// from the package size alone. The old columns stay for old
			// backups; new writes keep them empty.
			return {
				kind,
				name,
				note,
				quantity,
				duration_days: 0,
				package_size: packageSize,
				package_unit: packageUnit,
				bought_at: null,
				expires_at: expiresAt,
				price: null,
				currency: 'BRL',
				bought_where: '',
				ended_at: null
			};
		}
		const boughtAt = input.bought_at === undefined || input.bought_at === null ? null : Number(input.bought_at);
		if (boughtAt !== null && (!Number.isFinite(boughtAt) || boughtAt <= 0)) return null;
		const endedAt = input.ended_at === undefined || input.ended_at === null ? null : Number(input.ended_at);
		if (endedAt !== null && (!Number.isFinite(endedAt) || endedAt <= 0)) return null;
		return {
			kind,
			name,
			note,
			quantity: 0,
			duration_days: 0,
			package_size: 0,
			package_unit: 'g',
			bought_at: boughtAt,
			expires_at: null,
			price: priceRaw,
			currency,
			bought_where: boughtWhere,
			ended_at: endedAt
		};
	}

	function listStockPhotos(itemId: string): StockItemPhoto[] {
		try {
			return db
				.prepare(
					'SELECT id, created_at FROM stock_item_photos WHERE item_id = ? ORDER BY position ASC, created_at ASC, id ASC'
				)
				.all(itemId) as unknown as StockItemPhoto[];
		} catch {
			// Table arrives with migration 15.
			return [];
		}
	}

	function photosByItem(): Map<string, StockItemPhoto[]> {
		const map = new Map<string, StockItemPhoto[]>();
		try {
			const rows = db
				.prepare(
					'SELECT id, item_id, created_at FROM stock_item_photos ORDER BY position ASC, created_at ASC, id ASC'
				)
				.all() as unknown as { id: string; item_id: string; created_at: number }[];
			for (const r of rows) {
				const list = map.get(r.item_id);
				if (list) list.push({ id: r.id, created_at: r.created_at });
				else map.set(r.item_id, [{ id: r.id, created_at: r.created_at }]);
			}
		} catch {
			// Table arrives with migration 15.
		}
		return map;
	}

	function listStockItems(): StockItem[] {
		let rows: StockItemRow[];
		try {
			rows = db
				.prepare(
					`SELECT i.*, b.name AS brand_name, c.name AS category_name, c.parent AS category_parent
					 FROM stock_items i
					 LEFT JOIN stock_registries b ON b.id = i.brand_id
					 LEFT JOIN stock_registries c ON c.id = i.category_id`
				)
				.all() as unknown as StockItemRow[];
		} catch {
			// Tables arrive with migrations 11 and 13.
			return [];
		}
		const photos = photosByItem();
		return rows
			.map((r) => rowToStockItem(r, photos.get(r.id) ?? []))
			.sort((a, b) => {
				if (a.kind !== b.kind) return a.kind === 'consumable' ? -1 : 1;
				if (a.kind === 'consumable') {
					const ra = a.quantity * a.duration_days;
					const rb = b.quantity * b.duration_days;
					// Empty stock sinks; otherwise soonest exhaustion first.
					if (ra <= 0 && rb <= 0) return a.name.localeCompare(b.name);
					if (ra <= 0) return 1;
					if (rb <= 0) return -1;
					return ra - rb || a.name.localeCompare(b.name);
				}
				const aActive = a.ended_at === null ? 0 : 1;
				const bActive = b.ended_at === null ? 0 : 1;
				if (aActive !== bActive) return aActive - bActive;
				if (aActive === 0) return (b.bought_at ?? 0) - (a.bought_at ?? 0) || a.name.localeCompare(b.name);
				return (b.ended_at ?? 0) - (a.ended_at ?? 0) || a.name.localeCompare(b.name);
			});
	}

	function getStockItem(id: string): StockItem | null {
		let r: StockItemRow | undefined;
		try {
			r = db
				.prepare(
					`SELECT i.*, b.name AS brand_name, c.name AS category_name, c.parent AS category_parent
					 FROM stock_items i
					 LEFT JOIN stock_registries b ON b.id = i.brand_id
					 LEFT JOIN stock_registries c ON c.id = i.category_id
					 WHERE i.id = ?`
				)
				.get(id) as unknown as StockItemRow | undefined;
		} catch {
			return null;
		}
		return r ? rowToStockItem(r, listStockPhotos(id)) : null;
	}

	/** One category edit: group label plus an optional goal. */
	function setStockCategory(input: StockCategoryInput): {
		category: string;
		group: string;
		goal: StockCategoryGoal | null;
	} | null {
		const category = String(input?.category ?? '').trim();
		if (!category) return null;
		const categoryId = ensureStockRegistry('category', category);
		if (!categoryId) return null;
		const group = String(input?.group ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
		const goal = input?.goal ?? null;
		let cleanGoal: { people: number; amount: number; unit: string; note: string } | null = null;
		if (goal !== null) {
			const people = Math.trunc(Number(goal.people));
			const amount = Number(goal.amount);
			if (!Number.isFinite(people) || people < 1 || people > 999) return null;
			if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;
			const lower = String(goal.unit ?? 'g').trim().toLowerCase();
			const unit = ['g', 'kg', 'ml', 'l'].includes(lower) ? (lower === 'l' ? 'L' : lower) : null;
			if (!unit) return null;
			cleanGoal = {
				people,
				amount,
				unit,
				note: String(goal.note ?? '').trim().slice(0, 2000)
			};
		}
		try {
			db.transaction(() => {
				db.prepare('UPDATE stock_registries SET parent = ? WHERE id = ?').run(group, categoryId);
				if (cleanGoal === null) {
					db.prepare('DELETE FROM stock_category_goals WHERE category_id = ?').run(categoryId);
				} else {
					db.prepare(
						`INSERT INTO stock_category_goals (category_id, people, amount, unit, note)
						 VALUES (?, ?, ?, ?, ?)
						 ON CONFLICT (category_id) DO UPDATE SET people = excluded.people,
							amount = excluded.amount, unit = excluded.unit, note = excluded.note`
					).run(categoryId, cleanGoal.people, cleanGoal.amount, cleanGoal.unit, cleanGoal.note);
				}
			});
		} catch {
			return null;
		}
		const savedGoal = listStockCategoryGoals().find((g) => g.category === category) ?? null;
		return { category, group, goal: savedGoal };
	}

	function createStockItem(input: StockItemInput): StockItem | null {
		const clean = cleanStockInput(input);
		if (!clean) return null;
		const now = Date.now();
		const id = crypto.randomUUID();
		const brandId = input.brand ? ensureStockRegistry('brand', input.brand) : null;
		const categoryId = input.category ? ensureStockRegistry('category', input.category) : null;
		try {
			db.prepare(
				`INSERT INTO stock_items (id, kind, name, brand_id, category_id, note, quantity, duration_days, package_size, package_unit, bought_at, expires_at, price, currency, bought_where, ended_at, photo, photo_mime, has_photo, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', 0, ?, ?)`
			).run(
				id,
				clean.kind,
				clean.name,
				brandId,
				categoryId,
				clean.note,
				clean.quantity,
				clean.duration_days,
				clean.package_size,
				clean.package_unit,
				clean.bought_at,
				clean.expires_at,
				clean.price,
				clean.currency,
				clean.bought_where,
				clean.ended_at,
				now,
				now
			);
		} catch {
			return null;
		}
		return getStockItem(id);
	}

	function updateStockItem(id: string, input: Partial<StockItemInput>): StockItem | null {
		const existing = getStockItem(id);
		if (!existing) return null;
		// The kind is fixed at creation: the form never changes tabs mid-edit.
		const merged: StockItemInput = {
			kind: existing.kind,
			name: input.name !== undefined ? input.name : existing.name,
			brand: input.brand !== undefined ? input.brand : existing.brand,
			category: input.category !== undefined ? input.category : existing.category,
			note: input.note !== undefined ? input.note : existing.note,
			quantity: input.quantity !== undefined ? input.quantity : existing.quantity,
			duration_days: input.duration_days !== undefined ? input.duration_days : existing.duration_days,
			package_size: input.package_size !== undefined ? input.package_size : existing.package_size,
			package_unit: input.package_unit !== undefined ? input.package_unit : existing.package_unit,
			bought_at: input.bought_at !== undefined ? input.bought_at : existing.bought_at,
			expires_at: input.expires_at !== undefined ? input.expires_at : existing.expires_at,
			price: input.price !== undefined ? input.price : existing.price,
			currency: input.currency !== undefined ? input.currency : existing.currency,
			bought_where: input.bought_where !== undefined ? input.bought_where : existing.bought_where,
			ended_at: input.ended_at !== undefined ? input.ended_at : existing.ended_at
		};
		const clean = cleanStockInput(merged);
		if (!clean) return null;
		const current = db.prepare('SELECT brand_id, category_id FROM stock_items WHERE id = ?').get(id) as unknown as
			| { brand_id: string | null; category_id: string | null }
			| undefined;
		const brandId =
			input.brand !== undefined ? (input.brand ? ensureStockRegistry('brand', input.brand) : null) : (current?.brand_id ?? null);
		const categoryId =
			input.category !== undefined ? (input.category ? ensureStockRegistry('category', input.category) : null) : (current?.category_id ?? null);
		const now = Math.max(Date.now(), existing.created_at + 1);
		try {
			db.prepare(
				`UPDATE stock_items SET name = ?, note = ?, quantity = ?, duration_days = ?, package_size = ?, package_unit = ?, bought_at = ?, expires_at = ?, price = ?,
				 currency = ?, bought_where = ?, ended_at = ?, brand_id = ?, category_id = ?, updated_at = ? WHERE id = ?`
			).run(
				clean.name,
				clean.note,
				clean.quantity,
				clean.duration_days,
				clean.package_size,
				clean.package_unit,
				clean.bought_at,
				clean.expires_at,
				clean.price,
				clean.currency,
				clean.bought_where,
				clean.ended_at,
				brandId,
				categoryId,
				now,
				id
			);
		} catch {
			return null;
		}
		return getStockItem(id);
	}

	function deleteStockItem(id: string): boolean {
		try {
			return db.prepare('DELETE FROM stock_items WHERE id = ?').run(id).changes > 0;
		} catch {
			return false;
		}
	}

	function setStockItemPhoto(id: string, photo: Uint8Array | null, mime: string): StockItem | null {
		const existing = getStockItem(id);
		if (!existing) return null;
		const now = Math.max(Date.now(), existing.created_at + 1);
		try {
			if (photo === null) {
				db.prepare('UPDATE stock_items SET photo = NULL, photo_mime = ?, has_photo = 0, updated_at = ? WHERE id = ?').run('', now, id);
			} else {
				db.prepare('UPDATE stock_items SET photo = ?, photo_mime = ?, has_photo = 1, updated_at = ? WHERE id = ?').run(
					photo as unknown as string,
					mime,
					now,
					id
				);
			}
		} catch {
			return null;
		}
		return getStockItem(id);
	}

	function addStockPhotos(
		itemId: string,
		photos: { photo: Uint8Array; mime: string }[]
	): StockItemPhoto[] {
		if (photos.length === 0) return listStockPhotos(itemId);
		const max = db
			.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM stock_item_photos WHERE item_id = ?')
			.get(itemId) as unknown as { m: number };
		const insert = db.prepare(
			'INSERT INTO stock_item_photos (id, item_id, photo, mime, position, created_at) VALUES (?, ?, ?, ?, ?, ?)'
		);
		const now = Date.now();
		db.transaction(() => {
			photos.forEach((p, i) => {
				insert.run(
					crypto.randomUUID(),
					itemId,
					p.photo as unknown as string,
					p.mime,
					max.m + 1 + i,
					now + i
				);
			});
		});
		return listStockPhotos(itemId);
	}

	function removeStockPhotos(itemId: string, ids: string[]): StockItemPhoto[] {
		if (ids.length === 0) return listStockPhotos(itemId);
		const del = db.prepare('DELETE FROM stock_item_photos WHERE id = ? AND item_id = ?');
		db.transaction(() => {
			for (const id of ids) del.run(id, itemId);
		});
		return listStockPhotos(itemId);
	}

	function getStockPhoto(photoId: string): { photo: Uint8Array; mime: string; createdAt: number } | null {
		let r: { photo: unknown; mime: string; created_at: number } | undefined;
		try {
			r = db
				.prepare('SELECT photo, mime, created_at FROM stock_item_photos WHERE id = ?')
				.get(photoId) as unknown as { photo: unknown; mime: string; created_at: number } | undefined;
		} catch {
			return null;
		}
		if (!r || r.photo === null || r.photo === undefined) return null;
		const bytes = toBytes(r.photo);
		if (bytes.length === 0) return null;
		return { photo: bytes, mime: r.mime || 'image/jpeg', createdAt: r.created_at };
	}

	function getStockItemPhoto(id: string): { photo: Uint8Array; mime: string; updatedAt: number } | null {
		let r: { photo: unknown; photo_mime: string; updated_at: number } | undefined;
		try {
			r = db
				.prepare('SELECT photo, photo_mime, updated_at FROM stock_items WHERE id = ?')
				.get(id) as unknown as { photo: unknown; photo_mime: string; updated_at: number } | undefined;
		} catch {
			return null;
		}
		if (r && r.photo !== null && r.photo !== undefined) {
			const bytes = toBytes(r.photo);
			if (bytes.length > 0) return { photo: bytes, mime: r.photo_mime || 'image/jpeg', updatedAt: r.updated_at };
		}
		// New items keep their photos in the gallery; the old URL still works
		// by returning the first one.
		const first = db
			.prepare(
				'SELECT photo, mime, created_at FROM stock_item_photos WHERE item_id = ? ORDER BY position ASC, created_at ASC, id ASC LIMIT 1'
			)
			.get(id) as unknown as { photo: unknown; mime: string; created_at: number } | undefined;
		if (!first || first.photo === null || first.photo === undefined) return null;
		const bytes = toBytes(first.photo);
		if (bytes.length === 0) return null;
		return { photo: bytes, mime: first.mime || 'image/jpeg', updatedAt: first.created_at };
	}

	// --- Stock activity -------------------------------------------------
	// Consumptions are logged and the quantity is deducted in one step, so
	// the history and the stock total never drift. The table arrives with
	// migration 18.

	function listStockActions(itemId: string, limit = 20): StockAction[] {
		let rows: StockAction[];
		try {
			rows = db
				.prepare(
					`SELECT id, item_id, kind, amount, unit, packages, note, created_at
					 FROM stock_item_actions
					 WHERE item_id = ?
					 ORDER BY created_at DESC, id DESC LIMIT ?`
				)
				.all(itemId, Math.min(100, Math.max(1, Math.trunc(limit)))) as unknown as StockAction[];
		} catch {
			return [];
		}
		if (!Array.isArray(rows)) return [];
		for (const row of rows) {
			row.amount = Number(row.amount);
			row.packages = Number(row.packages);
			row.note = row.note ?? '';
		}
		return rows;
	}

	/** Deduct a consumption. `unit` must belong to the same family as the
	 *  item's package unit; anything else is rejected so the amount cannot
	 *  be read as the wrong substance. */
	function recordStockConsume(
		itemId: string,
		amount: number,
		unit: string,
		note: string
	): { item: StockItem; action: StockAction } | null {
		const existing = getStockItem(itemId);
		if (!existing || existing.kind !== 'consumable') return null;
		const qty = Number(amount);
		if (!Number.isFinite(qty) || qty <= 0) return null;
		if (existing.package_size <= 0) return null;
		const family = (u: string) => {
			const x = (u || '').toLowerCase();
			if (x === 'g' || x === 'kg') return 'mass';
			if (x === 'ml' || x === 'l') return 'volume';
			return null;
		};
		const itemUnit = (existing.package_unit || 'g').toLowerCase();
		const consumeUnit = (unit || '').toLowerCase();
		if (!family(unit) || family(unit) !== family(itemUnit)) return null;
		const toBase = (v: number, u: string) => (u === 'kg' || u === 'l' ? v * 1000 : v);
		const amountBase = toBase(qty, consumeUnit);
		const sizeBase = toBase(existing.package_size, itemUnit);
		if (sizeBase <= 0) return null;
		const wanted = amountBase / sizeBase;
		const deducted = Math.min(existing.quantity, wanted);
		// Normalize the stored unit spelling: litres are `L`, the rest stay
		// lowercase, matching the package units.
		const storedUnit = consumeUnit === 'l' ? 'L' : consumeUnit;
		const now = Math.max(Date.now(), existing.created_at + 1);
		const actionId = crypto.randomUUID();
		let item: StockItem;
		db.transaction(() => {
			const next = Math.max(0, existing.quantity - deducted);
			db.prepare('UPDATE stock_items SET quantity = ?, updated_at = ? WHERE id = ?').run(next, now, itemId);
			db.prepare(
				`INSERT INTO stock_item_actions (id, item_id, kind, amount, unit, packages, note, created_at)
				 VALUES (?, ?, 'consume', ?, ?, ?, ?, ?)`
			).run(actionId, itemId, qty, storedUnit, deducted, String(note ?? '').trim().slice(0, 500), now);
		});
		const saved = getStockItem(itemId);
		if (!saved) return null;
		item = saved;
		const action: StockAction = {
			id: actionId,
			item_id: itemId,
			kind: 'consume',
			amount: qty,
			unit: storedUnit,
			packages: deducted,
			note: String(note ?? '').trim().slice(0, 500),
			created_at: now
		};
		return { item, action };
	}

	// --- Stock goal -----------------------------------------------------

	function getStockGoals(): { target_days: number } {
		try {
			const r = db.prepare('SELECT target_days FROM stock_goals WHERE id = 1').get() as unknown as
				| { target_days: number }
				| undefined;
			const t = Math.trunc(Number(r?.target_days));
			if (Number.isFinite(t) && t >= 1) return { target_days: Math.min(t, 3650) };
		} catch {
			// Table arrives with migration 12.
		}
		return { target_days: 365 };
	}

	function setStockGoals(targetDays: number): { target_days: number } | null {
		const t = Math.trunc(Number(targetDays));
		if (!Number.isFinite(t) || t < 1 || t > 3650) return null;
		try {
			db.prepare(
				'INSERT INTO stock_goals (id, target_days) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET target_days = excluded.target_days'
			).run(t);
		} catch {
			return null;
		}
		return getStockGoals();
	}

	// --- Stock category goals -------------------------------------------
	// Amount per person per category. The table arrives with migration 16;
	// older journals read back as an empty set.

	function listStockCategoryGoals(): StockCategoryGoal[] {
		try {
			const rows = db
				.prepare(
					`SELECT g.category_id, r.name, COALESCE(r.parent, '') AS parent, g.people, g.amount, g.unit, g.note
					 FROM stock_category_goals g
					 JOIN stock_registries r ON r.id = g.category_id
					 ORDER BY r.name COLLATE NOCASE ASC, r.name ASC`
				)
				.all() as unknown as {
					category_id: string;
					name: string;
					parent: string;
					people: number;
					amount: number;
					unit: string;
					note: string;
				}[];
			return rows.map((r) => {
				const people = Math.trunc(Number(r.people));
				const amount = Number(r.amount);
				const unit = ['g', 'kg', 'ml', 'L'].includes(r.unit) ? r.unit : 'g';
				const safePeople = Number.isFinite(people) && people >= 1 ? people : 1;
				const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
				return {
					category_id: r.category_id,
					category: r.name,
					group: r.parent ?? '',
					people: safePeople,
					amount: safeAmount,
					unit,
					note: r.note ?? '',
					target: safePeople * safeAmount
				};
			});
		} catch {
			// Table arrives with migration 16.
			return [];
		}
	}

	function setStockCategoryGoals(input: StockCategoryGoalInput[]): StockCategoryGoal[] | null {
		if (!Array.isArray(input) || input.length > 200) return null;
		const byId = new Map<string, { people: number; amount: number; unit: string; note: string }>();
		for (const goal of input) {
			const categoryId = ensureStockRegistry('category', goal?.category);
			if (!categoryId) return null;
			const people = Math.trunc(Number(goal?.people));
			const amount = Number(goal?.amount);
			if (!Number.isFinite(people) || people < 1 || people > 999) return null;
			if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;
			const rawUnit = String(goal?.unit ?? 'g').trim();
			const lower = rawUnit.toLowerCase();
			const unit = ['g', 'kg', 'ml', 'l'].includes(lower) ? (lower === 'l' ? 'L' : lower) : null;
			if (!unit) return null;
			const note = String(goal?.note ?? '').trim().slice(0, 2000);
			byId.set(categoryId, { people, amount, unit, note });
		}
		if (byId.size !== input.length) {
			// Two rows for one category (case-insensitive) are one goal; the
			// last row wins. byId already holds it, so the count differs.
			// Keep the deduped set instead of failing the whole save.
		}
		try {
			db.transaction(() => {
				db.prepare('DELETE FROM stock_category_goals').run();
				const insert = db.prepare(
					'INSERT INTO stock_category_goals (category_id, people, amount, unit, note) VALUES (?, ?, ?, ?, ?)'
				);
				for (const [categoryId, g] of byId) {
					insert.run(categoryId, g.people, g.amount, g.unit, g.note);
				}
			});
		} catch {
			return null;
		}
		return listStockCategoryGoals();
	}

	function listHoldingActions(holdingId: string): HoldingAction[] | null {
		const exists = db.prepare('SELECT id FROM holdings WHERE id = ?').get(holdingId);
		return exists ? readHoldingActions(holdingId) : null;
	}

	/** Buys and sells across every holding, newest first. Opening rows are
	 *  the starting balance, not an event, so they stay out. */
	function listTradeHistory(
		limit = 50,
		cursor: TradeHistoryCursor | null = null
	): TradeHistoryPage {
		const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 50;
		const cursorSql = cursor ? 'AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))' : '';
		const params: SqlValue[] = cursor ? [cursor.created_at, cursor.created_at, cursor.id] : [];
		const rows = db
			.prepare(
				`SELECT a.id, a.holding_id, a.kind, a.amount, a.price, a.currency, a.created_at,
				        h.ticker, h.bank, h.category
				 FROM holding_actions a JOIN holdings h ON h.id = a.holding_id
				 WHERE a.kind IN ('buy', 'sell') ${cursorSql}
				 ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
			)
			.all(...params, safeLimit + 1) as unknown as TradeHistoryItem[];
		const hasMore = rows.length > safeLimit;
		const items = hasMore ? rows.slice(0, safeLimit) : rows;
		const last = items[items.length - 1];
		const count = (
			db.prepare("SELECT COUNT(*) AS c FROM holding_actions WHERE kind IN ('buy', 'sell')").get() as {
				c: number;
			}
		).c;
		return {
			items,
			count,
			hasMore,
			nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null
		};
	}

	type RecordActionResult =
		| { ok: true; action: HoldingAction; holding: Holding; actions: HoldingAction[] }
		| { ok: false; reason: 'not_found' | 'invalid' | 'insufficient' };

	function recordHoldingAction(holdingId: string, kind: string, amount: number, price?: number | null): RecordActionResult {
		if (kind !== 'buy' && kind !== 'sell') return { ok: false, reason: 'invalid' };
		const qty = Number(amount);
		if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'invalid' };
		const explicitPrice = price === undefined || price === null ? null : Number(price);
		if (explicitPrice !== null && (!Number.isFinite(explicitPrice) || explicitPrice < 0)) {
			return { ok: false, reason: 'invalid' };
		}
		const result = db.transaction((): RecordActionResult => {
			const current = db.prepare('SELECT * FROM holdings WHERE id = ?').get(holdingId) as unknown as HoldingRow | undefined;
			if (!current) return { ok: false, reason: 'not_found' };
			if (kind === 'sell' && qty > current.amount + 1e-9) return { ok: false, reason: 'insufficient' };
			const now = Date.now();
			const tradePrice = current.category === 'cash' ? 1 : (explicitPrice ?? current.price);
			const action: HoldingAction = {
				id: crypto.randomUUID(),
				holding_id: holdingId,
				kind,
				amount: qty,
				price: tradePrice,
				currency: current.currency,
				created_at: now
			};
			db.prepare(
				'INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			).run(action.id, holdingId, kind, qty, action.price, action.currency, now);
			const next = kind === 'buy' ? current.amount + qty : current.amount - qty;
			const clean = next < 1e-9 ? 0 : next;
			db.prepare('UPDATE holdings SET amount = ?, updated_at = ? WHERE id = ?').run(clean, now, holdingId);
			const updated = db.prepare('SELECT * FROM holdings WHERE id = ?').get(holdingId) as unknown as HoldingRow;
			const opening = db
				.prepare("SELECT price FROM holding_actions WHERE holding_id = ? AND kind = 'opening' LIMIT 1")
				.get(holdingId) as unknown as { price: number | null } | undefined;
			const { rates } = fxToUsd();
			return {
				ok: true,
				action,
				holding: rowToHolding(updated, rates, opening?.price ?? null),
				actions: readHoldingActions(holdingId)
			};
		});
		if (result.ok) {
			snapshotHoldingValue(holdingId);
			snapshotPortfolioValue();
		}
		return result;
	}

	function getCategoryGoals(): { btc: number; fii: number; cash: number } | null {
		try {
			const rows = db.prepare('SELECT category, pct FROM category_goals').all() as unknown as { category: string; pct: number }[];
			const map = new Map(rows.map((r) => [r.category, r.pct]));
			const btc = map.get('btc');
			const fii = map.get('fii');
			const cash = map.get('cash');
			if (btc === undefined || fii === undefined || cash === undefined) return null;
			return { btc, fii, cash };
		} catch {
			// Table arrives with migration 4.
			return null;
		}
	}

	function getCategoryValueGoals(): {
		btc: CategoryValueGoal | null;
		fii: CategoryValueGoal | null;
		cash: CategoryValueGoal | null;
	} | null {
		try {
			const rows = db
				.prepare('SELECT category, amount, currency FROM category_value_goals')
				.all() as unknown as { category: string; amount: number; currency: string }[];
			if (rows.length === 0) return null;
			const map = new Map(rows.map((r) => [r.category, { amount: r.amount, currency: r.currency }]));
			return {
				btc: map.get('btc') ?? null,
				fii: map.get('fii') ?? null,
				cash: map.get('cash') ?? null
			};
		} catch {
			// Table arrives with migration 9.
			return null;
		}
	}

	type GoalWrite = { ok: true } | { ok: false; field: 'pct' | 'values' };

	/** Absolute targets are optional per category and independent from the
	 *  percent goals. A `null` category clears its target. */
	function setHoldingsGoals(
		pct: { btc: number; fii: number; cash: number } | null,
		values: { btc: number | null; fii: number | null; cash: number | null } | null
	): GoalWrite {
		if (pct) {
			for (const v of [pct.btc, pct.fii, pct.cash]) {
				if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, field: 'pct' };
			}
			if (Math.abs(pct.btc + pct.fii + pct.cash - 100) > 1e-9) return { ok: false, field: 'pct' };
		}
		if (values) {
			for (const c of HOLDING_CATEGORIES) {
				const v = values[c];
				if (v !== null && (!Number.isFinite(v) || v <= 0)) return { ok: false, field: 'values' };
			}
		}
		const VALUE_CURRENCY: Record<HoldingCategory, string> = { btc: 'USD', fii: 'BRL', cash: 'BRL' };
		db.transaction(() => {
			if (pct) {
				const put = db.prepare(
					'INSERT INTO category_goals (category, pct) VALUES (?, ?) ON CONFLICT (category) DO UPDATE SET pct = excluded.pct'
				);
				put.run('btc', pct.btc);
				put.run('fii', pct.fii);
				put.run('cash', pct.cash);
			}
			if (values) {
				db.prepare('DELETE FROM category_value_goals').run();
				const put = db.prepare(
					'INSERT INTO category_value_goals (category, amount, currency) VALUES (?, ?, ?)'
				);
				for (const c of HOLDING_CATEGORIES) {
					const v = values[c];
					if (v !== null) put.run(c, v, VALUE_CURRENCY[c]);
				}
			}
		});
		return { ok: true };
	}

	function getHoldingsSummary(): HoldingsSummary {
		const holdings = listHoldings();
		const { rates, at } = fxToUsd();
		const now = Date.now();
		let stale = false;
		let asOf: number | null = null;
		const needBtc = holdings.some((h) => h.ticker === 'BTC' && (h.priceAuto || h.price === null));
		const consider = (c: string) => {
			const fetched = at.get(c);
			if (fetched === undefined || !rates.has(c)) {
				stale = true;
				return;
			}
			asOf = asOf === null ? fetched : Math.min(asOf, fetched);
			if (now - fetched > DAY_MS) stale = true;
		};
		for (const h of holdings) {
			if (h.currency === 'USD') continue;
			consider(h.currency);
		}
		if (needBtc) consider('BTC');
		// The collapsed header and the totals card state UYU and BRL totals,
		// so those rates are needed display data, not just conversion input.
		consider('BRL');
		consider('UYU');
		if (
			holdings.some(
				(h) =>
					h.ticker !== 'BTC' &&
					h.category !== 'cash' &&
					(h.price === null || (h.priceAuto && now - h.price_updated_at > DAY_MS))
			)
		) {
			stale = true;
		}
		const totalUsd = holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
		let previousTotalUsd: number | null = null;
		try {
			const prev = db
				.prepare('SELECT value_usd FROM portfolio_value_history WHERE day < ? ORDER BY day DESC LIMIT 1')
				.get(localDayKey()) as unknown as { value_usd: number } | undefined;
			if (prev && Number.isFinite(Number(prev.value_usd))) previousTotalUsd = Number(prev.value_usd);
		} catch {
			// Table arrives with migration 21.
		}
		const totalChangePct =
			previousTotalUsd !== null && previousTotalUsd > 0
				? ((totalUsd - previousTotalUsd) / previousTotalUsd) * 100
				: null;
		const displayTotals = {
			USD: totalUsd,
			BRL: rates.has('BRL') ? totalUsd / (rates.get('BRL') as number) : null,
			UYU: rates.has('UYU') ? totalUsd / (rates.get('UYU') as number) : null
		};
		const actual = { btc: 0, fii: 0, cash: 0 };
		if (totalUsd > 0) {
			for (const h of holdings) actual[h.category] += (h.valueUsd ?? 0) / totalUsd;
			for (const k of HOLDING_CATEGORIES) actual[k] = actual[k] * 100;
		}
		const goals = getCategoryGoals();
		const drift: CategoryShare[] =
			goals === null
				? []
				: HOLDING_CATEGORIES.filter((c) => Math.abs(actual[c] - goals[c]) > 5).map((c) => ({
						category: c,
						actual: actual[c],
						goal: goals[c]
					}));
		const valueGoals = getCategoryValueGoals();
		const valueProgress: CategoryValueProgress[] = [];
		if (valueGoals) {
			for (const c of HOLDING_CATEGORIES) {
				const goal = valueGoals[c];
				if (!goal) continue;
				const actualUsd = (actual[c] / 100) * totalUsd;
				// Rates are per USD; divide to express the value in the target
				// currency. A missing rate leaves the progress unknown, never 1:1.
				const rate = goal.currency === 'USD' ? 1 : rates.get(goal.currency);
				const actualValue = rate === undefined ? null : actualUsd / rate;
				valueProgress.push({
					category: c,
					target: goal.amount,
					currency: goal.currency,
					actual: actualValue,
					actualUsd,
					gap: actualValue === null ? null : goal.amount - actualValue,
					pct: actualValue === null ? null : (actualValue / goal.amount) * 100
				});
			}
		}
		return { holdings, totalUsd, previousTotalUsd, totalChangePct, asOf, stale, goals, valueGoals, valueProgress, actual, drift, displayTotals };
	}

	/** Refresh fiat rates and auto-prices (BTC plus stock/FII quotes). Skips
	 *  the network when every needed rate is younger than a day, unless
	 *  forced. A forced refresh refetches every auto-priced holding, even a
	 *  quote fetched minutes ago; the daily cache only applies to quiet
	 *  loads. Throws on network or parse failure; the route answers with
	 *  the cached summary instead. A single bad ticker never stops the rest. */
	async function refreshRates(force = false): Promise<HoldingsSummary> {
		const rows = db.prepare('SELECT DISTINCT UPPER(currency) AS c FROM holdings').all() as unknown as { c: string }[];
		// BRL and UYU are always needed: the header and totals card state
		// those totals even for an all-USD portfolio.
		const fiats = [...new Set([...rows.map((r) => r.c), 'BRL', 'UYU'])].filter((c) => c !== 'USD');
		const btcEmpty = db.prepare("SELECT id FROM holdings WHERE UPPER(ticker) = 'BTC' AND price IS NULL").all() as unknown as {
			id: string;
		}[];
		const btcAuto = db.prepare("SELECT id FROM holdings WHERE UPPER(ticker) = 'BTC' AND price_auto = 1 AND price IS NOT NULL").all() as unknown as {
			id: string;
		}[];
		const stockEmpty = db
			.prepare("SELECT id, ticker FROM holdings WHERE UPPER(ticker) != 'BTC' AND category != 'cash' AND price IS NULL")
			.all() as unknown as { id: string; ticker: string }[];
		const stockStale = db
			.prepare(
				"SELECT id, ticker FROM holdings WHERE UPPER(ticker) != 'BTC' AND category != 'cash' AND price_auto = 1 AND price IS NOT NULL AND price_updated_at < ?"
			)
			// A forced refresh must select fresh auto quotes too. Applying
			// `force` only to the early return left a FII quoted hours ago
			// untouched, and its edit modal kept yesterday's timestamp.
			.all(force ? Date.now() + 1 : Date.now() - DAY_MS) as unknown as { id: string; ticker: string }[];
		const stockRows = [...stockEmpty, ...stockStale.filter((r) => !stockEmpty.some((e) => e.id === r.id))];
		if (fiats.length === 0 && btcEmpty.length === 0 && btcAuto.length === 0 && stockRows.length === 0) {
			snapshotAllValues();
			return getHoldingsSummary();
		}
		const { at } = fxToUsd();
		const now = Date.now();
		const fresh = (c: string): boolean => {
			const f = at.get(c);
			return f !== undefined && now - f < DAY_MS;
		};
		const ratesFresh = fiats.length === 0 || fiats.every(fresh);
		const btcFresh = fresh('BTC');
		if (
			!force &&
			ratesFresh &&
			btcEmpty.length === 0 &&
			(btcAuto.length === 0 || btcFresh) &&
			stockRows.length === 0
		) {
			snapshotAllValues();
			return getHoldingsSummary();
		}
		if (typeof fetch !== 'function') throw new Error('network unavailable');
		const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(10000) });
		if (!res.ok) throw new Error(`rates HTTP ${res.status}`);
		const body = (await res.json()) as { data?: { rates?: Record<string, string> } };
		const rates = body?.data?.rates;
		if (!rates || typeof rates !== 'object') throw new Error('bad rates payload');
		const put = db.prepare(
			'INSERT INTO fx_rates (currency, rate_to_usd, fetched_at) VALUES (?, ?, ?) ON CONFLICT (currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, fetched_at = excluded.fetched_at'
		);
		db.transaction(() => {
			for (const c of fiats) {
				const perUsd = Number(rates[c]);
				if (Number.isFinite(perUsd) && perUsd > 0) put.run(c, 1 / perUsd, now);
			}
		});
		const btcPerUsd = Number(rates['BTC']);
		const hasBtcRate = Number.isFinite(btcPerUsd) && btcPerUsd > 0;
		if (hasBtcRate) {
			put.run('BTC', 1 / (btcPerUsd as number), now);
			const btcUsd = 1 / (btcPerUsd as number);
			const upd = db.prepare('UPDATE holdings SET price = ?, price_auto = 1, updated_at = ?, price_updated_at = ? WHERE id = ?');
			const targets = [...btcEmpty, ...btcAuto];
			db.transaction(() => {
				for (const r of targets) upd.run(btcUsd, now, now, r.id);
			});
			if (targets.length > 0) {
				logQuoteFetch({ ticker: 'BTC', source: 'coinbase', ok: true, price: btcUsd });
			}
		} else if (btcEmpty.length > 0 || btcAuto.length > 0) {
			logQuoteFetch({ ticker: 'BTC', source: 'coinbase', ok: false, error: 'no rate in payload' });
		}
		if (stockRows.length > 0) {
			const upd = db.prepare('UPDATE holdings SET price = ?, price_auto = 1, updated_at = ?, price_updated_at = ? WHERE id = ?');
			for (let i = 0; i < stockRows.length; i++) {
				// Stagger hits: Yahoo 429s rapid sequential requests.
				if (i > 0) await new Promise((r) => setTimeout(r, 500));
				const t = stockRows[i]!.ticker;
				const quote = isB3(t) ? (await fetchB3Quote(t))?.price ?? null : await fetchQuote(yahooSymbol(t));
				if (!isB3(t)) {
					logQuoteFetch({
						ticker: t,
						source: 'yahoo',
						ok: quote !== null,
						...(quote !== null ? { price: quote } : { error: 'no quote' })
					});
				}
				if (quote !== null) {
					const at = Date.now();
					upd.run(quote, at, at, stockRows[i]!.id);
				}
			}
		}
		// One snapshot pass after every successful refresh. Upserts today's
		// row, so the day keeps the last value fetched.
		snapshotAllValues();
		return getHoldingsSummary();
	}

	// --- Tag counts -------------------------------------------------------

	/** Every tag in use, with counts per section. `tag_colors` is not a source:
	 *  a stored color can outlive its items, and an orphan must not appear in
	 *  the cloud. */
	function listTagCounts(): TagCount[] {
		return db
			.prepare(
				`SELECT tag,
				        SUM(notes) AS notes,
				        SUM(todos) AS todos,
				        SUM(principles) AS principles,
				        SUM(time_entries) AS time,
				        SUM(notes + todos + principles + time_entries) AS count
				 FROM (
				   SELECT tag, COUNT(*) AS notes, 0 AS todos, 0 AS principles, 0 AS time_entries FROM note_tags GROUP BY tag
				   UNION ALL
				   SELECT tag, 0 AS notes, COUNT(*) AS todos, 0 AS principles, 0 AS time_entries FROM todo_item_tags GROUP BY tag
				   UNION ALL
				   SELECT tag, 0 AS notes, 0 AS todos, COUNT(*) AS principles, 0 AS time_entries FROM principle_tags GROUP BY tag
				   UNION ALL
				   SELECT tag, 0 AS notes, 0 AS todos, 0 AS principles, COUNT(*) AS time_entries FROM time_entry_tags GROUP BY tag
				 )
				 GROUP BY tag
				 ORDER BY count DESC, tag ASC`
			)
			.all() as unknown as TagCount[];
	}

	/** Tags on published notes only, for the public tag map. To-dos,
	 *  principles and time entries are never public, so those columns stay 0. */
	function listPublicTagCounts(): TagCount[] {
		return db
			.prepare(
				`SELECT t.tag AS tag,
				        COUNT(*) AS notes,
				        0 AS todos,
				        0 AS principles,
				        0 AS time,
				        COUNT(*) AS count
				 FROM note_tags t JOIN notes n ON n.id = t.note_id
				 WHERE n.published = 1
				 GROUP BY t.tag
				 ORDER BY count DESC, tag ASC`
			)
			.all() as unknown as TagCount[];
	}

	/** Published notes carrying one tag, for the public tag page header. */
	function countPublishedNotesByTag(tag: string): number {
		return (
			db
				.prepare(
					`SELECT COUNT(*) AS c FROM note_tags t JOIN notes n ON n.id = t.note_id
					 WHERE t.tag = ? AND n.published = 1`
				)
				.get(tag.trim().toLowerCase()) as { c: number }
		).c;
	}

	// --- Tag colors -------------------------------------------------------
	// One row per normalized tag. The registry outlives any single note or
	// item, so a color choice survives deletes. Colors are palette keys, not
	// free CSS, so a stored value can never inject a style.

	function listTagColors(): Record<string, string> {
		const rows = db.prepare('SELECT tag, color FROM tag_colors').all() as unknown as {
			tag: string;
			color: string;
		}[];
		const out: Record<string, string> = {};
		for (const r of rows) out[r.tag] = r.color;
		return out;
	}

	function setTagColor(tag: string, color: string): boolean {
		const clean = tag.trim().toLowerCase();
		if (!clean) return false;
		db.prepare(
			'INSERT INTO tag_colors (tag, color) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET color = excluded.color'
		).run(clean, color);
		return true;
	}

	/** Case-insensitive substring search for the global palette.
	 *
	 *  Notes have FTS, but tasks and principles do not. One `LIKE` model for
	 *  all three keeps short queries predictable: `notes_fts` ignores tokens
	 *  shorter than three characters and never matches a substring. */
	function searchJournal(query: string, limit = 10): SearchHit[] {
		const q = query.trim();
		if (q.length < 2) return [];
		const cap = Math.max(1, Math.min(50, Math.trunc(limit)));
		const escaped = q.replace(/[!%_]/g, (ch) => `!${ch}`);
		const like = `%${escaped}%`;

		const notes = db
			.prepare(
				`SELECT id, content, updated_at AS at
				 FROM notes
				 WHERE content LIKE ? ESCAPE '!'
				 ORDER BY updated_at DESC, id DESC
				 LIMIT ?`
			)
			.all(like, cap) as unknown as { id: string; content: string; at: number }[];

		const todos = db
			.prepare(
				`SELECT i.id, i.content, i.updated_at AS at, i.done, i.in_progress, g.name AS group_name
				 FROM todo_items i JOIN todo_groups g ON g.id = i.group_id
				 WHERE i.content LIKE ? ESCAPE '!'
				 ORDER BY i.updated_at DESC, i.id DESC
				 LIMIT ?`
			)
			.all(like, cap) as unknown as {
				id: string;
				content: string;
				at: number;
				done: number;
				in_progress: number;
				group_name: string;
			}[];

		const principles = db
			.prepare(
				`SELECT id, content, created_at AS at
				 FROM principles
				 WHERE content LIKE ? ESCAPE '!'
				 ORDER BY position ASC, created_at ASC, id ASC
				 LIMIT ?`
			)
			.all(like, cap) as unknown as { id: string; content: string; at: number }[];

		const holdingRows = db
			.prepare(
				`SELECT ticker, category, MAX(updated_at) AS at
				 FROM holdings
				 WHERE ticker LIKE ? ESCAPE '!'
				 GROUP BY ticker, category
				 ORDER BY at DESC
				 LIMIT ?`
			)
			.all(like, cap) as unknown as { ticker: string; category: string; at: number }[];

		const orgRows = db
			.prepare(
				`SELECT id, name, created_at AS at
				 FROM trading_orgs
				 WHERE name LIKE ? ESCAPE '!' OR id LIKE ? ESCAPE '!'
				 ORDER BY position ASC, name ASC
				 LIMIT ?`
			)
			.all(like, like, cap) as unknown as { id: string; name: string; at: number }[];

		// A ticker can sit in a watchlist, in an order, or both. One row per
		// venue and ticker keeps the list readable and the deep link exact.
		const tradingRows = db
			.prepare(
				`SELECT ticker, org_id, MAX(at) AS at FROM (
					SELECT ticker, org_id, updated_at AS at FROM trading_targets
					UNION ALL
					SELECT ticker, org_id, created_at AS at FROM trading_orders
				)
				WHERE ticker LIKE ? ESCAPE '!'
				GROUP BY ticker, org_id
				ORDER BY at DESC
				LIMIT ?`
			)
			.all(like, cap) as unknown as { ticker: string; org_id: string; at: number }[];

		const orgNames = new Map(
			(db.prepare('SELECT id, name FROM trading_orgs').all() as unknown as {
				id: string;
				name: string;
			}[]).map((o) => [o.id, o.name])
		);

		return [
			...notes.map((r) => ({
				kind: 'note' as const,
				id: r.id,
				text: clipSearchText(r.content, q),
				context: '',
				at: r.at
			})),
			...todos.map((r) => ({
				kind: 'todo' as const,
				id: r.id,
				text: clipSearchText(r.content, q),
				context: `${r.group_name} · ${r.done ? 'Done' : r.in_progress ? 'In progress' : 'Open'}`,
				at: r.at
			})),
			...principles.map((r) => ({
				kind: 'principle' as const,
				id: r.id,
				text: clipSearchText(r.content, q),
				context: '',
				at: r.at
			})),
			...holdingRows.map((r) => ({
				kind: 'holding' as const,
				id: r.ticker,
				text: r.ticker,
				context: `Holding · ${r.category}`,
				at: r.at
			})),
			...orgRows.map((r) => ({
				kind: 'trading' as const,
				id: `${r.id}|`,
				text: r.name,
				context: 'Trading · venue',
				at: r.at
			})),
			...tradingRows.map((r) => ({
				kind: 'trading' as const,
				id: `${r.org_id}|${r.ticker}`,
				text: r.ticker,
				context: `Trading · ${orgNames.get(r.org_id) ?? r.org_id}`,
				at: r.at
			}))
		];
	}

	function countNotes(): number {
		return (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }).c;
	}

	// --- Time tracker ----------------------------------------------------

	type TimeRow = {
		id: string;
		comment: string;
		started_at: number;
		ended_at: number | null;
		created_at: number;
		updated_at: number;
	};

	function tagsByTimeEntry(rows: { id: string }[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		if (rows.length === 0) return map;
		const ids = [...new Set(rows.map((r) => r.id))];
		const placeholders = ids.map(() => '?').join(',');
		const found = db
			.prepare(`SELECT entry_id, tag FROM time_entry_tags WHERE entry_id IN (${placeholders}) ORDER BY tag`)
			.all(...ids) as unknown as { entry_id: string; tag: string }[];
		for (const f of found) {
			const list = map.get(f.entry_id);
			if (list) list.push(f.tag);
			else map.set(f.entry_id, [f.tag]);
		}
		return map;
	}

	function rowToTimeEntry(r: TimeRow, tags: string[] = []): TimeEntry {
		return {
			id: r.id,
			comment: r.comment ?? '',
			tags,
			startedAt: r.started_at,
			endedAt: r.ended_at ?? null,
			createdAt: r.created_at,
			updatedAt: r.updated_at
		};
	}

	function setTimeEntryTags(entryId: string, tags: string[]): void {
		db.prepare('DELETE FROM time_entry_tags WHERE entry_id = ?').run(entryId);
		if (tags.length === 0) return;
		const ins = db.prepare('INSERT OR IGNORE INTO time_entry_tags (entry_id, tag) VALUES (?, ?)');
		for (const t of tags) ins.run(entryId, t);
	}

	function getRunningTimeEntry(): TimeEntry | null {
		const r = db
			.prepare(
				'SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE ended_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1'
			)
			.get() as unknown as TimeRow | undefined;
		if (!r) return null;
		const tags = tagsByTimeEntry([r]).get(r.id) ?? [];
		return rowToTimeEntry(r, tags);
	}

	function listTimeEntries(limit = 100): TimeEntry[] {
		const cap = Math.max(1, Math.min(500, Math.trunc(limit) || 100));
		const rows = db
			.prepare(
				`SELECT id, comment, started_at, ended_at, created_at, updated_at
				 FROM time_entries
				 ORDER BY CASE WHEN ended_at IS NULL THEN 0 ELSE 1 END, started_at DESC, id DESC
				 LIMIT ?`
			)
			.all(cap) as unknown as TimeRow[];
		const tagMap = tagsByTimeEntry(rows);
		return rows.map((r) => rowToTimeEntry(r, tagMap.get(r.id) ?? []));
	}

	/** Entries that carry one tag, running first. Same order as
	 *  `listTimeEntries`, so a live timer leads the list. */
	function listTimeEntriesByTag(tag: unknown, limit = 200): TimeEntry[] {
		const clean = String(tag ?? '').trim().toLowerCase().slice(0, 60);
		if (!clean) return [];
		const cap = Math.max(1, Math.min(500, Math.trunc(limit) || 200));
		const rows = db
			.prepare(
				`SELECT e.id, e.comment, e.started_at, e.ended_at, e.created_at, e.updated_at
				 FROM time_entries e
				 JOIN time_entry_tags t ON t.entry_id = e.id
				 WHERE t.tag = ?
				 ORDER BY CASE WHEN e.ended_at IS NULL THEN 0 ELSE 1 END, e.started_at DESC, e.id DESC
				 LIMIT ?`
			)
			.all(clean, cap) as unknown as TimeRow[];
		const tagMap = tagsByTimeEntry(rows);
		return rows.map((r) => rowToTimeEntry(r, tagMap.get(r.id) ?? []));
	}

	/** Rewrite the comment and tags of one entry, running or stopped. The tags
	 *  come from the hashtags anywhere in `comment`, the same rule as start. */
	function updateTimeEntry(
		id: unknown,
		comment: unknown
	): { ok: true; entry: TimeEntry } | { ok: false; error: string } {
		const want = typeof id === 'string' ? id.trim() : '';
		if (!want) return { ok: false, error: 'Missing id.' };
		const row = db
			.prepare('SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE id = ?')
			.get(want) as unknown as TimeRow | undefined;
		if (!row) return { ok: false, error: 'Time entry not found.' };
		const raw = String(comment ?? '').trim().slice(0, 500);
		const split = splitHashtags(raw);
		const text = split.content.slice(0, 500);
		const now = Date.now();
		db.transaction(() => {
			db.prepare('UPDATE time_entries SET comment = ?, updated_at = ? WHERE id = ?').run(text, now, row.id);
			setTimeEntryTags(row.id, split.tags);
		});
		const updated = db
			.prepare('SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE id = ?')
			.get(row.id) as unknown as TimeRow;
		return { ok: true, entry: rowToTimeEntry(updated, split.tags) };
	}

	function startTimeEntry(comment: unknown, startedAt?: unknown): { ok: true; entry: TimeEntry } | { ok: false; error: string } {
		if (getRunningTimeEntry()) return { ok: false, error: 'A timer is already running.' };
		const now = Date.now();
		const at = typeof startedAt === 'number' && Number.isFinite(startedAt) ? Math.trunc(startedAt) : now;
		const raw = String(comment ?? '').trim().slice(0, 500);
		const split = splitHashtags(raw);
		const text = split.content.slice(0, 500);
		const tags = split.tags;
		const id = crypto.randomUUID();
		db.transaction(() => {
			db.prepare(
				'INSERT INTO time_entries (id, comment, started_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)'
			).run(id, text, at, now, now);
			setTimeEntryTags(id, tags);
		});
		const entry = db
			.prepare('SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE id = ?')
			.get(id) as unknown as TimeRow;
		return { ok: true, entry: rowToTimeEntry(entry, tags) };
	}

	function stopTimeEntry(id?: unknown, endedAt?: unknown): { ok: true; entry: TimeEntry } | { ok: false; error: string } {
		const want = typeof id === 'string' ? id.trim() : '';
		const running = want
			? (db
					.prepare(
						'SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE id = ?'
					)
					.get(want) as unknown as TimeRow | undefined)
			: (db
					.prepare(
						'SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE ended_at IS NULL ORDER BY started_at DESC, id DESC LIMIT 1'
					)
					.get() as unknown as TimeRow | undefined);
		if (!running) return { ok: false, error: 'No running timer.' };
		if (running.ended_at !== null) return { ok: false, error: 'This timer is not running.' };
		const now = Date.now();
		const at = typeof endedAt === 'number' && Number.isFinite(endedAt) ? Math.trunc(endedAt) : now;
		const end = Math.max(at, running.started_at);
		db.prepare('UPDATE time_entries SET ended_at = ?, updated_at = ? WHERE id = ?').run(end, now, running.id);
		const entry = db
			.prepare('SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE id = ?')
			.get(running.id) as unknown as TimeRow;
		const tags = tagsByTimeEntry([entry]).get(entry.id) ?? [];
		return { ok: true, entry: rowToTimeEntry(entry, tags) };
	}

	/** Delete one entry, running or stopped. Tag rows go with it. */
	function deleteTimeEntry(id: unknown): { ok: true; entry: TimeEntry } | { ok: false; error: string } {
		const want = typeof id === 'string' ? id.trim() : '';
		if (!want) return { ok: false, error: 'Missing id.' };
		const row = db
			.prepare('SELECT id, comment, started_at, ended_at, created_at, updated_at FROM time_entries WHERE id = ?')
			.get(want) as unknown as TimeRow | undefined;
		if (!row) return { ok: false, error: 'Time entry not found.' };
		const tags = tagsByTimeEntry([row]).get(row.id) ?? [];
		db.transaction(() => {
			db.prepare('DELETE FROM time_entry_tags WHERE entry_id = ?').run(row.id);
			db.prepare('DELETE FROM time_entries WHERE id = ?').run(row.id);
		});
		return { ok: true, entry: rowToTimeEntry(row, tags) };
	}

	function startOfDayLocal(ms: number): number {
		const d = new Date(ms);
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	}

	function addDays(ms: number, days: number): number {
		const d = new Date(ms);
		d.setDate(d.getDate() + days);
		return d.getTime();
	}

	function addMonths(ms: number, months: number): number {
		const d = new Date(ms);
		d.setMonth(d.getMonth() + months);
		return d.getTime();
	}

	function getTimeTrackerStats(periodInput: unknown, atInput?: unknown): TimeTrackerStats {
		const period: 'month' | 'week' | 'year' =
			periodInput === 'week' || periodInput === 'year' ? periodInput : 'month';
		const at =
			typeof atInput === 'number' && Number.isFinite(atInput)
				? atInput
				: typeof atInput === 'string' && atInput
					? Date.parse(atInput)
					: NaN;
		const base = Number.isFinite(at) ? at : Date.now();
		const now = Date.now();
		let start = 0;
		let end = 0;
		let label = '';
		const buckets: { key: string; label: string; start: number; end: number }[] = [];

		if (period === 'month') {
			const d = new Date(base);
			d.setDate(1);
			d.setHours(0, 0, 0, 0);
			start = d.getTime();
			end = addMonths(start, 1);
			label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
			const days = Math.round((end - start) / 86400000);
			for (let i = 0; i < days; i++) {
				const bs = addDays(start, i);
				const be = addDays(start, i + 1);
				const bd = new Date(bs);
				buckets.push({
					key: `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`,
					label: String(bd.getDate()),
					start: bs,
					end: be
				});
			}
		} else if (period === 'week') {
			const dayStart = startOfDayLocal(base);
			const wd = new Date(dayStart).getDay(); // 0 Sun
			const diff = (wd + 6) % 7; // Monday start
			start = addDays(dayStart, -diff);
			end = addDays(start, 7);
			const endLabel = addDays(end, -1);
			label = `${new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(endLabel).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
			const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
			for (let i = 0; i < 7; i++) {
				const bs = addDays(start, i);
				buckets.push({ key: String(i), label: names[i], start: bs, end: addDays(bs, 1) });
			}
		} else {
			const d = new Date(base);
			d.setMonth(0, 1);
			d.setHours(0, 0, 0, 0);
			start = d.getTime();
			end = addMonths(start, 12);
			label = String(d.getFullYear());
			const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			for (let i = 0; i < 12; i++) {
				const bs = addMonths(start, i);
				buckets.push({ key: String(i), label: names[i], start: bs, end: addMonths(start, i + 1) });
			}
		}

		const rows = db
			.prepare(
				`SELECT id, comment, started_at, ended_at, created_at, updated_at
				 FROM time_entries
				 WHERE started_at < ? AND (ended_at IS NULL OR ended_at > ?)`
			)
			.all(end, start) as unknown as TimeRow[];
		const tagMap = tagsByTimeEntry(rows);
		const bucketAgg = buckets.map(() => new Map<string, number>());
		const usedTags = new Set<string>();

		for (const r of rows) {
			const s = Math.max(r.started_at, start);
			const e = Math.min(r.ended_at ?? now, end);
			if (e <= s) continue;
			const tags = tagMap.get(r.id) ?? [];
			const primary = tags[0] ?? '';
			if (primary) usedTags.add(primary);
			for (let i = 0; i < buckets.length; i++) {
				const b = buckets[i];
				const os = Math.max(s, b.start);
				const oe = Math.min(e, b.end);
				if (oe <= os) continue;
				const m = bucketAgg[i];
				m.set(primary, (m.get(primary) ?? 0) + (oe - os));
			}
		}

		const outBuckets: TimeStatsBucket[] = buckets.map((b, i) => {
			const m = bucketAgg[i];
			const segments = [...m.entries()]
				.map(([tag, ms]) => ({ tag, ms }))
				.sort((a, b) => b.ms - a.ms || a.tag.localeCompare(b.tag));
			const totalMs = segments.reduce((sum, s) => sum + s.ms, 0);
			return { ...b, totalMs, segments };
		});

		return { period, start, end, label, buckets: outBuckets, tags: [...usedTags].sort() };
	}

	return {
		db,
		Schema: SCHEMA,
		createNote,
		deleteNote,
		updateNote,
		getNote,
		listNotesPage,
		listNotesLinkingTo,
		countNotesByTag,
		setNoteTags,
		removeNoteTag,
		setNoteFeatured,
		setNotePublished,
		setNoteCover,
		removeNoteCover,
		getNotePhoto,
		setNoteVideo,
		setNoteTitle,
		searchJournal,
		countNotes,
		getRunningTimeEntry,
		listTimeEntries,
		listTimeEntriesByTag,
		updateTimeEntry,
		startTimeEntry,
		stopTimeEntry,
		deleteTimeEntry,
		getTimeTrackerStats,
		getPublicConfig,
		setPublicConfig,
		getAdminConfig,
		setAdminConfig,
		listBooks,
		getBook,
		getBookBytes,
		addBook,
		setBookPosition,
		deleteBook,
		listBookNotes,
		createBookNote,
		updateBookNote,
		deleteBookNote,
		getApiCredentialStatus,
		setApiCredential,
		deleteApiCredential,
		getNostrProfile,
		setNostrProfile,
		deleteNostrProfile,
		listNostrEvents,
		addNostrEvent,
		getNostrStats,
		getNostrHeatmap,
		listTodoGroups,
		createTodoGroup,
		renameTodoGroup,
		deleteTodoGroup,
		setTodoGroupOrder,
		listTodoItems,
		getTodoItem,
		createTodoItem,
		setTodoItemPhoto,
		removeTodoItemPhoto,
		getTodoItemPhoto,
		updateTodoItem,
		deleteTodoItem,
		setTodoItemTags,
		listTodoItemsByTag,
		setTodoItemOrder,
		listInProgressItems,
		listDoneItems,
		listTaskComments,
		createTaskComment,
		updateTaskComment,
		deleteTaskComment,
		listNoteComments,
		createNoteComment,
		updateNoteComment,
		deleteNoteComment,
		listPrinciples,
		getPrinciple,
		createPrinciple,
		updatePrinciple,
		deletePrinciple,
		setPrincipleOrder,
		setPrincipleVideo,
		listPrinciplesByTag,
		setPrincipleTags,
		listPrincipleComments,
		createPrincipleComment,
		updatePrincipleComment,
		deletePrincipleComment,
		listHoldings,
		createHolding,
		updateHolding,
		deleteHolding,
		listHoldingActions,
		listTradeHistory,
		recordHoldingAction,
		getHoldingsSummary,
		getCategoryGoals,
		setHoldingsGoals,
		listHoldingValueHistory,
		listPortfolioValueHistory,
		refreshRates,
		listStockItems,
		getStockItem,
		createStockItem,
		updateStockItem,
		deleteStockItem,
		setStockItemPhoto,
		getStockItemPhoto,
		addStockPhotos,
		removeStockPhotos,
		getStockPhoto,
		listStockActions,
		recordStockConsume,
		getStockGoals,
		setStockGoals,
		listStockCategoryGoals,
		setStockCategoryGoals,
		listStockRegistries,
		setStockCategory,
		deleteStockGroup,
		listShoppingExtras,
		addShoppingExtra,
		removeShoppingExtra,
		listQuoteFetchLog,
		listTradingOrgs,
		updateTradingOrg,
		listTradingOrders,
		createTradingOrder,
		deleteTradingOrder,
		updateTradingOrder,
		setTradingTarget,
		refreshTradingQuotes,
		refreshTickerQuote,
		getTradingSummary,
		getTradingStrip,
		getTradingQuoteHistory,
		getRipioQuote,
		getGlobalBtcQuote,
		refreshMarket,
		listB3Tickers,
		addB3Ticker,
		listTagColors,
		listTagCounts,
		listPublicTagCounts,
		countPublishedNotesByTag,
		setTagColor
	};
}

export type Journal = ReturnType<typeof createJournal>;
