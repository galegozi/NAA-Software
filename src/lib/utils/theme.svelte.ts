/**
 * Light/dark theme mode.
 *
 * The active mode lives as `data-mode` on <html> (app.html seeds it before first
 * paint from localStorage / prefers-color-scheme) and is persisted to
 * localStorage under `theme-mode`. Skeleton's `dark:` variant is wired to
 * `[data-mode='dark']` in layout.css.
 */
import { browser } from '$app/environment';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme-mode';

function systemPrefersDark(): boolean {
	return browser && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveMode(): ThemeMode {
	if (!browser) {
		return 'light';
	}
	// app.html already resolved this and wrote it to <html data-mode>; trust that first.
	const current = document.documentElement.getAttribute('data-mode');
	if (current === 'light' || current === 'dark') {
		return current;
	}
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') {
			return stored;
		}
	} catch {
		// localStorage can throw (private mode, disabled cookies) — fall back to the OS setting.
	}
	return systemPrefersDark() ? 'dark' : 'light';
}

class Theme {
	// Starts matching SSR ('light'); init() reconciles with the real choice on mount.
	mode = $state<ThemeMode>('light');

	/** Called once from the layout after hydration. */
	init() {
		this.mode = resolveMode();
		this.#apply();
	}

	set(mode: ThemeMode) {
		this.mode = mode;
		this.#apply();
	}

	toggle() {
		this.set(this.mode === 'dark' ? 'light' : 'dark');
	}

	#apply() {
		if (!browser) {
			return;
		}
		document.documentElement.setAttribute('data-mode', this.mode);
		try {
			localStorage.setItem(STORAGE_KEY, this.mode);
		} catch {
			// Non-fatal: the choice just won't persist across reloads.
		}
	}
}

export const theme = new Theme();
