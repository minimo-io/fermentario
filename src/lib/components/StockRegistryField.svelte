<script lang="ts">
	import Info from '@lucide/svelte/icons/info';

	// Brand/category field backed by the dynamic registry. Options are the
	// names already in `stock_registries`; a typed name that is not there is
	// offered as a create row and becomes a registry entry when the item is
	// saved. No row is preselected, so plain Enter still submits the form.
	type Props = {
		id: string;
		label: string;
		value: string;
		options: string[];
		placeholder: string;
		onChange: (value: string) => void;
		onHelp?: () => void;
	};
	let { id, label, value, options, placeholder, onChange, onHelp }: Props = $props();

	let open = $state(false);
	let sel = $state(-1);

	const fieldClass =
		'w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	const query = $derived(value.trim().toLowerCase());
	const matches = $derived(
		options
			.filter((o) => o.toLowerCase().includes(query))
			.slice(0, 6)
	);
	const exact = $derived(options.some((o) => o.toLowerCase() === query));
	const create = $derived(value.trim() !== '' && !exact);
	const choices = $derived([
		...matches.map((name) => ({ name, create: false })),
		...(create ? [{ name: value.trim(), create: true }] : [])
	]);

	function pick(name: string) {
		onChange(name);
		open = false;
		sel = -1;
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			sel = choices.length > 0 ? (sel < 0 ? 0 : (sel + 1) % choices.length) : -1;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			sel = choices.length > 0 ? (sel < 0 ? choices.length - 1 : (sel - 1 + choices.length) % choices.length) : -1;
		} else if (e.key === 'Enter' && sel >= 0) {
			e.preventDefault();
			const c = choices[sel];
			if (c) pick(c.name);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			open = false;
			sel = -1;
		}
	}
</script>

<div>
	<div class="flex items-center gap-1.5">
		<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for={id}>{label}</label>
		{#if onHelp}
			<button
				type="button"
				class="grid h-4 w-4 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="How {label.toLowerCase()} works"
				title="How {label.toLowerCase()} works"
				onclick={onHelp}
			><Info class="h-3.5 w-3.5" /></button>
		{/if}
	</div>
	<div class="relative mt-1">
		<input
			{id}
			class={fieldClass}
			aria-label={label}
			autocomplete="off"
			value={value}
			placeholder={placeholder}
			maxlength="60"
			oninput={(e) => { onChange(e.currentTarget.value); open = true; sel = -1; }}
			onfocus={() => (open = true)}
			onblur={() => { open = false; sel = -1; }}
			onkeydown={onKey}
		/>
		{#if open}
			<div
				class="absolute right-0 left-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xl"
				role="listbox"
				aria-label={label}
			>
				{#if choices.length === 0}
					<p class="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">Type to create a new {label.toLowerCase()}.</p>
				{:else}
					<ul>
						{#each choices as c, i (c.name + (c.create ? ':new' : ''))}
							<li>
								<button
									type="button"
									role="option"
									aria-selected={i === sel}
									class="flex w-full items-center px-3 py-2 text-left text-sm {i === sel ? 'bg-stone-100 dark:bg-stone-800' : ''}"
									onmousedown={(e) => e.preventDefault()}
									onclick={() => pick(c.name)}
									onmousemove={() => (sel = i)}
								>
									<span class="min-w-0 flex-1 truncate text-stone-800 dark:text-stone-200">
										{#if c.create}Create “{c.name}”{:else}{c.name}{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
</div>
