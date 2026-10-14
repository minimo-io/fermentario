<script lang="ts">
	import type { Section, SectionId } from '$lib/sections';

	type Props = {
		sections: Section[];
		active: SectionId;
		onSelect: (id: SectionId) => void;
		onReorder: (ids: SectionId[]) => void;
	};
	let { sections, active, onSelect, onReorder }: Props = $props();

	let dragId = $state<SectionId | null>(null);
	let overId = $state<SectionId | null>(null);
	/** Set when a drag committed a reorder: the click that follows a mouse
	 *  drag targets the dragged pill and must not reselect it. */
	let suppressClick = false;

	/** Pending press: touch needs a hold so a horizontal pan still scrolls
	 *  the carousel; the mouse starts dragging immediately. Plain non-reactive
	 *  state — it must not re-trigger any effect. */
	let pending: { id: SectionId; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; el: HTMLElement } | null = null;

	function clearPending() {
		if (pending?.timer) clearTimeout(pending.timer);
		pending = null;
	}

	function beginDrag(el: HTMLElement, id: SectionId) {
		dragId = id;
		overId = id;
		el.style.touchAction = 'none';
		try {
			el.setPointerCapture?.((el as HTMLElement & { __pid?: number }).__pid ?? 0);
		} catch {}
	}

	function endDrag(commit: boolean) {
		if (dragId && commit && overId && overId !== dragId) {
			const ids = sections.map((s) => s.id);
			const from = ids.indexOf(dragId);
			const to = ids.indexOf(overId);
			if (from >= 0 && to >= 0) {
				ids.splice(to, 0, ...ids.splice(from, 1));
				onReorder(ids);
				suppressClick = true;
			}
		}
		if (pending) {
			pending.el.style.touchAction = '';
			clearPending();
		}
		dragId = null;
		overId = null;
	}

	function onDown(e: PointerEvent, id: SectionId) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const el = e.currentTarget as HTMLElement;
		(el as HTMLElement & { __pid?: number }).__pid = e.pointerId;
		if (e.pointerType === 'mouse') {
			beginDrag(el, id);
			return;
		}
		clearPending();
		const startX = e.clientX;
		const startY = e.clientY;
		const timer = setTimeout(() => {
			if (pending) beginDrag(el, id);
		}, 280);
		pending = { id, x: startX, y: startY, timer, el };
	}

	function onMove(e: PointerEvent) {
		if (pending && !dragId) {
			if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 12) clearPending();
			return;
		}
		if (!dragId) return;
		const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-section]');
		const id = t?.getAttribute('data-section') as SectionId | null;
		if (id) overId = id;
	}
</script>

<nav aria-label="Sections" class="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
	{#each sections as s, i (s.id)}
		<button
			type="button"
			role="tab"
			data-section={s.id}
			aria-selected={active === s.id}
			class="inline-flex shrink-0 snap-start items-center rounded-full px-4 py-1.5 text-sm font-medium select-none {active === s.id ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'} {dragId === s.id ? 'opacity-40' : ''} {dragId && overId === s.id && dragId !== s.id ? 'ring-1 ring-stone-900' : ''}"
			style={dragId ? 'touch-action: none' : ''}
			onclick={() => { if (suppressClick) { suppressClick = false; return; } if (!dragId) onSelect(s.id); }}
			onpointerdown={(e) => onDown(e, s.id)}
			onpointermove={onMove}
			onpointerup={() => endDrag(true)}
			onpointercancel={() => endDrag(false)}
		>
			<s.icon class="h-3.5 w-3.5" aria-hidden="true" />
			{s.label}
		</button>
	{/each}
</nav>
