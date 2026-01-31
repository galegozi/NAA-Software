/**
 * Enhanced step utilities with user-facing step numbers and display helpers
 */

export const APP_VERSION = '4.2.1 BETA';

export const STEP_CONSTANTS = {
	WELCOME: 0,
	ISOTOPE_COUNT: 1,
	ISOTOPE_INFO_START: 2,
	REFERENCE_MATERIAL_OFFSET: 2,
	UNKNOWN_COUNT_OFFSET: 3,
	UNKNOWN_INFO_OFFSET: 4
} as const;

/**
 * Step type enumeration
 */
export enum StepType {
	WELCOME = 'WELCOME',
	ISOTOPE_COUNT = 'ISOTOPE_COUNT',
	ISOTOPE_INFO = 'ISOTOPE_INFO',
	REFERENCE_MATERIAL = 'REFERENCE_MATERIAL',
	UNKNOWN_COUNT = 'UNKNOWN_COUNT',
	UNKNOWN_INFO = 'UNKNOWN_INFO',
	REVIEW = 'REVIEW'
}

/**
 * Calculate the step number for reference material input
 */
export function getReferenceMaterialStep(isotopeCount: number): number {
	return STEP_CONSTANTS.REFERENCE_MATERIAL_OFFSET + isotopeCount;
}

/**
 * Calculate the step number for unknown count input
 */
export function getUnknownCountStep(isotopeCount: number): number {
	return STEP_CONSTANTS.UNKNOWN_COUNT_OFFSET + isotopeCount;
}

/**
 * Calculate the step number for review
 */
export function getReviewStep(isotopeCount: number, unknownCount: number): number {
	return STEP_CONSTANTS.UNKNOWN_INFO_OFFSET + isotopeCount + unknownCount;
}

/**
 * Calculate isotope index from current step
 */
export function getIsotopeIndex(step: number): number {
	return step - STEP_CONSTANTS.ISOTOPE_INFO_START;
}

/**
 * Calculate unknown index from current step and isotope count
 */
export function getUnknownIndex(step: number, isotopeCount: number): number {
	return step - (STEP_CONSTANTS.UNKNOWN_INFO_OFFSET + isotopeCount);
}

/**
 * Get the current step type
 */
export function getStepType(step: number, isotopeCount: number, unknownCount: number): StepType {
	if (step === STEP_CONSTANTS.WELCOME) return StepType.WELCOME;
	if (step === STEP_CONSTANTS.ISOTOPE_COUNT) return StepType.ISOTOPE_COUNT;

	const refMaterialStep = getReferenceMaterialStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount);
	const reviewStep = getReviewStep(isotopeCount, unknownCount);

	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < refMaterialStep) {
		return StepType.ISOTOPE_INFO;
	}

	if (step === refMaterialStep) return StepType.REFERENCE_MATERIAL;
	if (step === unknownCountStep) return StepType.UNKNOWN_COUNT;

	if (step > unknownCountStep && step < reviewStep) {
		return StepType.UNKNOWN_INFO;
	}

	return StepType.REVIEW;
}

/**
 * Get user-facing step number (1-indexed, excludes welcome screen)
 */
export function getUserFacingStepNumber(
	step: number,
	isotopeCount: number,
	unknownCount: number
): number {
	if (step === STEP_CONSTANTS.WELCOME) return 0;

	// Step 1: Number of isotopes
	if (step === STEP_CONSTANTS.ISOTOPE_COUNT) return 1;

	const refMaterialStep = getReferenceMaterialStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount);

	// Steps 2 to 1+isotopeCount: Isotope information
	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < refMaterialStep) {
		return step; // Already correct: 2, 3, 4...
	}

	// Step after isotopes: Reference material
	if (step === refMaterialStep) return step;

	// Step after reference: Unknown count
	if (step === unknownCountStep) return step;

	// Steps for unknowns and review
	return step;
}

/**
 * Get step title for display
 */
