/**
 * General nuclear-interference correction (8.0).
 *
 * A target nuclide (e.g. Mg-27) is measured by (n,γ) activation of its own
 * element, but other elements in the sample produce the *same* nuclide through
 * other reactions — fast-neutron threshold reactions such as Al-27(n,p)Mg-27,
 * or fission of uranium. Because the product nuclide is identical, its decay and
 * gamma lines are identical too, so each interferent `i` simply adds an apparent
 * target concentration `f_i · C_i` to both the standard and the unknown:
 *
 *   k  = the combined correction factor from `everythingMath`
 *        (`unknownConcentration = k * knownConcentration`)
 *   f_i = interference factor (dimensionless: apparent target mass-fraction
 *         produced per unit interfering-element mass-fraction). Depends on the
 *         irradiation position's neutron spectrum, not on counting timing.
 *
 *   k * (Ct_S + Σ f_i * Ci_S) = Ct_U(true) + Σ f_i * Ci_U
 *
 * so the corrected target concentration in the unknown is
 *
 *   Ct_U = k * (Ct_S + Σ f_i * Ci_S) - Σ f_i * Ci_U
 *
 * With one interferent this is exactly the fission correction in
 * `fissionCorrectionMath.ts` (uranium is just one kind of interfering element).
 *
 * All concentrations are mass fractions (unit conversion is the caller's job);
 * `f_i` is dimensionless so it is unit-independent.
 */

export type Interferent = {
	/** Interference factor `f_i` (dimensionless) — the standard's value. */
	factor: number;
	/** Absolute 1σ uncertainty of `factor`, if known. */
	factorUncertainty?: number;
	/**
	 * Factor in the unknown, when it differs from the standard's (e.g. a
	 * precursor in-growth term that depends on each sample's timing). Defaults
	 * to `factor`.
	 */
	factorInUnknown?: number;
	/** Interfering-element concentration in the standard, as a mass fraction. */
	inStandard: number;
	/** Interfering-element concentration in the unknown, as a mass fraction. */
	inUnknown: number;
};

export type InterferenceCorrectionInputs = {
	/** Combined correction factor `k`. */
	k: number;
	/** Target concentration in the standard, as a mass fraction. */
	targetInStandard: number;
	interferents: readonly Interferent[];
};

export type InterferenceCorrection = {
	/** `k * Ct_S` — the plain comparative result. */
	uncorrected: number;
	/** `k * (Ct_S + Σ f_i * Ci_S) - Σ f_i * Ci_U`. */
	corrected: number;
	/** `corrected - uncorrected` (signed). */
	delta: number;
	/**
	 * Share of the unknown's apparent target signal that comes from interferents,
	 * `Σ f_i * Ci_U / (k * (Ct_S + Σ f_i * Ci_S))`. Near or above 1 means the
	 * correction dominates the result and it should not be trusted.
	 */
	interferenceFraction: number;
	/** True when the correction drives the result to zero or below. */
	overCorrected: boolean;
};

/** Apparent target in the standard: `Ct_S + Σ f_i * Ci_S`. */
function apparentTargetInStandard(inputs: InterferenceCorrectionInputs): number {
	return inputs.interferents.reduce(
		(sum, i) => sum + i.factor * i.inStandard,
		inputs.targetInStandard
	);
}

/** Interferent contribution in the unknown: `Σ f_i * Ci_U`. */
function interferenceInUnknown(interferents: readonly Interferent[]): number {
	return interferents.reduce((sum, i) => sum + (i.factorInUnknown ?? i.factor) * i.inUnknown, 0);
}

/** Interference-corrected target concentration in the unknown, as a mass fraction. */
export function interferenceCorrectedMassFraction(inputs: InterferenceCorrectionInputs): number {
	return inputs.k * apparentTargetInStandard(inputs) - interferenceInUnknown(inputs.interferents);
}

/** Corrected value plus the diagnostics the Review step needs. */
export function computeInterferenceCorrection(
	inputs: InterferenceCorrectionInputs
): InterferenceCorrection {
	const uncorrected = inputs.k * inputs.targetInStandard;
	const apparentUnknown = inputs.k * apparentTargetInStandard(inputs);
	const fromInterferents = interferenceInUnknown(inputs.interferents);
	const corrected = apparentUnknown - fromInterferents;
	return {
		uncorrected,
		corrected,
		delta: corrected - uncorrected,
		interferenceFraction: apparentUnknown > 0 ? fromInterferents / apparentUnknown : NaN,
		overCorrected: corrected <= 0
	};
}

/**
 * Interference factor from an interference standard: irradiate a material that
 * contains the interfering element (at known mass fraction `interferentConcentration`)
 * but none of the target element, process it as an unknown, and read off the
 * apparent target mass fraction. Then `f = apparentTarget / interferentConcentration`.
 *
 * Relative uncertainties combine as a Pythagorean norm (same convention as the
 * correction itself).
 */
export function interferenceFactorFromMeasurement(params: {
	apparentTarget: number;
	apparentTargetUncertainty?: number;
	interferentConcentration: number;
	interferentConcentrationUncertainty?: number;
}): { factor: number; uncertainty: number } {
	const { apparentTarget, interferentConcentration } = params;
	const factor = apparentTarget / interferentConcentration;
	const rel = combinedRelativeUncertainty([
		relative(params.apparentTargetUncertainty, apparentTarget),
		relative(params.interferentConcentrationUncertainty, interferentConcentration)
	]);
	return { factor, uncertainty: Math.abs(factor) * rel };
}

/**
 * Relative uncertainty of a corrected concentration: the Pythagorean norm of
 * the given relative uncertainties (target result, each interferent result,
 * each factor). Unknown / non-finite / non-positive terms are dropped. Multiply
 * by the corrected concentration for the absolute `±`.
 */
export function combinedRelativeUncertainty(relativeTerms: readonly number[]): number {
	const clean = relativeTerms.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
	return Math.hypot(...clean);
}

/** `|σ / value|`, or 0 when either is missing / zero. */
export function relative(uncertainty: number | undefined, value: number): number {
	if (uncertainty === undefined || !Number.isFinite(uncertainty) || value === 0) return 0;
	return Math.abs(uncertainty / value);
}
