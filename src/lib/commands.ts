/** Commands are actions that run from the search palette. The code is the
 *  command's identity: it is what the user types and what the palette matches.
 *  `:` enters command mode, like a vim command line; a bare exact code also
 *  finds its command in normal search. Add a command here and the help dialog
 *  lists it. */

import type { Component } from 'svelte';
import { goto } from '$app/navigation';
import { dev } from '$app/environment';
import House from '@lucide/svelte/icons/house';
import NotebookPen from '@lucide/svelte/icons/notebook-pen';
import NotebookText from '@lucide/svelte/icons/notebook-text';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import CircleHelp from '@lucide/svelte/icons/circle-help';
import LayoutGrid from '@lucide/svelte/icons/layout-grid';
import { newNote } from '$lib/new-note.svelte';
import { help } from '$lib/help.svelte';
import { miniApps } from '$lib/mini-apps.svelte';
import { devNetwork } from '$lib/dev-network.svelte';
import QrCode from '@lucide/svelte/icons/qr-code';
import KeyRound from '@lucide/svelte/icons/key-round';
import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
import { vault } from '$lib/vault.svelte';

export interface CommandDef {
	/** Lowercase, unique, at least two characters. This is the execution key. */
	code: string;
	label: string;
	description: string;
	/** Extra words that should find the command. */
	keywords?: string[];
	/** Alternative codes that run the same command. */
	aliases?: string[];
	icon: Component;
	run: () => void | Promise<void>;
}

export const COMMANDS: CommandDef[] = [
	{
		code: 'vault',
		label: 'Open password vault',
		description: 'Open the KeePass password vault.',
		keywords: ['password', 'keepass', 'kdbx'],
		icon: KeyRound,
		run: () => vault.openModal()
	},
	{
		code: 'lock',
		label: 'Lock password vault',
		description: 'Lock the open KeePass database.',
		keywords: ['password', 'keepass', 'close'],
		icon: LockKeyhole,
		run: () => vault.lock()
	},
	...(dev
		? [
				{
					code: 'qrcode',
					aliases: ['qr'],
					label: 'Show dev QR code',
					description: 'Show a QR code and addresses for opening this dev server on another device.',
					keywords: ['network', 'phone', 'mobile', 'lan', 'tailscale'],
					icon: QrCode,
					run: () => devNetwork.openModal()
				}
			]
		: []),
	{
		code: 'help',
		label: 'Help',
		description: 'Open help, shortcuts and commands.',
		keywords: ['shortcuts', 'commands', 'guide'],
		icon: CircleHelp,
		run: () => help.openModal()
	},
	{
		code: 'miniapps',
		aliases: ['ma'],
		label: 'Mini apps',
		description: 'Open the mini apps picker.',
		keywords: ['apps', 'tools', 'timer'],
		icon: LayoutGrid,
		run: () => miniApps.openModal()
	},
	{
		code: 'note',
		label: 'New note',
		description: 'Write a note in the journal from any page.',
		keywords: ['write', 'create', 'capture', 'journal', 'add'],
		icon: NotebookPen,
		run: () => newNote.openModal()
	},
	{
		code: 'home',
		label: 'Home',
		description: 'Go to the public homepage.',
		keywords: ['start', 'front', 'root'],
		icon: House,
		run: () => goto('/')
	},
	{
		code: 'dash',
		label: 'Dashboard',
		description: 'Open the admin dashboard.',
		keywords: ['admin', 'dashboard', 'notes'],
		icon: LayoutDashboard,
		run: () => goto('/admin')
	},
	{
		code: 'notes',
		label: 'Notes',
		description: 'Open the notes timeline.',
		keywords: ['journal', 'timeline'],
		icon: NotebookText,
		run: () => goto('/admin/notes')
	}
];

const CODE = /^[a-z][a-z0-9-]+$/;
const seen = new Set<string>();
for (const command of COMMANDS) {
	for (const code of [command.code, ...(command.aliases ?? [])]) {
		if (!CODE.test(code)) {
			throw new Error(`Command code "${code}" must be lowercase, at least 2 characters.`);
		}
		if (seen.has(code)) {
			throw new Error(`Duplicate command code "${code}".`);
		}
		seen.add(code);
	}
}

function score(command: CommandDef, query: string): number | null {
	const code = command.code.toLowerCase();
	if (code === query) return 0;
	if (code.startsWith(query)) return 1;
	const aliases = command.aliases ?? [];
	if (aliases.some((alias) => alias === query)) return 0;
	if (aliases.some((alias) => alias.startsWith(query))) return 1;
	const label = command.label.toLowerCase();
	if (label === query) return 2;
	if (label.startsWith(query)) return 3;
	if (label.includes(query)) return 4;
	if (command.description.toLowerCase().includes(query)) return 5;
	if (command.keywords?.some((keyword) => keyword.toLowerCase().includes(query))) return 6;
	return null;
}

/** Full command search for explicit `:` mode. Codes rank above labels. */
export function filterCommands(query: string): CommandDef[] {
	const q = query.trim().toLowerCase();
	if (!q) return COMMANDS;
	return COMMANDS.map((command) => ({ command, rank: score(command, q) }))
		.filter((row): row is { command: CommandDef; rank: number } => row.rank !== null)
		.sort((a, b) => a.rank - b.rank)
		.map((row) => row.command);
}

/** Bare search only runs a command when the whole query is its code. Prefix
 *  matching stays in `:` mode, so an ordinary word cannot run a command. */
export function commandCodeMatches(query: string): CommandDef[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return COMMANDS.filter((command) => command.code === q || command.aliases?.includes(q));
}
