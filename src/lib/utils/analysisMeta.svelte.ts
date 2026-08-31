/**
 * Small shared holder for wizard metadata that the layout header needs to show.
 * `+page.svelte` owns the real state and mirrors the title in here; the header
 * reads it. Persistence is handled by the analysis draft, not this module.
 */
class AnalysisMeta {
	title = $state('NAA Analysis');
}

export const analysisMeta = new AnalysisMeta();
