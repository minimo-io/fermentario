<script lang="ts">
	import { linkQueryAt, insertNoteLink } from '$lib/note-links';
	import type { SearchHit } from '$lib/search';

	// Self-contained `[[` finder. Mount it inside a `relative` wrapper next to
	// the textarea and pass the field element. It reads the field directly and
	// writes picks back through a dispatched `input`, so the parent's
	// controlled `value`/`oninput` flow is untouched.
	//
	// Keyboard: the component handles arrows/Enter/Escape on the field, but a
	// same-node Svelte `onkeydown` (the composer submits on plain Enter) runs
	// first by registration order. Such parents must call `handleKey(e)` as
	// the first line of their own handler and return when it consumes the key.
	type Props = {
		textarea: HTMLTextAreaElement | null;
		excludeId?: string;
	};
	let { textarea, excludeId }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let results = $state<{ id: string; text: string; kind: string }[]>([]);
	let sel = $state(0);
	let searching = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let seq = 0;

	function close() {
		open = false;
		query = '';
		results = [];
		sel = 0;
		searching = false;
	}

	function recheck() {
		const el = textarea;
		if (!el) {
			close();
			return;
		}
		const caret = el.selectionStart ?? el.value.length;
		const q = linkQueryAt(el.value, caret);
		if (!q) {
			close();
			return;
		}
		open = true;
		if (q.query === query) return;
		query = q.query;
		sel = 0;
		clearTimeout(timer);
		if (query.length < 2) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		const mine = ++seq;
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
				if (!res.ok) throw new Error('search failed');
				const d = (await res.json()) as { hits?: SearchHit[] };
				if (mine !== seq) return;
				results = (d.hits ?? [])
					.filter((h) => (h.kind === 'note' || h.kind === 'principle') && h.id !== excludeId)
					.slice(0, 6)
					.map((h) => ({ id: h.id, text: h.text, kind: h.kind }));
			} catch {
				if (mine === seq) results = [];
			} finally {
				if (mine === seq) searching = false;
			}
		}, 150);
	}

	function pick(id: string) {
		const el = textarea;
		if (!el) {
			close();
			return;
		}
		const caret = el.selectionStart ?? el.value.length;
		const next = insertNoteLink(el.value, caret, id);
		el.value = next.value;
		el.setSelectionRange(next.caret, next.caret);
		el.dispatchEvent(new Event('input', { bubbles: true }));
		el.focus();
		close();
	}

	export function handleKey(e: KeyboardEvent): boolean {
		if (!open) return false;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			e.stopPropagation();
			sel = results.length > 0 ? (sel + 1) % results.length : 0;
			return true;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			e.stopPropagation();
			sel = results.length > 0 ? (sel - 1 + results.length) % results.length : 0;
			return true;
		}
		if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
			const r = results[sel];
			if (!r) return false;
			e.preventDefault();
			e.stopPropagation();
			pick(r.id);
			return true;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
			textarea?.focus();
			return true;
		}
		return false;
	}

	$effect(() => {
		const el = textarea;
		if (!el) return;
		const onInput = () => recheck();
		const onClick = () => recheck();
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') recheck();
		};
		const onKeyDown = (e: KeyboardEvent) => {
			handleKey(e);
		};
		const onBlur = () => close();
		el.addEventListener('input', onInput);
		el.addEventListener('click', onClick);
		el.addEventListener('keyup', onKeyUp);
		el.addEventListener('keydown', onKeyDown);
		el.addEventListener('blur', onBlur);
		return () => {
			el.removeEventListener('input', onInput);
			el.removeEventListener('click', onClick);
			el.removeEventListener('keyup', onKeyUp);
			el.removeEventListener('keydown', onKeyDown);
			el.removeEventListener('blur', onBlur);
		};
	});
</script>

{#if open}
	<div
		class="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xl"
		role="listbox"
		aria-label="Link a note"
	>
		{#if query.length < 2}
			<p class="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">Keep typing to search notes…</p>
		{:else if searching && results.length === 0}
			<p class="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">Searching…</p>
		{:else if results.length === 0}
			<p class="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">No notes found.</p>
		{:else}
			<ul>
				{#each results as r, i (r.id)}
					<li>
						<button
							type="button"
							role="option"
							aria-selected={i === sel}
							class="flex w-full items-center gap-2 px-3 py-2 text-left {i === sel ? 'bg-stone-100 dark:bg-stone-800' : ''}"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => pick(r.id)}
							onmousemove={() => (sel = i)}
						>
							<span class="shrink-0 rounded-full bg-stone-200 dark:bg-stone-700 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{r.kind}</span>
							<span class="min-w-0 flex-1 truncate text-sm text-stone-800 dark:text-stone-200">{r.text}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
