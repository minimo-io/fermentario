export type SpeechEvents = {
	interim: (text: string) => void;
	final: (text: string) => void;
	end: () => void;
	error: (message: string) => void;
};

export interface SpeechHandle {
	start: () => void;
	stop: () => void;
	abort: () => void;
	supported: boolean;
}

export function createSpeech(events: SpeechEvents, lang = 'en-US'): SpeechHandle {
	const SR = (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;
	let rec: any = null;
	let final: string = '';

	if (!SR) {
		return {
			supported: false,
			start: () => {},
			stop: () => {},
			abort: () => {}
		};
	}

	const newRec = () => {
		const r = new SR();
		r.continuous = true;
		r.interimResults = true;
		r.lang = lang;
		r.onresult = (e: any) => {
			let interim = '';
			for (let i = e.resultIndex; i < e.results.length; i++) {
				const res = e.results[i];
				if (res.isFinal) final += res[0].transcript;
				else interim += res[0].transcript;
			}
			events.interim((final + interim).trim());
			if (final) events.final(final.trim());
		};
		r.onerror = (e: any) => {
			if (e.error === 'not-allowed') events.error('Microphone permission denied.');
			else if (e.error === 'no-speech') events.error('No speech heard. Try again.');
			else events.error(e.error);
		};
		r.onend = () => {
			rec = null;
			events.end();
		};
		return r;
	};

	return {
		supported: true,
		start() {
			final = '';
			rec = newRec();
			try {
				rec.start();
			} catch {
				rec = newRec();
				rec.start();
			}
		},
		stop() {
			if (rec) {
				rec.stop();
				rec = null;
			}
		},
		abort() {
			if (rec) {
				rec.abort();
				rec = null;
			}
		}
	};
}

export async function requestMicPermission(): Promise<boolean> {
	if (!navigator.mediaDevices?.getUserMedia) return false;
	try {
		const s = await navigator.mediaDevices.getUserMedia({ audio: true });
		s.getTracks().forEach((t) => t.stop());
		return true;
	} catch {
		return false;
	}
}

export function browserSupportsSpeech(): boolean {
	const SR = (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;
	return !!SR;
}
/** @deprecated alias kept for callers that used the old name. */
export function supportsSpeech(): boolean {
	return browserSupportsSpeech();
}
