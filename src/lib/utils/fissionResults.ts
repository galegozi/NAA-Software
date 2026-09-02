/**
 * Fission-interference correction results for the Review step.
 *
 * Pure resolution of the per-(isotope, unknown) correction from the Step 1
 * `fissionChoices` plus the computed comparative-NAA results. No approval state —
 * a choice with a positive factor and resolvable inputs is applied; otherwise the
 * result carries a `note` explaining what is missing.
 *
 * Formula (see `NAAMath/fissionCorrectionMath.ts`):
 *   C_target^U = k · (C_target^S + f · C_fissile^S) − f · C_fissile^U
 */
import type { ConcUnitType, IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '$lib/types.js';
import type { EverythingComputed } from '$lib/NAAMath/types.js';
import {
	concentrationToMassFraction,
	massFractionToConcentration
} from '../NAAMath/everythingMath.ts';
import {
	fissionCorrectedMassFraction,
	fissionCorrectedRelativeUncertainty
} from '../NAAMath/fissionCorrectionMath.ts';
import { lookupElementName } from '$lib/utils/elementNames.js';
import {
	fissileParentSymbol,
	isotopeIsElement,
	type FissionChoice
} from './fissionInterference.js';

export type FissionResult = {
	isotopeIndex: number;
	unknownIndex: number;
	/** True when the corrected value was computed; false + `note` when blocked. */
	applied: boolean;
	unit: ConcUnitType;
	f: number;
	k: number;
	fissileSymbol: string;
	fissileElementLabel: string;
	fissileIsotopeIndex: number | null;
	/** All concentrations below are in `unit` (the target isotope's reference unit). */
	cTargetStandard: number;
	cFissileStandard: number;
	cFissileUnknown: number;
	uncorrected: number;
	corrected: number;
	/** Absolute `±` on the uncorrected result (existing NAA propagation). */
	uncorrectedUncertaintyAbsolute: number;
	/**
	 * Absolute `±` on the corrected result. Relative version is the Pythagorean
	 * norm of the predicted-cerium, predicted-uranium and fission-factor relative
	 * uncertainties; `correctedUncertaintyPercent` is that norm × 100.
	 */
	correctedUncertaintyAbsolute: number;
	correctedUncertaintyPercent: number;
	note: string;
};

export type FissionResultsContext = {
	/** Interfering-isotope candidates with their Step 1 choice. */
	candidates: { index: number; choice: FissionChoice | null }[];
	isotopeInfo: IsotopeInfo[];
	references: ReferenceMaterial[];
	unknowns: UnknownMaterial[];
	/** `everythingComp[isotopeIndex][unknownIndex]`. */
	everythingComp: EverythingComputed[][];
	/** Reference index linked to an isotope (must return a valid index). */
	linkedReferenceIndex: (isotopeIndex: number) => number;
};

function numberOr(value: number | undefined | null, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Analysis isotope index for a fissile element symbol, preferring one whose
 * concentration is known in the target isotope's linked reference.
 */
function resolveFissileIsotopeIndex(
	ctx: FissionResultsContext,
	symbol: string,
	targetRefIndex: number
): number | null {
	let fallback: number | null = null;
	for (let i = 0; i < ctx.isotopeInfo.length; i++) {
		if (!isotopeIsElement(ctx.isotopeInfo[i], symbol)) {
			continue;
		}
		if (fallback === null) {
			fallback = i;
		}
		const known = ctx.references[targetRefIndex]?.knownConcentration?.[i];
		if (typeof known === 'number' && known > 0) {
			return i;
		}
	}
	return fallback;
}

/** Map keyed `"<isotopeIndex>:<unknownIndex>"`. */
export function computeFissionResults(ctx: FissionResultsContext): Map<string, FissionResult> {
	const out = new Map<string, FissionResult>();

	for (const candidate of ctx.candidates) {
		const ti = candidate.index;
		const choice = candidate.choice;
		if (!choice || choice.mode === 'none' || !(choice.factor > 0)) {
			continue;
		}
		const refIndex = ctx.linkedReferenceIndex(ti);
		const ref = ctx.references[refIndex];
		if (!ref) {
			continue;
		}
		const unit = ref.concentrationUnits?.[ti];
		const fissileSymbol = fissileParentSymbol(choice.fissileNuclide);
		const fissileElementLabel =
			lookupElementName(fissileSymbol) || fissileSymbol || 'the fissile parent';

		for (let ui = 0; ui < ctx.unknowns.length; ui++) {
			const comp = ctx.everythingComp[ti]?.[ui];
			const k = comp?.combinedCorrectionFactor;
			const uncorrected = comp?.unknownConcentration;
			if (
				k === undefined ||
				!Number.isFinite(k) ||
				uncorrected === undefined ||
				!Number.isFinite(uncorrected)
			) {
				continue;
			}
			const key = `${ti}:${ui}`;
			const uncorrectedUncertaintyAbsolute = numberOr(comp.unknownConcentrationUncertaintyAbsolute);
			const base: FissionResult = {
				isotopeIndex: ti,
				unknownIndex: ui,
				applied: false,
				unit,
				f: choice.factor,
				k,
				fissileSymbol,
				fissileElementLabel,
				fissileIsotopeIndex: null,
				cTargetStandard: numberOr(ref.knownConcentration?.[ti]),
				cFissileStandard: 0,
				cFissileUnknown: 0,
				uncorrected,
				corrected: uncorrected,
				uncorrectedUncertaintyAbsolute,
				correctedUncertaintyAbsolute: uncorrectedUncertaintyAbsolute,
				correctedUncertaintyPercent: numberOr(comp.unknownConcentrationUncertainty),
				note: ''
			};

			if (!fissileSymbol) {
				out.set(key, { ...base, note: 'Set the fissile parent for this factor in Step 1.' });
				continue;
			}

			const fi = resolveFissileIsotopeIndex(ctx, fissileSymbol, refIndex);
			if (fi === null) {
				out.set(key, {
					...base,
					note: `${fissileElementLabel} is not an analysed isotope — its concentration in the standard and the unknown is needed for the correction.`
				});
				continue;
			}
			base.fissileIsotopeIndex = fi;

			const cFissileStandard = numberOr(ref.knownConcentration?.[fi]);
			if (!(cFissileStandard > 0)) {
				out.set(key, {
					...base,
					note: `The linked reference has no known ${fissileElementLabel} concentration.`
				});
				continue;
			}

			const fissileStdUnit = ref.concentrationUnits?.[fi];
			const fissileCompUnit =
				ctx.references[ctx.linkedReferenceIndex(fi)]?.concentrationUnits?.[fi];
			const cFissileUnknownRaw = ctx.everythingComp[fi]?.[ui]?.unknownConcentration;
			if (cFissileUnknownRaw === undefined || !Number.isFinite(cFissileUnknownRaw)) {
				out.set(key, {
					...base,
					note: `No computed ${fissileElementLabel} result for this unknown yet.`
				});
				continue;
			}

			const mfTargetS = concentrationToMassFraction(base.cTargetStandard, unit);
			const mfFissileS = concentrationToMassFraction(cFissileStandard, fissileStdUnit);
			const mfFissileU = concentrationToMassFraction(cFissileUnknownRaw, fissileCompUnit);
			const correctedMassFraction = fissionCorrectedMassFraction({
				k,
				f: choice.factor,
				targetInStandard: mfTargetS,
				fissileInStandard: mfFissileS,
				fissileInUnknown: mfFissileU
			});
			const corrected = massFractionToConcentration(correctedMassFraction, unit);

			// Pythagorean norm of the relative uncertainties: predicted target,
			// predicted fissile, and the fission factor.
			const relTarget = numberOr(comp.unknownConcentrationUncertainty) / 100;
			const relFissile =
				numberOr(ctx.everythingComp[fi]?.[ui]?.unknownConcentrationUncertainty) / 100;
			const relFactor =
				choice.uncertainty > 0 && choice.factor !== 0
					? choice.uncertainty / Math.abs(choice.factor)
					: 0;
			const correctedRelUncertainty = fissionCorrectedRelativeUncertainty(
				relTarget,
				relFissile,
				relFactor
			);

			out.set(key, {
				...base,
				applied: true,
				// C_fissile^S / C_fissile^U shown in the target unit so the printed formula is literal.
				cFissileStandard: massFractionToConcentration(mfFissileS, unit),
				cFissileUnknown: massFractionToConcentration(mfFissileU, unit),
				corrected,
				correctedUncertaintyAbsolute: Math.abs(corrected) * correctedRelUncertainty,
				correctedUncertaintyPercent: correctedRelUncertainty * 100
			});
		}
	}

	return out;
}
