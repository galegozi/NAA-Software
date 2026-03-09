/**
 * Enhanced step utilities with user-facing step numbers and display helpers
 */

export const APP_VERSION = '5.0 ALPHA';

export const STEP_CONSTANTS = {
	WELCOME: 0,
	ISOTOPE_COUNT: 1,
	ISOTOPE_INFO_START: 2,
	REFERENCE_MATERIAL_OFFSET: 2,
	REFERENCE_COUNT_OFFSET: 2,
	REFERENCE_INFO_OFFSET: 3,
	UNKNOWN_COUNT_OFFSET: 4,
	UNKNOWN_INFO_OFFSET: 5
} as const;

/**
 * Step type enumeration
 */
export enum StepType {
	WELCOME = 'WELCOME',
	ISOTOPE_COUNT = 'ISOTOPE_COUNT',
	ISOTOPE_INFO = 'ISOTOPE_INFO',
	REFERENCE_COUNT = 'REFERENCE_COUNT',
	REFERENCE_INFO = 'REFERENCE_INFO',
	REFERENCE_MATCH = 'REFERENCE_MATCH',
	UNKNOWN_COUNT = 'UNKNOWN_COUNT',
	UNKNOWN_INFO = 'UNKNOWN_INFO',
	REVIEW = 'REVIEW'
}

function normalizeCounts(referenceCountOrUnknownCount: number, unknownCount?: number) {
	const hasExplicitUnknown = typeof unknownCount === 'number';
	return {
		referenceCount: hasExplicitUnknown ? referenceCountOrUnknownCount : 1,
		unknownCount: hasExplicitUnknown ? unknownCount : referenceCountOrUnknownCount
	};
}

/**
 * Calculate the step number for reference material input
 */
export function getReferenceMaterialStep(isotopeCount: number): number {
	return STEP_CONSTANTS.REFERENCE_MATERIAL_OFFSET + isotopeCount;
}

/**
 * Calculate the step number for reference material count input
 */
export function getReferenceCountStep(isotopeCount: number): number {
	return STEP_CONSTANTS.REFERENCE_COUNT_OFFSET + isotopeCount;
}

/**
 * Calculate the start step for reference material info
 */
export function getReferenceInfoStartStep(isotopeCount: number): number {
	return STEP_CONSTANTS.REFERENCE_INFO_OFFSET + isotopeCount;
}

/**
 * Calculate the step number for isotope-reference matching
 */
export function getReferenceMatchStep(isotopeCount: number, referenceCount = 1): number {
	return getReferenceInfoStartStep(isotopeCount) + referenceCount;
}

/**
 * Calculate the step number for unknown count input
 */
export function getUnknownCountStep(isotopeCount: number, referenceCount = 1): number {
	return getReferenceInfoStartStep(isotopeCount) + referenceCount;
}

/**
 * Calculate the start step for unknown info
 */
export function getUnknownInfoStartStep(isotopeCount: number, referenceCount = 1): number {
	return getUnknownCountStep(isotopeCount, referenceCount) + 1;
}

/**
 * Calculate the step number for review
 */
export function getReviewStep(
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number
): number {
	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	return getUnknownInfoStartStep(isotopeCount, referenceCount) + resolvedUnknownCount;
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
export function getUnknownIndex(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount?: number,
	unknownCount?: number
): number {
	const { referenceCount } = normalizeCounts(
		referenceCountOrUnknownCount ?? 1,
		unknownCount
	);
	return step - getUnknownInfoStartStep(isotopeCount, referenceCount);
}

/**
 * Get the current step type
 */
export function getStepType(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number
): StepType {
	if (step === STEP_CONSTANTS.WELCOME) return StepType.WELCOME;
	if (step === STEP_CONSTANTS.ISOTOPE_COUNT) return StepType.ISOTOPE_COUNT;

	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const referenceCountStep = getReferenceCountStep(isotopeCount);
	const referenceInfoStartStep = getReferenceInfoStartStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount, referenceCount);
	const reviewStep = getReviewStep(isotopeCount, referenceCount, resolvedUnknownCount);

	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < referenceCountStep) {
		return StepType.ISOTOPE_INFO;
	}

	if (step === referenceCountStep) return StepType.REFERENCE_COUNT;
	if (step >= referenceInfoStartStep && step < unknownCountStep) {
		return StepType.REFERENCE_INFO;
	}
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
	referenceCountOrUnknownCount: number,
	unknownCount?: number
): number {
	if (step === STEP_CONSTANTS.WELCOME) return 0;
	if (step === STEP_CONSTANTS.ISOTOPE_COUNT) return 1;

	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const referenceCountStep = getReferenceCountStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount, referenceCount);
	const reviewStep = getReviewStep(isotopeCount, referenceCount, resolvedUnknownCount);

	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < reviewStep) return step;
	if (step === reviewStep) return step;
	if (step === referenceCountStep) return step;
	if (step === unknownCountStep) return step;
	return step;
}

/**
 * Get step title for display
 */
