<script lang="ts">
	import { onMount } from 'svelte';
	import { speakText, speechSynthesisAvailable, type SpeechLang } from '$lib/speech';

	type Props = {
		lang: SpeechLang;
		voiceURI: string;
		onVoice: (voiceURI: string) => void;
	};
	let { lang, voiceURI, onVoice }: Props = $props();
	let voices: SpeechSynthesisVoice[] = $state([]);
	let supported = $state(false);
	let message = $state('');
	let playing = $state(false);

	function loadVoices() {
		supported = speechSynthesisAvailable();
		if (!supported) return;
		try {
			voices = window.speechSynthesis.getVoices().slice().sort((a, b) =>
				`${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`)
			);
		} catch {
			voices = [];
		}
	}

	onMount(() => {
		loadVoices();
		if (!supported) return;
		window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
		return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
	});

	function testVoice() {
		message = '';
		playing = false;
		const sample = lang === 'es'
			? 'Esta es una prueba de lectura en voz alta.'
			: lang === 'pt'
				? 'Este é um teste de leitura em voz alta.'
				: 'This is a read aloud voice test.';
		const result = speakText(sample, lang, voiceURI, () => {}, () => (playing = false), (error) => {
			playing = false;
			message = error;
		});
		if (typeof result === 'string') message = result;
		else playing = true;
	}
</script>

<section aria-label="Voice settings" class="space-y-3">
	<div>
		<label for="speech-voice" class="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">System voice</label>
		<select
			id="speech-voice"
			class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 disabled:opacity-50"
			value={voiceURI}
			disabled={!supported || voices.length === 0}
			onchange={(event) => onVoice(event.currentTarget.value)}
		>
			<option value="">Automatic — device default</option>
			{#each voices as voice (voice.voiceURI)}
				<option value={voice.voiceURI}>{voice.name} · {voice.lang}{voice.default ? ' · default' : ''}</option>
			{/each}
		</select>
	</div>
	{#if !supported}
		<p class="text-xs leading-relaxed text-rose-700 dark:text-rose-300">This browser does not provide speech synthesis. Use the device or browser accessibility read-aloud feature.</p>
	{:else if voiceURI && !voices.some((voice) => voice.voiceURI === voiceURI)}
		<p class="text-xs leading-relaxed text-amber-700 dark:text-amber-300">The saved voice is not available on this device. The app will use the device default; choose a new voice when the list loads.</p>
	{:else if voices.length === 0}
		<p class="text-xs leading-relaxed text-amber-700 dark:text-amber-300">The browser has not listed any system voices. The device may still provide a default voice; use Test voice to check.</p>
	{:else}
		<p class="text-xs leading-relaxed text-stone-500 dark:text-stone-400">{voices.length} system {voices.length === 1 ? 'voice' : 'voices'} available. The app uses your device's built-in speech service.</p>
	{/if}
	<div class="flex items-center justify-between gap-3">
		{#if message}<p role="status" class="text-xs leading-relaxed text-rose-700 dark:text-rose-300">{message}</p>{:else}<span aria-live="polite" class="text-xs text-stone-500 dark:text-stone-400">{playing ? 'Playing voice test…' : ''}</span>{/if}
		<button
			type="button"
			class="shrink-0 rounded-full border border-stone-300 dark:border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
			disabled={!supported || playing}
			onclick={testVoice}
		>Test voice</button>
	</div>
</section>
