export type SpeechLang = 'en' | 'es' | 'pt';
let activeSpeechStop: (() => void) | null = null;

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
	let final = '';

	if (!SR) {
		return { supported: false, start: () => {}, stop: () => {}, abort: () => {} };
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
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		stream.getTracks().forEach((track) => track.stop());
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

export function preferredSpeechVoiceURI(): string {
	try {
		const raw = localStorage.getItem('fermentario.config');
		if (!raw) return '';
		const value = (JSON.parse(raw) as { voiceURI?: unknown }).voiceURI;
		return typeof value === 'string' ? value : '';
	} catch {
		return '';
	}
}

const LOCALES: Record<SpeechLang, string> = {
	en: 'en-US',
	es: 'es-ES',
	pt: 'pt-PT'
};

export function speechSynthesisAvailable(): boolean {
	return typeof window !== 'undefined' && 'speechSynthesis' in window &&
		typeof window.SpeechSynthesisUtterance === 'function';
}

export function speechUnavailableMessage(lang: SpeechLang): string {
	return {
		en: 'Read aloud is not available in this browser. Try the device or browser accessibility read-aloud feature.',
		es: 'Este navegador no ofrece lectura en voz alta. Prueba la función de lectura de accesibilidad del dispositivo o del navegador.',
		pt: 'Este navegador não oferece leitura em voz alta. Tente o recurso de leitura de acessibilidade do dispositivo ou navegador.'
	}[lang];
}

export function speechStartedMessage(lang: SpeechLang): string {
	return {
		en: 'Reading aloud. Tap Read aloud again to stop.',
		es: 'Leyendo en voz alta. Pulsa Leer en voz alta otra vez para detener.',
		pt: 'Lendo em voz alta. Toque em Ler em voz alta novamente para parar.'
	}[lang];
}

export function speechErrorMessage(code: string, lang: SpeechLang): string {
	const messages: Record<SpeechLang, Record<string, string>> = {
		en: {
			'not-allowed': 'The browser blocked speech. Tap Read aloud again to allow audio.',
			'voice-unavailable': 'The selected system voice is unavailable. Choose another voice in Settings → Voice.',
			'language-unavailable': 'No voice supports this language. Choose another voice in Settings → Voice.',
			'audio-busy': 'The device audio is busy. Try again in a moment.',
			'no-start': 'The browser accepted the request, but the device did not start speaking. Check system speech settings, volume, and audio output.',
			'text-too-long': 'This note is too long for the device voice service. Try a shorter note.',
			'synthesis-failed': 'The device voice service failed to start. Check that speech is enabled in system settings.',
			'network': 'The device voice service needs a network connection, but the request failed.',
			'default': 'The device voice service stopped unexpectedly. Check system speech settings and try again.'
		},
		es: {
			'not-allowed': 'El navegador bloqueó el audio. Pulsa Leer en voz alta otra vez para permitirlo.',
			'voice-unavailable': 'La voz del sistema seleccionada no está disponible. Elige otra en Ajustes → Voz.',
			'language-unavailable': 'No hay una voz para este idioma. Elige otra en Ajustes → Voz.',
			'audio-busy': 'El audio del dispositivo está ocupado. Inténtalo de nuevo en un momento.',
			'no-start': 'El navegador aceptó la solicitud, pero el dispositivo no inició la lectura. Comprueba los ajustes de voz, el volumen y la salida de audio.',
			'text-too-long': 'La nota es demasiado larga para el servicio de voz. Prueba con una nota más corta.',
			'synthesis-failed': 'El servicio de voz del dispositivo no pudo iniciarse. Comprueba que la voz esté activada en los ajustes del sistema.',
			'network': 'El servicio de voz necesita conexión a Internet, pero la solicitud falló.',
			'default': 'El servicio de voz del dispositivo se detuvo. Comprueba los ajustes de voz del sistema e inténtalo de nuevo.'
		},
		pt: {
			'not-allowed': 'O navegador bloqueou o áudio. Toque em Ler em voz alta novamente para permitir.',
			'voice-unavailable': 'A voz do sistema selecionada não está disponível. Escolha outra em Configurações → Voz.',
			'language-unavailable': 'Não há voz para este idioma. Escolha outra em Configurações → Voz.',
			'audio-busy': 'O áudio do dispositivo está ocupado. Tente novamente em instantes.',
			'no-start': 'O navegador aceitou a solicitação, mas o dispositivo não iniciou a leitura. Confira as configurações de voz, o volume e a saída de áudio.',
			'text-too-long': 'A nota é longa demais para o serviço de voz. Tente uma nota mais curta.',
			'synthesis-failed': 'O serviço de voz do dispositivo não iniciou. Confira se a fala está ativada nas configurações do sistema.',
			'network': 'O serviço de voz precisa de conexão, mas a solicitação falhou.',
			'default': 'O serviço de voz do dispositivo parou. Confira as configurações de voz do sistema e tente novamente.'
		}
	};
	return messages[lang][code] ?? messages[lang].default!;
}

/**
 * Start native browser speech from a direct user action. Voice lists can be
 * empty on mobile even when the system can speak, so use the requested locale
 * and let the platform choose its default voice in that case.
 */
export function speakText(
	text: string,
	lang: SpeechLang,
	voiceURI: string,
	onStart: () => void,
	onEnd: () => void,
	onError: (message: string) => void
): (() => void) | string {
	if (!speechSynthesisAvailable()) return speechUnavailableMessage(lang);
	const synth = window.speechSynthesis;
	activeSpeechStop?.();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = LOCALES[lang];
	utterance.rate = 0.98;
	try {
		const voices = synth.getVoices();
		const selected = voices.find((voice) => voice.voiceURI === voiceURI);
		const fallback = voices.find((voice) => voice.lang.toLowerCase().startsWith(`${lang}-`));
		if (selected ?? fallback) utterance.voice = selected ?? fallback!;
	} catch {
		// Some browsers expose speech synthesis but fail while listing voices.
	}
	let started = false;
	const startTimer = setTimeout(() => {
		if (started) return;
		stop();
		onError(speechErrorMessage('no-start', lang));
	}, 12000);
	const finish = () => {
		clearTimeout(startTimer);
		if (activeSpeechStop === stop) activeSpeechStop = null;
	};
	const stop = () => {
		finish();
		synth.cancel();
	};
	activeSpeechStop = stop;
	utterance.onstart = () => {
		started = true;
		clearTimeout(startTimer);
		onStart();
	};
	utterance.onend = () => {
		finish();
		onEnd();
	};
	utterance.onerror = (event) => {
		finish();
		if (event.error === 'canceled' || event.error === 'interrupted') {
			onEnd();
		} else {
			onError(speechErrorMessage(event.error, lang));
		}
	};
	try {
		synth.cancel();
		synth.resume();
		synth.speak(utterance);
	} catch {
		finish();
		return speechErrorMessage('synthesis-failed', lang);
	}
	return stop;
}
