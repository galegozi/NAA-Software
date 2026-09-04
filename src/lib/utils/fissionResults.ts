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
	fissionCorrectedRelativeUncertainty,
	lanthanumFissionFactor
} from '../NAAMath/fissionCorrectionMath.ts';
import { convertHalfLifeToSeconds } from '../NAAMath/isotopeMath.ts';
import { lookupElementName } from '$lib/utils/elementNames.js';
import {
	fissileParentSymbol,
	findManualFissile,
	fissionIsotopeKey,
	isLanthanum140,
	isotopeIsElement,
	type FissionChoice,
	type FissionManualEntry
} from './fissionInterference.js';

export type FissionResult = {
	isotopeIndex: number;
	unknownIndex: number;
	/** True when the corrected value was computed; false + `note` when blocked. */
	applied: boolean;
	unit: ConcUnitType;
	/** Factor multiplying `C_fissile^U` (`= fStandard` for every isotope but La-140). */
	f: number;
	/** Factor multiplying `C_fissile^S` inside `k · (…)`. */
	fStandard: number;
	/** True when `f` / `fStandard` came from the La-140 Ba-140-precursor in-growth. */
	isLanthanum: boolean;
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
	/**
	 * True when the correction is blocked only for a missing fissile-element
	 * concentration the user can supply by hand (the Review step renders inputs).
	 */
	needsFissileInput: boolean;
	/**
	 * True (La-140 only) when the correction is blocked because the Ba-140
	 * half-life needed for the precursor in-growth could not be resolved.
	 */
	needsBariumHalfLife: boolean;
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
	/** Hand-entered fissile concentrations (fallback when the element isn't analysed). */
	manualFissile: FissionManualEntry[];
	/**
	 * Ba-140 decay constant (per second) for the La-140 precursor in-growth,
	 * resolved by the caller from a hand-entered half-life, an analysed Ba-140
	 * isotope, or the catalog. `null` blocks the La-140 correction.
	 */
	bariumDecayConstant: number | null;
};

