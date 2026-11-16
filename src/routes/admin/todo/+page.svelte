<script lang="ts">
	import TodoTab from '$lib/components/TodoTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
</script>

<TodoTab onError={ctx.onError} lang={ctx.display.lang} widthClass={ctx.display.widthClass} />
