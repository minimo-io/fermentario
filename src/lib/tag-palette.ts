/** The tag palette. Keys are stored in `tag_colors`; full class strings live
 *  here as literals so Tailwind detects them. Default is subtle gray: an
 *  uncolored tag reads exactly as before. */
export const TAG_PALETTE = {
	gray: { chip: 'bg-stone-100 text-stone-500 hover:bg-stone-200', dot: 'bg-stone-300', label: 'Gray' },
	amber: { chip: 'bg-amber-100 text-amber-800 hover:bg-amber-200', dot: 'bg-amber-300', label: 'Amber' },
	emerald: { chip: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200', dot: 'bg-emerald-300', label: 'Green' },
	sky: { chip: 'bg-sky-100 text-sky-800 hover:bg-sky-200', dot: 'bg-sky-300', label: 'Blue' },
	rose: { chip: 'bg-rose-100 text-rose-800 hover:bg-rose-200', dot: 'bg-rose-300', label: 'Rose' },
	violet: { chip: 'bg-violet-100 text-violet-800 hover:bg-violet-200', dot: 'bg-violet-300', label: 'Violet' }
} as const;

export type TagColorKey = keyof typeof TAG_PALETTE;
export const DEFAULT_TAG_COLOR: TagColorKey = 'gray';

export function isTagColorKey(v: unknown): v is TagColorKey {
	return typeof v === 'string' && v in TAG_PALETTE;
}
