export type ToastTone = 'error' | 'success';

/** One toast slot for final action results, shared by every route.
 *
 *  Mounted once in the root layout. Do not use it for progress or background
 *  work; the global loading pill covers waits. `sound: true` asks the global
 *  `Toasts` mount to play the attention ping next to the message — the only
 *  place sounds are ever played, so no caller needs its own audio code. */
class ToastStore {
	current = $state<{ text: string; tone: ToastTone; sound: boolean } | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(text: string, tone: ToastTone = 'error', sound = false) {
		this.current = { text, tone, sound };
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.current = null), tone === 'success' ? 8000 : 4000);
	}
}

export const toast = new ToastStore();

export function showToast(text: string, tone: ToastTone = 'error', sound = false) {
	toast.show(text, tone, sound);
}
