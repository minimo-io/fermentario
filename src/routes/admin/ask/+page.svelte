<script lang="ts">
	import AskTab from '$lib/components/AskTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
	const a = ctx.ask;
</script>

<AskTab
	asks={a.asks}
	lastQuestion={a.lastQuestion}
	answer={a.answer}
	answerSources={a.answerSources}
	answering={a.answering}
	answerStopped={a.answerStopped}
	onDelete={a.onDeleteAsk}
/>
