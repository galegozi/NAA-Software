/**
 * Small shared bridge between the wizard (`+page.svelte`, which owns the real
 * state) and the layout header. The header reads `title` and can ask the wizard
 * to jump back to the welcome screen via `goToWelcome()`. Persistence is handled
 * by the analysis draft, not this module.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

class AnalysisMeta {
	title = $state('NAA Analysis');

	#welcomeHandler: (() => void) | null = null;

	/** Called by `+page.svelte` on mount to wire up the header's home action. */
	registerWelcomeHandler(fn: () => void) {
		this.#welcomeHandler = fn;
	}

	/** Return to the wizard's welcome screen (navigating there first if elsewhere). */
	async goToWelcome() {
		await goto(resolve('/'));
		// The wizard re-registers its handler on mount, so this now targets a live component.
		this.#welcomeHandler?.();
	}
}

export const analysisMeta = new AnalysisMeta();
