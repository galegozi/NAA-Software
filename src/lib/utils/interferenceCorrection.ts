/**
 * Wizard glue for the primary-interference correction (8.0): what the user
 * set up in Step 1 (which interfering elements, and their factors), and how
 * each (target isotope, unknown) result is resolved into the pure math in
 * `NAAMath/interferenceMath.ts`.
 *
 * The interfering element's concentration comes from the analysis itself when
 * it is one of the analysed isotopes (the linked reference's known value for
 * the standard, the computed result for the unknown); otherwise the user types
 * it in on the Review step.
 */
import type { ConcUnitType, IsotopeInfo, ReferenceMaterial } from '$lib/types.js';
import type { EverythingComputed } from '$lib/NAAMath/types.js';
import {
	concentrationToMassFraction,
	massFractionToConcentration
} from '$lib/NAAMath/everythingMath.js';
import {
	combinedRelativeUncertainty,
	computeInterferenceCorrection,
	relative
} from '$lib/NAAMath/interferenceMath.js';
import {
	analysisIsotopeElement,
	analysisIsotopeKey,
	primaryInterferencesFor
} from '$lib/utils/primaryInterferences.js';
import { lookupElementSymbol } from '$lib/utils/elementNames.js';

export type InterferentSetting = {
	/** Element symbol of the interfering element, e.g. "Al". */
	element: string;
	/** Reaction label, e.g. "Al-27(n,p)Mg-27" — "" for a user-added interferent. */
	reaction: string;
	/** Whether to correct for it. Built-in suggestions start off. */
	enabled: boolean;
	/** Interference factor `f` (dimensionless). */
	factor: number | null;
	/** Absolute 1σ uncertainty of `factor`. */
	uncertainty: number | null;
	/** Unit of the hand-entered concentrations below. */
	unit: 'ppm' | 'percentage';
	/** Hand-entered concentration in the target's standard (used when not analysed). */
	manualInStandard: number | null;
	/** Hand-entered concentration per unknown index (used when not analysed). */
	manualInUnknown: (number | null)[];
};

/** Interference set-up for one analysis isotope, keyed by nuclide (survives reordering). */
export type InterferenceSetting = {
	isotopeKey: string;
	interferents: InterferentSetting[];
};

export function createInterferent(element: string, reaction = ''): InterferentSetting {
	return {
		element,
		reaction,
		enabled: reaction === '',
		factor: null,
		uncertainty: null,
		unit: 'ppm',
		manualInStandard: null,
		manualInUnknown: []
	};
}

/**
 * Make sure every analysis isotope with a known interference has its
 * suggestions listed (off by default). User-added and already-edited entries
 * are kept; settings for isotopes no longer in the analysis are kept too, so
 * removing and re-adding an isotope doesn't lose its factors. Returns the same
 * array when nothing changed.
 */
export function syncInterferenceSettings(
	isotopes: readonly Pick<IsotopeInfo, 'elementName' | 'isotopeName'>[],
	settings: readonly InterferenceSetting[]
): InterferenceSetting[] {
	let next: InterferenceSetting[] | null = null;
	for (const isotope of isotopes) {
		const known = primaryInterferencesFor(isotope);
		if (known.length === 0) continue;
		const key = analysisIsotopeKey(isotope);
		const list: readonly InterferenceSetting[] = next ?? settings;
		const existing = list.find((s) => s.isotopeKey === key);
		const missing = known.filter(
			(k) => !existing?.interferents.some((i) => i.element === k.interferingElement)
		);
		if (missing.length === 0) continue;
		const added = missing.map((k) => createInterferent(k.interferingElement, k.reaction));
		next = existing
			? list.map((s) =>
					s === existing ? { ...s, interferents: [...s.interferents, ...added] } : s
				)
			: [...list, { isotopeKey: key, interferents: added }];
	}
	return next ?? (settings as InterferenceSetting[]);
}

export function settingFor(
	settings: readonly InterferenceSetting[],
	isotope: Pick<IsotopeInfo, 'elementName' | 'isotopeName'>
): InterferenceSetting | undefined {
	const key = analysisIsotopeKey(isotope);
	return settings.find((s) => s.isotopeKey === key);
}

