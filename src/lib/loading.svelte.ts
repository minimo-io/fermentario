import { untrack } from 'svelte';

/** One shared counter for user-facing waits that need the global loader.
 *
 *  Track whole operations (a load or a mutation), never quiet background
 *  work: polling, tag colors, summary refresh and optimistic saves stay out.
 *  Nested entries are safe because only the counter's final zero hides the
 *  loader; `NavigationLoader` owns the delay and the visuals. */
class LoadingStore {
	pending = $state(0);

	async track<T>(work: Promise<T> | (() => Promise<T>)): Promise<T> {
		// Callers often start loads inside $effect. An untracked write keeps
		// that effect from subscribing to `pending` and retriggering itself.
		untrack(() => {
			this.pending += 1;
		});
		try {
			return await (typeof work === 'function' ? work() : work);
		} finally {
			untrack(() => {
				this.pending = Math.max(0, this.pending - 1);
			});
		}
	}
}

export const loading = new LoadingStore();