export function getStepTitle(step: number, isotopeCount: number, unknownCount: number): string {
	const stepType = getStepType(step, isotopeCount, unknownCount);
	const stepNum = getUserFacingStepNumber(step, isotopeCount, unknownCount);

	switch (stepType) {
		case StepType.WELCOME:
			return 'Welcome';
		case StepType.ISOTOPE_COUNT:
			return `Step ${stepNum}: Number of Isotopes`;
		case StepType.ISOTOPE_INFO: {
			const isoIndex = getIsotopeIndex(step);
			return `Step ${stepNum}: Isotope Information for Isotope ${isoIndex + 1}`;
		}
		case StepType.REFERENCE_MATERIAL:
			return `Step ${stepNum}: Reference Material Information`;
		case StepType.UNKNOWN_COUNT:
			return `Step ${stepNum}: Number of Unknown Materials`;
		case StepType.UNKNOWN_INFO: {
			const unknownIdx = getUnknownIndex(step, isotopeCount);
			return `Step ${stepNum}: Unknown Material Information for Unknown ${unknownIdx + 1}`;
		}
		case StepType.REVIEW:
			return `Step ${stepNum}: Review`;
		default:
			return `Step ${stepNum}`;
	}
}

/**
 * Determine the back button text based on current step
 */
export function getBackButtonText(
	step: number,
	isotopeCount: number,
	unknownCount: number
): string {
	if (step <= STEP_CONSTANTS.ISOTOPE_COUNT) {
		return 'Back';
	}

	const refMaterialStep = getReferenceMaterialStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount);

	// From isotope info steps
	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < refMaterialStep) {
		if (step === STEP_CONSTANTS.ISOTOPE_INFO_START) {
			return 'Back: Number of Isotopes';
		}
		return 'Back: Previous Isotope';
	}

	// From reference material
	if (step === refMaterialStep) {
		return 'Back: Last Isotope Information';
	}

	// From unknown count
	if (step === unknownCountStep) {
		return 'Back: Reference Material';
	}

	// From unknown info steps
	if (step > unknownCountStep && step < getReviewStep(isotopeCount, unknownCount)) {
		if (step === unknownCountStep + 1) {
			return 'Back: Number of Unknown Materials';
		}
		return 'Back: Previous Unknown Material';
	}

	// From review
	if (step === getReviewStep(isotopeCount, unknownCount)) {
		return unknownCount > 0 ? 'Back: Last Unknown Material' : 'Back: Unknown Count';
	}

	return 'Back';
}

/**
 * Determine the next button text based on current step
 */
export function getNextButtonText(
	step: number,
	isotopeCount: number,
	unknownCount: number
): string {
	if (step < STEP_CONSTANTS.ISOTOPE_COUNT) {
		return 'Next: Number of Isotopes';
	}

	const refMaterialStep = getReferenceMaterialStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount);
	const reviewStep = getReviewStep(isotopeCount, unknownCount);

	// From isotope count to isotope info
	if (step === STEP_CONSTANTS.ISOTOPE_COUNT) {
		return isotopeCount === 1 ? 'Next: Isotope Information' : 'Next: Isotope 1 Information';
	}

	// From isotope info steps
	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < refMaterialStep) {
		const currentIsoIndex = getIsotopeIndex(step);
		const nextIsoIndex = currentIsoIndex + 1;

		if (nextIsoIndex < isotopeCount) {
			return `Next: Isotope ${nextIsoIndex + 1} Information`;
		} else {
			return 'Next: Reference Material';
		}
	}

	// From reference material
	if (step === refMaterialStep) {
		return 'Next: Number of Unknowns';
	}

	// From unknown count
	if (step === unknownCountStep) {
		return unknownCount === 1
			? 'Next: Unknown Material Information'
			: 'Next: Unknown 1 Information';
	}

	// From unknown info steps
	if (step > unknownCountStep && step < reviewStep) {
		const currentUnknownIdx = getUnknownIndex(step, isotopeCount);
		const nextUnknownIdx = currentUnknownIdx + 1;

		if (nextUnknownIdx < unknownCount) {
			return `Next: Unknown ${nextUnknownIdx + 1} Information`;
		} else {
			return 'Next: Review All';
		}
	}

	return 'Review All Information';
}

/**
 * Calculate progress percentage
 */
export function getProgressPercentage(
	step: number,
	isotopeCount: number,
	unknownCount: number
): number {
	const totalSteps = getReviewStep(isotopeCount, unknownCount);
	return Math.round((step / totalSteps) * 100);
}
