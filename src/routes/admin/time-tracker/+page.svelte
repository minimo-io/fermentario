<script lang="ts">
	import TimeTrackerTab from '$lib/components/TimeTrackerTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
</script>

<TimeTrackerTab onError={ctx.onError} widthClass={ctx.display.widthClass} lang={ctx.display.lang} />