/** Problems with an enabled interferent that stop Step 1 from continuing. */
export function interferentErrors(interferent: InterferentSetting): string[] {
	if (!interferent.enabled) return [];
	const errors: string[] = [];
	if (!lookupElementSymbol(interferent.element)) {
		errors.push('pick the interfering element');
	}
	if (
		interferent.factor === null ||
		!Number.isFinite(interferent.factor) ||
		interferent.factor < 0
	) {
		errors.push(`enter an interference factor for ${interferent.element || 'the interferent'}`);
	}
	if (
		interferent.uncertainty !== null &&
		(!Number.isFinite(interferent.uncertainty) || interferent.uncertainty < 0)
	) {
		errors.push(`the ${interferent.element} factor uncertainty can't be negative`);
	}
	return errors;
}

export type ResolvedInterferent = {
	element: string;
	reaction: string;
	factor: number;
	factorUncertainty: number;
	/** In the target's unit. */
	inStandard: number | null;
	inUnknown: number | null;
	standardSource: 'analysed' | 'manual';
	unknownSource: 'analysed' | 'manual';
	/** Index into the setting's `interferents` (for writing manual values back). */
	settingIndex: number;
};

export type InterferenceResult = {
	isotopeIndex: number;
	unknownIndex: number;
	isotopeKey: string;
	/** The target's unit (the linked reference's unit for it). */
	unit: ConcUnitType;
	k: number;
	interferents: ResolvedInterferent[];
	uncorrected: number;
	uncorrectedUncertainty: number;
	/** Null while an interferent concentration is still missing. */
	corrected: number | null;
	correctedUncertainty: number | null;
	correctedUncertaintyPercent: number | null;
	interferenceFraction: number | null;
	overCorrected: boolean;
	/** Human-readable list of what still has to be entered. */
	missing: string[];
};

export type InterferenceContext = {
	isotopes: readonly IsotopeInfo[];
	references: readonly ReferenceMaterial[];
	unknownCount: number;
	settings: readonly InterferenceSetting[];
	/** Linked reference index for isotope `i`. */
	linkedReference: (isotopeIndex: number) => number;
	/** Does reference `r` provide data for isotope `i`? */
	referenceCovers: (referenceIndex: number, isotopeIndex: number) => boolean;
	/** `everythingComp`: results[isotopeIndex][unknownIndex]. */
	results: readonly (readonly EverythingComputed[])[];
};

function toMassFraction(value: number, unit: ConcUnitType): number {
	return concentrationToMassFraction(value, unit);
}

/** Analysed isotope index for an element (not the target itself), or -1. */
function analysedIndexForElement(
	isotopes: readonly IsotopeInfo[],
	element: string,
	targetIndex: number
): number {
	return isotopes.findIndex(
		(iso, index) => index !== targetIndex && analysisIsotopeElement(iso) === element
	);
}

/**
 * Resolve every (target isotope, unknown) pair that has at least one enabled,
 * valid interferent. Keyed `"<isotopeIndex>:<unknownIndex>"`.
 */
