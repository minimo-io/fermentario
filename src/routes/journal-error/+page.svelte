<script lang="ts">
	import Onboarding from '$lib/components/Onboarding.svelte';
	let { data } = $props();
</script>

<Onboarding mode="error" error={data.error} />