export function getStepTitle(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number
): string {
	const stepType = getStepType(
		step,
		isotopeCount,
		referenceCountOrUnknownCount,
		unknownCount
	);
	const stepNum = getUserFacingStepNumber(
		step,
		isotopeCount,
		referenceCountOrUnknownCount,
		unknownCount
	);
	const { referenceCount } = normalizeCounts(referenceCountOrUnknownCount, unknownCount);

	switch (stepType) {
		case StepType.WELCOME:
			return 'Welcome';
		case StepType.ISOTOPE_COUNT:
			return `Step ${stepNum}: Number of Isotopes`;
		case StepType.ISOTOPE_INFO: {
			const isoIndex = getIsotopeIndex(step);
			return `Step ${stepNum}: Isotope Information for Isotope ${isoIndex + 1}`;
		}
		case StepType.REFERENCE_COUNT:
			return `Step ${stepNum}: Number of Reference Materials`;
		case StepType.REFERENCE_INFO: {
			const refIndex = step - getReferenceInfoStartStep(isotopeCount);
			return `Step ${stepNum}: Reference Material Information for Reference ${refIndex + 1}`;
		}
		case StepType.REFERENCE_MATCH:
			return `Step ${stepNum}: Match Isotopes to References`;
		case StepType.UNKNOWN_COUNT:
			return `Step ${stepNum}: Number of Unknown Materials`;
		case StepType.UNKNOWN_INFO: {
			const unknownIdx = getUnknownIndex(step, isotopeCount, referenceCount);
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
referenceCountOrUnknownCount: number,
unknownCount?: number
): string {
	if (step <= STEP_CONSTANTS.ISOTOPE_COUNT) {
		return 'Back';
	}

	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const referenceCountStep = getReferenceCountStep(isotopeCount);
	const referenceInfoStartStep = getReferenceInfoStartStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount, referenceCount);

	// From isotope info steps
	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < referenceCountStep) {
		if (step === STEP_CONSTANTS.ISOTOPE_INFO_START) {
			return 'Back: Number of Isotopes';
		}
		return 'Back: Previous Isotope';
	}

	if (step === referenceCountStep) {
		return 'Back: Last Isotope Information';
	}

	if (step >= referenceInfoStartStep && step < unknownCountStep) {
		if (step === referenceInfoStartStep) {
			return 'Back: Number of Reference Materials';
		}
		return 'Back: Previous Reference Material';
	}

	// From unknown count
	if (step === unknownCountStep) {
		return 'Back: Last Reference Material';
	}

	// From unknown info steps
	if (step > unknownCountStep && step < getReviewStep(isotopeCount, referenceCount, resolvedUnknownCount)) {
		if (step === unknownCountStep + 1) {
			return 'Back: Number of Unknown Materials';
		}
		return 'Back: Previous Unknown Material';
	}

	// From review
	if (step === getReviewStep(isotopeCount, referenceCount, resolvedUnknownCount)) {
		return resolvedUnknownCount > 0 ? 'Back: Last Unknown Material' : 'Back: Unknown Count';
	}

	return 'Back';
}

/**
 * Determine the next button text based on current step
 */
export function getNextButtonText(
step: number,
isotopeCount: number,
referenceCountOrUnknownCount: number,
unknownCount?: number
): string {
	if (step < STEP_CONSTANTS.ISOTOPE_COUNT) {
		return 'Next: Number of Isotopes';
	}

	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const referenceCountStep = getReferenceCountStep(isotopeCount);
	const referenceInfoStartStep = getReferenceInfoStartStep(isotopeCount);
	const unknownCountStep = getUnknownCountStep(isotopeCount, referenceCount);
	const reviewStep = getReviewStep(isotopeCount, referenceCount, resolvedUnknownCount);

	// From isotope count to isotope info
	if (step === STEP_CONSTANTS.ISOTOPE_COUNT) {
		return isotopeCount === 1 ? 'Next: Isotope Information' : 'Next: Isotope 1 Information';
	}

	// From isotope info steps
	if (step >= STEP_CONSTANTS.ISOTOPE_INFO_START && step < referenceCountStep) {
		const currentIsoIndex = getIsotopeIndex(step);
		const nextIsoIndex = currentIsoIndex + 1;

		if (nextIsoIndex < isotopeCount) {
			return `Next: Isotope ${nextIsoIndex + 1} Information`;
		} else {
			return 'Next: Number of Reference Materials';
		}
	}

	if (step === referenceCountStep) {
		return referenceCount === 1
			? 'Next: Reference Material Information'
			: 'Next: Reference Material 1 Information';
	}

	if (step >= referenceInfoStartStep && step < unknownCountStep) {
		const currentRefIndex = step - referenceInfoStartStep;
		const nextRefIndex = currentRefIndex + 1;

		if (nextRefIndex < referenceCount) {
			return `Next: Reference Material ${nextRefIndex + 1} Information`;
		}
		return 'Next: Number of Unknown Materials';
	}

	// From unknown count
	if (step === unknownCountStep) {
		return resolvedUnknownCount === 1
			? 'Next: Unknown Material Information'
			: 'Next: Unknown 1 Information';
	}

	// From unknown info steps
	if (step > unknownCountStep && step < reviewStep) {
		const currentUnknownIdx = getUnknownIndex(step, isotopeCount, referenceCount);
		const nextUnknownIdx = currentUnknownIdx + 1;

		if (nextUnknownIdx < resolvedUnknownCount) {
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
referenceCountOrUnknownCount: number,
unknownCount?: number
): number {
	const totalSteps = getReviewStep(isotopeCount, referenceCountOrUnknownCount, unknownCount);
	return Math.round((step / totalSteps) * 100);
}
