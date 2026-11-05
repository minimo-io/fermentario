<script lang="ts">
	import { insertTag, loadTagChoices, tagQueryAt } from '$lib/tag-suggest';

	// Self-contained `#tag` finder. Mount it inside a `relative` wrapper next
	// to the textarea and pass the field element. It reads the field directly
	// and writes picks back through a dispatched `input`, so the parent's
	// controlled `value`/`oninput` flow is untouched. Only tokens in the
	// trailing hashtag run open the menu, because only those become tags.
	//
	// Keyboard: no row is selected when the menu opens, so plain Enter keeps
	// the parent behavior (save in the bar, newline in editors). Arrows or a
	// tap opt into selection; Escape closes.
	type Props = {
		textarea: HTMLTextAreaElement | null;
	};
	let { textarea }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let choices = $state<{ tag: string; count: number; create: boolean }[]>([]);
	let sel = $state(-1);
	let loading = $state(false);
	let seq = 0;

	function close() {
		open = false;
		query = '';
		choices = [];
		sel = -1;
		loading = false;
	}

	async function recheck() {
		const el = textarea;
		if (!el) {
			close();
			return;
		}
		const caret = el.selectionStart ?? el.value.length;
		const q = tagQueryAt(el.value, caret);
		if (!q) {
			close();
			return;
		}
		open = true;
		query = q.query;
		sel = -1;
		loading = true;
		const mine = ++seq;
		const all = await loadTagChoices();
		if (mine !== seq) return;
		const matches = all
			.filter((t) => t.tag.startsWith(query))
			.slice(0, 6)
			.map((t) => ({ tag: t.tag, count: t.count, create: false }));
		const exact = query !== '' && all.some((t) => t.tag === query);
		if (query !== '' && !exact) {
			matches.push({ tag: query, count: 0, create: true });
		}
		if (mine !== seq) return;
		choices = matches;
		loading = false;
	}

	function pick(tag: string) {
		const el = textarea;
		if (!el) {
			close();
			return;
		}
		const caret = el.selectionStart ?? el.value.length;
		const next = insertTag(el.value, caret, tag);
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
			sel = choices.length > 0 ? (sel < 0 ? 0 : (sel + 1) % choices.length) : -1;
			return true;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			e.stopPropagation();
			sel = choices.length > 0 ? (sel < 0 ? choices.length - 1 : (sel - 1 + choices.length) % choices.length) : -1;
			return true;
		}
		if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
			const r = sel >= 0 ? choices[sel] : undefined;
			if (!r) return false;
			e.preventDefault();
			e.stopPropagation();
			pick(r.tag);
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
		const onInput = () => void recheck();
		const onClick = () => void recheck();
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') void recheck();
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
		aria-label="Tag suggestions"
	>
		{#if loading && choices.length === 0}
			<p class="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">Loading tags…</p>
		{:else if choices.length === 0}
			<p class="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
				{query === '' ? 'No tags yet — type to create one.' : `No match for #${query}.`}
			</p>
		{:else}
			<ul>
				{#each choices as c, i (c.tag + (c.create ? ':new' : ''))}
					<li>
						<button
							type="button"
							role="option"
							aria-selected={i === sel}
							class="flex w-full items-center gap-2 px-3 py-2 text-left {i === sel ? 'bg-stone-100 dark:bg-stone-800' : ''}"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => pick(c.tag)}
							onmousemove={() => (sel = i)}
						>
							<span class="min-w-0 flex-1 truncate text-sm text-stone-800 dark:text-stone-200">
								{#if c.create}Create #{c.tag}{:else}#{c.tag}{/if}
							</span>
							{#if !c.create}
								<span class="shrink-0 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{c.count}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
