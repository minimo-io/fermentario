/** Shared modal motion: fade the backdrop, rise the panel. Durations drop
 *  to zero under `prefers-reduced-motion`. SSR-safe (no window on the
 *  server, and transitions never run there anyway). */

export function motionMs(ms: number): number {
	if (typeof window === 'undefined' || !('matchMedia' in window)) return ms;
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
	} catch {
		return ms;
	}
}

export const BACKDROP_MS = 150;
export const PANEL_MS = 180;
export const PANEL_Y = 24;
