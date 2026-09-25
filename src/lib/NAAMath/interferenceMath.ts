/**
 * Primary nuclear-interference correction (8.0).
 *
 * A target nuclide (e.g. Mg-27) is measured by (n,γ) activation of its own
 * element, but another element in the sample makes the *same* nuclide through
 * a different reaction — typically a fast-neutron threshold reaction such as
 * Al-27(n,p)Mg-27. Because the product nuclide is identical, its half-life and
 * gamma lines are identical too, so the detector cannot tell the two apart:
 * each interfering element `i` adds an apparent target concentration
 * `f_i · C_i` to both the standard and the unknown.
 *
 *   k   = the combined correction factor from `everythingMath`
 *         (`unknownConcentration = k * knownConcentration`)
 *   f_i = interference factor (dimensionless): apparent target mass fraction
 *         produced per unit mass fraction of interfering element. It depends on
 *         the irradiation position's fast/thermal flux ratio, so it has to be
 *         measured for the facility — irradiate the interferent alone and read
 *         off the apparent target concentration.
 *
 *   k * (Ct_S + Σ f_i * Ci_S) = Ct_U(true) + Σ f_i * Ci_U
 *
 * so the corrected target concentration in the unknown is
 *
 *   Ct_U = k * (Ct_S + Σ f_i * Ci_S) - Σ f_i * Ci_U
 *
 * All concentrations are mass fractions (unit conversion is the caller's job);
 * `f_i` is dimensionless so it is unit-independent.
 */

export type Interferent = {
	/** Interference factor `f_i` (dimensionless). */
	factor: number;
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
	/**
	 * Share of the unknown's apparent target signal that comes from interferents,
	 * `Σ f_i * Ci_U / (k * (Ct_S + Σ f_i * Ci_S))`. Near or above 1 means the
	 * correction dominates the result and it should not be trusted.
	 */
	interferenceFraction: number;
	/** True when the correction drives the result to zero or below. */
	overCorrected: boolean;
};

export function computeInterferenceCorrection(
	inputs: InterferenceCorrectionInputs
): InterferenceCorrection {
	const apparentStandard = inputs.interferents.reduce(
		(sum, i) => sum + i.factor * i.inStandard,
		inputs.targetInStandard
	);
	const apparentUnknown = inputs.k * apparentStandard;
	const fromInterferents = inputs.interferents.reduce((sum, i) => sum + i.factor * i.inUnknown, 0);
	const corrected = apparentUnknown - fromInterferents;
	return {
		uncorrected: inputs.k * inputs.targetInStandard,
		corrected,
		interferenceFraction: apparentUnknown > 0 ? fromInterferents / apparentUnknown : NaN,
		overCorrected: corrected <= 0
	};
}

/**
 * Relative uncertainty of a corrected concentration: the Pythagorean norm of
 * the given relative uncertainties (target result, each interferent's
 * concentration in the unknown, each factor). Unknown / non-finite /
 * non-positive terms are dropped. Multiply by the corrected concentration for
 * the absolute `±`.
 */
export function combinedRelativeUncertainty(relativeTerms: readonly number[]): number {
	const clean = relativeTerms.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
	return Math.hypot(...clean);
}

/** `|σ / value|`, or 0 when either is missing / zero. */
export function relative(uncertainty: number | null | undefined, value: number): number {
	if (uncertainty == null || !Number.isFinite(uncertainty) || !value) return 0;
	return Math.abs(uncertainty / value);
}
