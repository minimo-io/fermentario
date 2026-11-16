import type { Component } from 'svelte';
import Timer from '@lucide/svelte/icons/timer';

export interface MiniAppDef {
	id: string;
	label: string;
	description: string;
	href: string;
	icon: Component;
}

type Usage = { count: number; lastUsedAt: number };

const USAGE_KEY = 'fermentario.miniAppsUsage';

function readUsage(): Record<string, Usage> {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(USAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, Usage>;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

function writeUsage(value: Record<string, Usage>) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(USAGE_KEY, JSON.stringify(value));
	} catch {}
}

export const MINI_APPS: MiniAppDef[] = [
	{
		id: 'time-tracker',
		label: 'Time tracker',
		description: 'Measure time spent on tasks.',
		href: '/admin/time-tracker',
		icon: Timer
	}
];

class MiniAppsStore {
	open = $state(false);
	usage = $state<Record<string, Usage>>({});

	loadUsage() {
		this.usage = readUsage();
	}

	recordUse(id: string) {
		const prev = this.usage[id] ?? { count: 0, lastUsedAt: 0 };
		const next = {
			...this.usage,
			[id]: { count: prev.count + 1, lastUsedAt: Date.now() }
		};
		this.usage = next;
		writeUsage(next);
	}

	latestUsedId(): string | null {
		let best: string | null = null;
		let at = 0;
		for (const [id, u] of Object.entries(this.usage)) {
			if (u.lastUsedAt > at) {
				at = u.lastUsedAt;
				best = id;
			}
		}
		return best;
	}

	orderedApps(): MiniAppDef[] {
		const usage = this.usage;
		return [...MINI_APPS].sort((a, b) => {
			const au = usage[a.id];
			const bu = usage[b.id];
			const ac = au?.count ?? 0;
			const bc = bu?.count ?? 0;
			if (bc !== ac) return bc - ac;
			const al = au?.lastUsedAt ?? 0;
			const bl = bu?.lastUsedAt ?? 0;
			if (bl !== al) return bl - al;
			return a.label.localeCompare(b.label);
		});
	}

	openModal() {
		this.loadUsage();
		this.open = true;
	}

	closeModal() {
		this.open = false;
	}
}

export const miniApps = new MiniAppsStore();
