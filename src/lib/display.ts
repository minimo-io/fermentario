/** The main-column width on desktop. `standard` is today's `max-w-2xl`;
 *  the page containers and the composer bar all follow this one value so the
 *  bar and the content always align. */

export type ContentWidth = 'narrow' | 'standard' | 'wide';

export const CONTENT_WIDTHS: Record<ContentWidth, string> = {
	narrow: 'max-w-xl',
	standard: 'max-w-2xl',
	wide: 'max-w-4xl'
};

export const CONTENT_WIDTH_OPTIONS: { id: ContentWidth; label: string }[] = [
	{ id: 'narrow', label: 'Narrow' },
	{ id: 'standard', label: 'Standard' },
	{ id: 'wide', label: 'Wide' }
];

export const DEFAULT_CONTENT_WIDTH: ContentWidth = 'standard';

export function sanitizeContentWidth(value: unknown): ContentWidth {
	return value === 'narrow' || value === 'wide' ? value : DEFAULT_CONTENT_WIDTH;
}

export function contentWidthClass(value: unknown): string {
	return CONTENT_WIDTHS[sanitizeContentWidth(value)];
}
