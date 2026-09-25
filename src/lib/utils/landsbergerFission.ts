/**
 * Built-in uranium-fission interference factors from Landsberger (1989), offered
 * alongside the `fission-corrections` catalog rows so the fission correction has a
 * cited default before (or without) the catalog.
 *
 * Source — the paper's abstract (full text not yet obtained):
 *   S. Landsberger, "Update of uranium fission interferences in neutron activation
 *   analysis", Chemical Geology 77(1) (1989) 65–70. doi:10.1016/0009-2541(89)90016-8
 *
 * "The compiled results are presented as apparent ppm of element per ppm U" for
 * thermal NAA. That is the dimensionless factor `f` used by the correction math,
 * per ppm of *total* uranium (hence fissile parent "U", not a single isotope).
 *
 * Limits of what the abstract gives (revisit once the full text is in hand):
 * - no uncertainties (stored as 0);
 * - no gamma line, nuclide, irradiation or decay conditions — so a factor is
 *   offered for every analysed isotope of the element;
 * - La is "variable … depending on decay time" and is left to the La-140
 *   in-growth special correction.
 */
import type { IsotopeInfo } from '$lib/types.js';
import { parseIsotopeName } from '$lib/utils/catalogWrite.js';
import { lookupElementSymbol, normalizeElementSymbol } from '$lib/utils/elementNames.js';
import type { FissionCorrectionRecord } from '$lib/utils/fissionCorrections.js';

export const LANDSBERGER_1989_CITATION =
	'Landsberger, Chem. Geol. 77 (1989) 65–70 — thermal, apparent ppm per ppm U (abstract value)';

/** Row ids of built-in (non-catalog) factors start with this. */
export const BUILTIN_FISSION_ROW_PREFIX = 'builtin:';

/** Thermal-NAA factors, apparent ppm of element per ppm U (1989 abstract). */
export const LANDSBERGER_1989_THERMAL: Readonly<Record<string, number>> = {
	Ba: 0.64,
	Ce: 0.27,
	Mo: 1.6,
	Nd: 0.23,
	Ru: 0.13,
	Te: 0.8,
	Zr: 10
};

/** True for a row that came from this built-in table rather than the catalog. */
export function isBuiltinFissionRow(row: Pick<FissionCorrectionRecord, 'id'>): boolean {
	return row.id.startsWith(BUILTIN_FISSION_ROW_PREFIX);
}

function elementSymbolOf(isotope: Pick<IsotopeInfo, 'elementName' | 'isotopeName'>): string {
	const fromName = lookupElementSymbol(isotope.elementName ?? '');
	if (fromName) {
		return fromName;
	}
	const parsed = parseIsotopeName((isotope.isotopeName ?? '').trim());
	return parsed ? normalizeElementSymbol(parsed.shortName) : '';
}

/** Landsberger (1989) factor for this isotope's element, as a selectable row (or none). */
export function landsbergerFissionRows(
	isotope: Pick<IsotopeInfo, 'elementName' | 'isotopeName'>
): FissionCorrectionRecord[] {
	const symbol = elementSymbolOf(isotope);
	const factor = LANDSBERGER_1989_THERMAL[symbol];
	if (factor === undefined) {
		return [];
	}
	return [
		{
			id: `${BUILTIN_FISSION_ROW_PREFIX}landsberger-1989:${symbol}`,
			docType: 'fission-correction',
			fissileNuclide: 'U',
			interferingIsotope: (isotope.isotopeName ?? '').trim(),
			gammaEnergyKev: null,
			irradiationPosition: '',
			irradiationType: 'thermal',
			correctionFactor: factor,
			uncertainty: 0,
			notes: LANDSBERGER_1989_CITATION
		}
	];
}
