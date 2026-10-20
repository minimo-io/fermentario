/** The tag palette. Keys are stored in `tag_colors`; full class strings live
 *  here as literals so Tailwind detects them. Default is subtle gray: an
 *  uncolored tag reads exactly as before. */
export const TAG_PALETTE = {
	gray: { chip: 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700', dot: 'bg-stone-300 dark:bg-stone-600', label: 'Gray' },
	amber: { chip: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900', dot: 'bg-amber-300 dark:bg-amber-700', label: 'Amber' },
	emerald: { chip: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-900', dot: 'bg-emerald-300 dark:bg-emerald-700', label: 'Green' },
	sky: { chip: 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 hover:bg-sky-200 dark:hover:bg-sky-900', dot: 'bg-sky-300 dark:bg-sky-700', label: 'Blue' },
	rose: { chip: 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-900', dot: 'bg-rose-300 dark:bg-rose-700', label: 'Rose' },
	violet: { chip: 'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-900', dot: 'bg-violet-300 dark:bg-violet-700', label: 'Violet' }
} as const;

export type TagColorKey = keyof typeof TAG_PALETTE;
export const DEFAULT_TAG_COLOR: TagColorKey = 'gray';

export function isTagColorKey(v: unknown): v is TagColorKey {
	return typeof v === 'string' && v in TAG_PALETTE;
}
