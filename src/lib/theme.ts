/** The app theme. `system` follows the operating system and updates live;
 *  the choice persists in `fermentario.config` next to the other settings.
 *  Tailwind's `dark:` variant keys off the `dark` class on `<html>`, set here
 *  and by the small inline script in `app.html` before the first paint. */

export type Theme = 'light' | 'dark' | 'system';

export const DEFAULT_THEME: Theme = 'system';

export const THEME_OPTIONS: { id: Theme; label: string }[] = [
	{ id: 'light', label: 'Light' },
	{ id: 'dark', label: 'Dark' },
	{ id: 'system', label: 'System' }
];

export function sanitizeTheme(value: unknown): Theme {
	return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME;
}

export function systemPrefersDark(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-color-scheme: dark)').matches
	);
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
	return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

/** Apply the theme to the document. Safe during SSR (does nothing). */
export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	const resolved = resolveTheme(theme);
	document.documentElement.classList.toggle('dark', resolved === 'dark');
	document.documentElement.style.colorScheme = resolved;
}

/** The theme saved by the app, or `system` when there is no config yet. */
export function storedTheme(): Theme {
	if (typeof localStorage === 'undefined') return DEFAULT_THEME;
	try {
		const raw = localStorage.getItem('fermentario.config');
		if (!raw) return DEFAULT_THEME;
		return sanitizeTheme((JSON.parse(raw) as { theme?: unknown })?.theme);
	} catch {
		return DEFAULT_THEME;
	}
}

export function applyStoredTheme(): void {
	applyTheme(storedTheme());
}

/** Re-apply the stored theme when the OS preference changes while the user
 *  follows `system`. Returns the cleanup function. */
export function watchSystemTheme(): () => void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
	const media = window.matchMedia('(prefers-color-scheme: dark)');
	const onChange = () => {
		if (storedTheme() === 'system') applyTheme('system');
	};
	media.addEventListener('change', onChange);
	return () => media.removeEventListener('change', onChange);
}
