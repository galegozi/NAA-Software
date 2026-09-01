/**
 * Pure validation helpers for wizard entities.
 *
 * These are shared by the entry components (`isotopeInfo.svelte`, `materialInfo.svelte`,
 * `refMatInfo.svelte`) and by the wizard page, so a collapsed editor pane can still be
 * validated straight from its backing data. Inputs are typed structurally (all optional)
 * so the loosely-typed component props pass through without casts.
 */

export type IsotopeErrorInput = {
	elementName?: string;
	isotopeName?: string;
	energy?: number;
	halfLife?: number;
};

export type BaseMaterialErrorInput = {
	NETL_code?: string;
	sampleName?: string;
	mass?: number;
	reactorPower?: number;
	irradiationTime?: number;
	decayTime?: number;
	liveTime?: number;
	realTime?: number;
	fluence?: number;
};

export type ReferenceMaterialErrorInput = BaseMaterialErrorInput & {
	knownConcentration?: number[];
	knownUncertainty?: number[];
};

export function getIsotopeErrors(isotope: IsotopeErrorInput): string[] {
	const errors: string[] = [];
	if (!isotope.elementName) {
		errors.push('Element name is required');
	}
	if (!isotope.isotopeName) {
		errors.push('Isotope name is required');
	}
	if (!((isotope.energy ?? 0) > 0)) {
		errors.push('Energy must be greater than 0');
	}
	if (!((isotope.halfLife ?? 0) > 0)) {
		errors.push('Half-life must be greater than 0');
	}
	return errors;
}

export function getBaseMaterialErrors(material: BaseMaterialErrorInput): string[] {
	const errors: string[] = [];

	if (!material.NETL_code?.trim()) {
		errors.push('NETL Code is required');
	}
	if (!material.sampleName?.trim()) {
		errors.push('Sample Name is required');
	}
	if (!((material.mass ?? 0) > 0)) {
		errors.push('Mass must be greater than 0');
	}
	if (!Number.isFinite(material.reactorPower)) {
		errors.push('Reactor Power must be a valid number');
	}
	if (!((material.irradiationTime ?? 0) > 0)) {
		errors.push('Irradiation time must be greater than 0');
	}
	if ((material.decayTime ?? 0) < 0) {
		errors.push('Decay Time cannot be negative');
	}
	if (!((material.liveTime ?? 0) > 0)) {
		errors.push('Live Time must be greater than 0');
	}
	if (!((material.realTime ?? 0) > 0)) {
		errors.push('Real Time must be greater than 0');
	}
	if (!((material.fluence ?? 0) > 0)) {
		errors.push('Fluence must be greater than 0');
	}

	return errors;
}

/**
 * Validate a reference material and its per-isotope known-concentration data.
 *
 * `enabledIsotopeIndices` is the set of isotope rows this reference is expected to cover
 * (see `refMatInfo.svelte`'s `isIsotopeEnabled`). Pass every index to check them all.
 */
export function getReferenceMaterialErrors(
	reference: ReferenceMaterialErrorInput,
	enabledIsotopeIndices: Iterable<number>,
	getIsotopeLabel: (index: number) => string = (index) => `Isotope ${index + 1}`
): string[] {
	const errors = getBaseMaterialErrors(reference);

	const knownConcentration = Array.isArray(reference.knownConcentration)
		? reference.knownConcentration
		: [];
	const knownUncertainty = Array.isArray(reference.knownUncertainty)
		? reference.knownUncertainty
		: [];

	for (const index of enabledIsotopeIndices) {
		if (!((knownConcentration[index] ?? 0) > 0)) {
			errors.push(`${getIsotopeLabel(index)}: Known Concentration must be greater than 0`);
		}
		if ((knownUncertainty[index] ?? 0) < 0) {
			errors.push(`${getIsotopeLabel(index)}: Known Uncertainty cannot be negative`);
		}
	}

	return errors;
}
