import { durableAge, type AgeLang, type DurableAge } from './age';
import { dayLocale } from './dates';
import type { StockItem, StockItemPhoto } from './types';

/** Amount one item adds to a category goal, converted into the goal unit.
 *  Mass (`g`, `kg`) feeds gram/kilogram goals; volume (`ml`, `l`) feeds
 *  millilitre/litre goals. Null when the item has no package size or its
 *  unit belongs to the other family, so the caller can count it as skipped. */
export function stockGoalAmount(item: StockItem, goalUnit: string): number | null {
	const perPackage = stockPackageAmount(item, goalUnit);
	if (perPackage === null || item.quantity <= 0) return null;
	return perPackage * item.quantity;
}

/** Amount of a single package in the goal unit; null when the item has no
 *  package size or its unit belongs to the other family. */
export function stockPackageAmount(item: StockItem, goalUnit: string): number | null {
	if (item.package_size <= 0) return null;
	const total = item.package_size;
	const unit = (item.package_unit || 'g').toLowerCase();
	const goal = (goalUnit || 'g').toLowerCase();
	const mass = unit === 'g' || unit === 'kg';
	const volume = unit === 'ml' || unit === 'l';
	const goalMass = goal === 'g' || goal === 'kg';
	const goalVolume = goal === 'ml' || goal === 'l';
	if (goalMass && mass) {
		const grams = unit === 'kg' ? total * 1000 : total;
		return goal === 'kg' ? grams / 1000 : grams;
	}
	if (goalVolume && volume) {
		const ml = unit === 'l' ? total * 1000 : total;
		return goal === 'l' ? ml / 1000 : ml;
	}
	return null;
}

/** Family of a package or goal unit: mass (`g`, `kg`) or volume (`ml`, `l`). */
export function stockUnitFamily(unit: string): 'mass' | 'volume' | null {
	const u = (unit || '').toLowerCase();
	if (u === 'g' || u === 'kg') return 'mass';
	if (u === 'ml' || u === 'l') return 'volume';
	return null;
}

/** Display unit: litres use an uppercase L; everything else is verbatim. */
export function stockUnit(item: StockItem): string {
	return item.package_unit === 'l' ? 'L' : item.package_unit || 'g';
}

export function stockTotalSize(item: StockItem): number {
	return item.package_size > 0 ? item.package_size * item.quantity : 0;
}

/** Plain quantity with a unit; grams and millilitres stay whole. */
export function fmtQty(v: number, unit: string): string {
	const digits = unit === 'g' || unit === 'ml' ? 0 : 2;
	return `${v.toLocaleString('en-US', { maximumFractionDigits: digits })} ${unit}`;
}

export function fmtStockDate(at: number | null, lang: string): string {
	if (at === null) return '';
	return new Date(at).toLocaleDateString(dayLocale(lang), {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

/** Status word and highlighted time span, for the split-colour age. */
export function stockAgeParts(item: StockItem, lang: string, now = Date.now()): DurableAge | null {
	if (item.bought_at === null) return null;
	const l: AgeLang = lang === 'es' || lang === 'pt' ? lang : 'en';
	return durableAge(item.bought_at, item.ended_at, l, now);
}

export function stockPhotoUrl(photo: StockItemPhoto): string {
	return `/api/stocks/photos/${photo.id}?v=${photo.created_at}`;
}

export type StockExpiry = 'expired' | 'soon' | null;

/** Expiration state of a consumable: expired (before today), soon
 *  (within 30 days, today counts), or null when unset or later. */
export function stockExpiry(item: StockItem, now = Date.now()): StockExpiry {
	if (item.expires_at === null) return null;
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	const today = start.getTime();
	if (item.expires_at < today) return 'expired';
	const limit = new Date(today);
	limit.setDate(limit.getDate() + 30);
	return item.expires_at <= limit.getTime() ? 'soon' : null;
}

/** Whole days from today until the item expires. */
export function stockExpiryDays(item: StockItem, now = Date.now()): number | null {
	if (item.expires_at === null) return null;
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	return Math.ceil((item.expires_at - start.getTime()) / (24 * 60 * 60 * 1000));
}

/** Title for an item without a name: brand, then category, then a fallback. */
export function stockDisplayTitle(item: StockItem): string {
	return item.name || item.brand || item.category || 'Consumable';
}
