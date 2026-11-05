/** The main sections of the app, in registry order.
 *
 *  The pill bar renders them in the user's persisted order (see
 *  `sanitizeSectionOrder`). Ask is not a section: it is a global
 *  always-present button that opens the Ask view from anywhere. */
import type { Component } from 'svelte';
import NotebookPen from '@lucide/svelte/icons/notebook-pen';
import ListTodo from '@lucide/svelte/icons/list-todo';
import LibraryBig from '@lucide/svelte/icons/library-big';
import Scale from '@lucide/svelte/icons/scale';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import Briefcase from '@lucide/svelte/icons/briefcase';
import Package from '@lucide/svelte/icons/package';

export interface Section {
	id: SectionId;
	label: string;
	icon: Component;
}

export type SectionId = 'notes' | 'todo' | 'library' | 'principles' | 'influences' | 'businesses' | 'stocks';

/** Ask is a view, not a section. */
export type View = SectionId | 'ask';

export const SECTIONS: Section[] = [
	{ id: 'notes', label: 'Notes', icon: NotebookPen },
	{ id: 'todo', label: 'To-Do', icon: ListTodo },
	{ id: 'library', label: 'Library', icon: LibraryBig },
	{ id: 'principles', label: 'Principles', icon: Scale },
	{ id: 'influences', label: 'Influences', icon: Lightbulb },
	{ id: 'businesses', label: 'Businesses', icon: Briefcase },
	{ id: 'stocks', label: 'Stocks', icon: Package }
];

/** Reorderable sections. Businesses and Stocks are fixed on the right and
 *  never join the persisted order. */
export const REORDERABLE_SECTIONS: SectionId[] = ['notes', 'todo', 'library', 'principles', 'influences'];
export const FIXED_SECTIONS: SectionId[] = ['businesses', 'stocks'];

export const DEFAULT_SECTION_ORDER: SectionId[] = REORDERABLE_SECTIONS.slice();

/** Unknown ids are dropped, missing ones appended in registry order.
 *  Fixed sections are excluded: they always render on the right. */
export function sanitizeSectionOrder(value: unknown): SectionId[] {
	const ids = REORDERABLE_SECTIONS;
	const seen = new Set<string>();
	const out: SectionId[] = [];
	if (Array.isArray(value)) {
		for (const x of value) {
			if (typeof x === 'string' && (ids as string[]).includes(x) && !seen.has(x)) {
				seen.add(x);
				out.push(x as SectionId);
			}
		}
	}
	for (const id of ids) if (!seen.has(id)) out.push(id);
	return out;
}
