export type ToastTone = 'error' | 'success';

/** One toast slot for final action results, shared by every route.
 *
 *  Mounted once in the root layout. Do not use it for progress or background
 *  work; the global loading pill covers waits. */
class ToastStore {
	current = $state<{ text: string; tone: ToastTone } | null>(null);
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(text: string, tone: ToastTone = 'error') {
		this.current = { text, tone };
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.current = null), tone === 'success' ? 8000 : 4000);
	}
}

export const toast = new ToastStore();

export function showToast(text: string, tone: ToastTone = 'error') {
	toast.show(text, tone);
}
