/**
 * Every keyboard shortcut in the app lives here. The help dialog renders this
 * list, so add or change a shortcut here in the same change that wires it.
 *
 * `Mod` renders as ⌘ on Apple and Ctrl elsewhere.
 */

export type Shortcut = {
	keys: string[];
	label: string;
	/** Where the shortcut applies; omitted means everywhere. */
	where?: string;
};

export type ShortcutGroup = { group: string; items: Shortcut[] };

export const SHORTCUTS: ShortcutGroup[] = [
	{
		group: 'Everywhere',
		items: [
			{ keys: ['Mod', 'K'], label: 'Open search' },
			{ keys: ['Mod', 'Shift', 'K'], label: 'Quick note' },
			{ keys: ['Esc'], label: 'Close the open dialog or palette, or leave full screen' }
		]
	},
	{
		group: 'Quick note',
		items: [{ keys: ['E'], label: 'Edit the note from view mode', where: 'Quick note view' }]
	},
	{
		group: 'Search',
		items: [
			{ keys: ['↑', '↓'], label: 'Move between results', where: 'Search' },
			{ keys: ['Enter'], label: 'Open the selected result', where: 'Search' }
		]
	},
	{
		group: 'Admin',
		items: [
			{ keys: ['1', '–', '5'], label: 'Switch section, one digit per section', where: 'Admin' },
			{ keys: ['Mod', 'Shift', 'L'], label: 'Focus the composer', where: 'Notes' },
			{ keys: ['Mod', 'Shift', 'A'], label: 'Add an item', where: 'To-do, Principles, Stocks' },
			{ keys: ['Mod', 'Enter'], label: 'Save the note, comment or item you are editing', where: 'Editors' }
		]
	},
	{
		group: 'Time tracker',
		items: [
			{ keys: ['Enter'], label: 'Start the timer', where: 'Start row' }
		]
	}
];

/** Shortcut tokens for a `Kbd` chip on the current platform. */
export function shortcutKeys(keys: string[], apple: boolean): string[] {
	return keys.map((k) => (k === 'Mod' ? (apple ? '⌘' : 'Ctrl') : k));
}