function nonNegativeOrNull(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function numberOr(value: number | undefined | null, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const HALF_LIFE_UNITS = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'years'];

/** Decay constant (per second) from a half-life; `0` when the inputs don't parse. */
function decayConstantFromHalfLife(value: number | null | undefined, unit: string): number {
	if (!HALF_LIFE_UNITS.includes(unit)) {
		return 0;
	}
	const seconds = convertHalfLifeToSeconds(numberOr(value), unit);
	return Number.isFinite(seconds) && seconds > 0 ? Math.LN2 / seconds : 0;
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
		const manual = findManualFissile(ctx.manualFissile, fissionIsotopeKey(ctx.isotopeInfo[ti]));

		// La-140 is fed by its precursor Ba-140, so the flat catalog constant is
		// shaped by the Ba-140 → La-140 in-growth, evaluated per sample — unless
		// the user explicitly opted out in favour of a plain flat factor.
		const lanthanum = isLanthanum140(ctx.isotopeInfo[ti]) && choice.useSpecialCorrection !== false;
		const lambdaLa = lanthanum
			? decayConstantFromHalfLife(ctx.isotopeInfo[ti].halfLife, ctx.isotopeInfo[ti].unit)
			: 0;
		const lambdaBa =
			lanthanum &&
			ctx.bariumDecayConstant != null &&
			Number.isFinite(ctx.bariumDecayConstant) &&
			ctx.bariumDecayConstant > 0
				? ctx.bariumDecayConstant
				: null;

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
				fStandard: choice.factor,
				isLanthanum: lanthanum,
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
				needsFissileInput: false,
				needsBariumHalfLife: false,
				note: ''
			};

			if (!fissileSymbol) {
				out.set(key, { ...base, note: 'Set the fissile parent for this factor in Step 1.' });
				continue;
			}

			// La-140: turn the flat constant `choice.factor` into per-sample factors
			// f_S / f_U via the Ba-140 → La-140 Bateman envelope (m = half the
			// irradiation time, t = the decay time). Every other isotope keeps a
			// flat factor (f_S === f_U === choice.factor).
			let fStandard = choice.factor;
			let fUnknown = choice.factor;
			if (lanthanum) {
				if (!(lambdaLa > 0)) {
					out.set(key, {
						...base,
						note: 'Enter the La-140 half-life on the isotope — the fission correction needs its decay constant.'
					});
					continue;
				}
				if (lambdaBa === null) {
					out.set(key, {
						...base,
						needsBariumHalfLife: true,
						note: 'The Ba-140 half-life is required for the lanthanum fission correction — it drives the Ba-140 → La-140 in-growth. Add Ba-140 to your analysed isotopes or enter its half-life below; the correction cannot be applied without it.'
					});
					continue;
				}
				const mStandard = numberOr(ref.irradiationTime) / 2;
				const mUnknown = numberOr(ctx.unknowns[ui]?.irradiationTime) / 2;
				if (!(mStandard > 0) || !(mUnknown > 0)) {
					out.set(key, {
						...base,
						note: 'The lanthanum fission correction needs the irradiation time for the standard and this unknown.'
					});
					continue;
				}
				const envelope = { constant: choice.factor, lambdaBa, lambdaLa };
				fStandard = lanthanumFissionFactor({
					...envelope,
					halfIrradiationTime: mStandard,
					decayTime: numberOr(ref.decayTime)
				});
				fUnknown = lanthanumFissionFactor({
					...envelope,
					halfIrradiationTime: mUnknown,
					decayTime: numberOr(ctx.unknowns[ui]?.decayTime)
				});
			}

			const fi = resolveFissileIsotopeIndex(ctx, fissileSymbol, refIndex);
			base.fissileIsotopeIndex = fi;
			const analysed = fi !== null;

			// C_fissile^S — the target's linked reference, else hand-entered.
			let mfFissileS: number | null = null;
			const refFissileStandard =
				fi !== null ? nonNegativeOrNull(ref.knownConcentration?.[fi]) : null;
			if (fi !== null && refFissileStandard !== null && refFissileStandard > 0) {
				mfFissileS = concentrationToMassFraction(refFissileStandard, ref.concentrationUnits?.[fi]);
			} else if (manual && nonNegativeOrNull(manual.inStandard) !== null) {
				mfFissileS = concentrationToMassFraction(manual.inStandard as number, manual.unit);
			}

			// C_fissile^U — the fissile isotope's computed result, else hand-entered.
			let mfFissileU: number | null = null;
			let relFissile = 0;
			const fissileComp = fi !== null ? ctx.everythingComp[fi]?.[ui] : undefined;
			if (fi !== null && fissileComp && Number.isFinite(fissileComp.unknownConcentration)) {
				mfFissileU = concentrationToMassFraction(
					fissileComp.unknownConcentration,
					ctx.references[ctx.linkedReferenceIndex(fi)]?.concentrationUnits?.[fi]
				);
				relFissile = numberOr(fissileComp.unknownConcentrationUncertainty) / 100;
			} else {
				const entry = manual?.inUnknown?.[ui];
				const value = nonNegativeOrNull(entry?.value);
				if (value !== null) {
					mfFissileU = concentrationToMassFraction(value, manual!.unit);
					if (value > 0 && nonNegativeOrNull(entry?.uncertainty) !== null) {
						relFissile = (entry!.uncertainty as number) / value;
					}
				}
			}

			if (mfFissileS === null || mfFissileU === null) {
				const missing: string[] = [];
				if (mfFissileS === null) missing.push('in the standard');
				if (mfFissileU === null) missing.push('in this unknown');
				const need = `the ${fissileElementLabel} concentration ${missing.join(' and ')}`;
				out.set(key, {
					...base,
					needsFissileInput: true,
					note: analysed
						? `The fission correction needs ${need}.`
						: `${fissileElementLabel} isn't one of your analysed isotopes. The fission correction needs ${need}.`
				});
				continue;
			}

			const mfTargetS = concentrationToMassFraction(base.cTargetStandard, unit);
			const correctedMassFraction = fissionCorrectedMassFraction({
				k,
				f: fStandard,
				fInUnknown: fUnknown,
				targetInStandard: mfTargetS,
				fissileInStandard: mfFissileS,
				fissileInUnknown: mfFissileU
			});
			const corrected = massFractionToConcentration(correctedMassFraction, unit);

			// Pythagorean norm of the relative uncertainties: predicted target,
			// predicted fissile, and the fission factor.
			const relTarget = numberOr(comp.unknownConcentrationUncertainty) / 100;
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
				f: fUnknown,
				fStandard,
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
