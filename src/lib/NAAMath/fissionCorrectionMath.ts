/**
 * Fission-interference correction (7.2).
 *
 * A target nuclide (e.g. Ce-141) is measured by neutron activation, but a
 * fissile nuclide present in the sample (e.g. U-235) also produces it by
 * fission, inflating the peak counts in both the standard and the unknown. Let
 *
 *   k  = the combined correction factor from `everythingMath`
 *        (`unknownConcentration = k * knownConcentration`)
 *   f  = the fission-interference factor (dimensionless: apparent target
 *        mass-fraction produced per unit fissile mass-fraction)
 *   Ct_S = target concentration in the standard
 *   Cf_S = fissile-element concentration in the standard
 *   Cf_U = fissile-element concentration in the unknown
 *
 * Because `k` maps the standard's *apparent* target concentration onto the
 * unknown's apparent target concentration:
 *
 *   k * (Ct_S + f * Cf_S) = Ct_U(true) + f * Cf_U
 *
 * so the corrected target concentration in the unknown is
 *
 *   Ct_U = k * (Ct_S + f * Cf_S) - f * Cf_U
 *
 * All concentrations here are mass fractions (unit conversion is the caller's
 * job); `f` is dimensionless so it is unit-independent.
 */

export type FissionCorrectionInputs = {
	/** Combined correction factor `k`. */
	k: number;
	/** Fission-interference factor `f` (dimensionless). */
	f: number;
	/** Target concentration in the standard, as a mass fraction. */
	targetInStandard: number;
	/** Fissile-element concentration in the standard, as a mass fraction. */
	fissileInStandard: number;
	/** Fissile-element concentration in the unknown, as a mass fraction. */
	fissileInUnknown: number;
};

/** Uncorrected comparative-NAA result, `k * Ct_S` (mass fraction). */
export function uncorrectedMassFraction(k: number, targetInStandard: number): number {
	return k * targetInStandard;
}

/**
 * Fission-interference-corrected target concentration in the unknown, as a mass
 * fraction: `k * (Ct_S + f * Cf_S) - f * Cf_U`.
 */
export function fissionCorrectedMassFraction(inputs: FissionCorrectionInputs): number {
	const { k, f, targetInStandard, fissileInStandard, fissileInUnknown } = inputs;
	return k * (targetInStandard + f * fissileInStandard) - f * fissileInUnknown;
}

/**
 * Signed size of the correction (corrected − uncorrected), as a mass fraction.
 * Equivalent to `f * (k * Cf_S - Cf_U)`.
 */
export function fissionCorrectionDelta(inputs: FissionCorrectionInputs): number {
	return (
		fissionCorrectedMassFraction(inputs) -
		uncorrectedMassFraction(inputs.k, inputs.targetInStandard)
	);
}

/**
 * Relative uncertainty of the fission-corrected concentration: the Pythagorean
 * norm of the relative uncertainties of the two predicted concentrations (the
 * target result and the fissile-element result in the unknown) and of the
 * fission factor. Any term whose relative uncertainty is unknown is passed as 0
 * (and non-finite / negative values are ignored).
 *
 * Multiply the returned fraction by the corrected concentration for the absolute
 * `±`.
 */
export function fissionCorrectedRelativeUncertainty(
	relTarget: number,
	relFissile: number,
	relFactor: number
): number {
	const clean = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
	return Math.hypot(clean(relTarget), clean(relFissile), clean(relFactor));
}
