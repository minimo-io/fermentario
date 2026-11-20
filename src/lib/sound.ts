/** WebAudio ping for attention toasts — two short rising beeps, no files.
 *
 *  Only the global `Toasts` mount calls this; callers ask for sound through
 *  `showToast(text, tone, true)`. Browsers with an autoplay policy (iOS/
 *  Safari) keep a fresh `AudioContext` suspended until the page sees a user
 *  gesture, so the first pointerdown/keydown unlocks it here. Before any
 *  interaction the toast still shows and the ping fails silently. */

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	try {
		ctx ??= new AudioContext();
		if (ctx.state === 'suspended') void ctx.resume();
		return ctx;
	} catch {
		return null;
	}
}

function beeps(notes: [number, number][], length: number, peak: number): void {
	const ac = ensureCtx();
	if (!ac || ac.state !== 'running') return;
	const t = ac.currentTime;
	for (const [freq, at] of notes) {
		const osc = ac.createOscillator();
		const gain = ac.createGain();
		osc.type = 'sine';
		osc.frequency.value = freq;
		gain.gain.setValueAtTime(0.0001, t + at);
		gain.gain.exponentialRampToValueAtTime(peak, t + at + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + at + length);
		osc.connect(gain);
		gain.connect(ac.destination);
		osc.start(t + at);
		osc.stop(t + at + length + 0.02);
	}
}

export function playPing(): void {
	beeps(
		[
			[880, 0],
			[1320, 0.18]
		],
		0.16,
		0.2
	);
}

/** Time-tracker interval alert — three rising notes, longer than the toast ping. */
export function playChime(): void {
	beeps(
		[
			[660, 0],
			[880, 0.24],
			[1100, 0.48]
		],
		0.22,
		0.18
	);
}

// Unlock on the first gesture so later background alerts can sound.
if (typeof window !== 'undefined') {
	const unlock = () => void ensureCtx();
	window.addEventListener('pointerdown', unlock, { once: true, capture: true });
	window.addEventListener('keydown', unlock, { once: true, capture: true });
}
