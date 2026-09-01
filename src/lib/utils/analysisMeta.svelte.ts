/**
 * Small shared bridge between the wizard (`+page.svelte`, which owns the real
 * state) and the layout header. The header reads `title` and can ask the wizard
 * to jump back to the welcome screen via `goToWelcome()`. Persistence is handled
 * by the analysis draft, not this module.
 */
class AnalysisMeta {
	title = $state('NAA Analysis');

	#welcomeHandler: (() => void) | null = null;

	/** Called once by `+page.svelte` to wire up the header's home action. */
	registerWelcomeHandler(fn: () => void) {
		this.#welcomeHandler = fn;
	}

	/** Take the wizard back to step 0 (welcome / intro). No-op before the wizard mounts. */
	goToWelcome() {
		this.#welcomeHandler?.();
	}
}

export const analysisMeta = new AnalysisMeta();