export function computeInterferenceResults(
	ctx: InterferenceContext
): Map<string, InterferenceResult> {
	const out = new Map<string, InterferenceResult>();
	ctx.isotopes.forEach((isotope, i) => {
		const setting = settingFor(ctx.settings, isotope);
		const active = (setting?.interferents ?? [])
			.map((interferent, settingIndex) => ({ interferent, settingIndex }))
			.filter(
				({ interferent }) => interferent.enabled && interferentErrors(interferent).length === 0
			);
		if (!setting || active.length === 0) return;

		const referenceIndex = ctx.linkedReference(i);
		const reference = ctx.references[referenceIndex];
		if (!reference) return;
		const unit = reference.concentrationUnits?.[i];
		const targetInStandard = toMassFraction(reference.knownConcentration?.[i] ?? 0, unit);

		for (let u = 0; u < ctx.unknownCount; u++) {
			const computed = ctx.results[i]?.[u];
			if (!computed) continue;
			const missing: string[] = [];
			const resolved: ResolvedInterferent[] = [];
			const relativeTerms: number[] = [computed.unknownConcentrationUncertainty / 100];
			const mathInterferents: { factor: number; inStandard: number; inUnknown: number }[] = [];

			for (const { interferent, settingIndex } of active) {
				const element = lookupElementSymbol(interferent.element);
				const e = analysedIndexForElement(ctx.isotopes, element, i);
				const factor = interferent.factor as number;
				const factorUncertainty = interferent.uncertainty ?? 0;

				// Standard: the target's linked reference, if it certifies the element.
				let inStandardMf: number | null = null;
				let standardSource: 'analysed' | 'manual' = 'manual';
				if (e >= 0 && ctx.referenceCovers(referenceIndex, e)) {
					const known = reference.knownConcentration?.[e];
					if (typeof known === 'number' && Number.isFinite(known) && known > 0) {
						inStandardMf = toMassFraction(known, reference.concentrationUnits?.[e]);
						standardSource = 'analysed';
					}
				}
				if (inStandardMf === null && interferent.manualInStandard !== null) {
					inStandardMf = toMassFraction(interferent.manualInStandard, interferent.unit);
				}

				// Unknown: the element's own (uncorrected) result, if it was analysed.
				let inUnknownMf: number | null = null;
				let unknownSource: 'analysed' | 'manual' = 'manual';
				const elementResult = e >= 0 ? ctx.results[e]?.[u] : undefined;
				if (elementResult && Number.isFinite(elementResult.unknownConcentration)) {
					const elementUnit = ctx.references[ctx.linkedReference(e)]?.concentrationUnits?.[e];
					inUnknownMf = toMassFraction(elementResult.unknownConcentration, elementUnit);
					unknownSource = 'analysed';
					relativeTerms.push(elementResult.unknownConcentrationUncertainty / 100);
				}
				const manualUnknown = interferent.manualInUnknown[u] ?? null;
				if (inUnknownMf === null && manualUnknown !== null) {
					inUnknownMf = toMassFraction(manualUnknown, interferent.unit);
				}

				if (inStandardMf === null) missing.push(`${element} in the standard`);
				if (inUnknownMf === null) missing.push(`${element} in the unknown`);
				relativeTerms.push(relative(factorUncertainty, factor));

				resolved.push({
					element,
					reaction: interferent.reaction,
					factor,
					factorUncertainty,
					inStandard:
						inStandardMf === null ? null : massFractionToConcentration(inStandardMf, unit),
					inUnknown: inUnknownMf === null ? null : massFractionToConcentration(inUnknownMf, unit),
					standardSource,
					unknownSource,
					settingIndex
				});
				if (inStandardMf !== null && inUnknownMf !== null) {
					mathInterferents.push({ factor, inStandard: inStandardMf, inUnknown: inUnknownMf });
				}
			}

			const k = computed.combinedCorrectionFactor;
			const base: InterferenceResult = {
				isotopeIndex: i,
				unknownIndex: u,
				isotopeKey: setting.isotopeKey,
				unit,
				k,
				interferents: resolved,
				uncorrected: computed.unknownConcentration,
				uncorrectedUncertainty: computed.unknownConcentrationUncertaintyAbsolute,
				corrected: null,
				correctedUncertainty: null,
				correctedUncertaintyPercent: null,
				interferenceFraction: null,
				overCorrected: false,
				missing
			};
			if (missing.length === 0) {
				const correction = computeInterferenceCorrection({
					k,
					targetInStandard,
					interferents: mathInterferents
				});
				const corrected = massFractionToConcentration(correction.corrected, unit);
				const rel = combinedRelativeUncertainty(relativeTerms);
				base.corrected = corrected;
				base.correctedUncertainty = Math.abs(corrected) * rel;
				base.correctedUncertaintyPercent = rel * 100;
				base.interferenceFraction = correction.interferenceFraction;
				base.overCorrected = correction.overCorrected;
			}
			out.set(`${i}:${u}`, base);
		}
	});
	return out;
}
