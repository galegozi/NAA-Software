/**
 * Enhanced step utilities with user-facing step numbers and display helpers
 */

export const APP_VERSION = '7.0 ALPHA';

export const STEP_CONSTANTS = {
	UNAUTHED: {
		WELCOME: 0,
		ISOTOPE_COUNT: 1,
		ISOTOPE_INFO_START: 2,
		REFERENCE_MATERIAL_OFFSET: 2,
		REFERENCE_COUNT_OFFSET: 2,
		REFERENCE_INFO_OFFSET: 3,
		UNKNOWN_COUNT_OFFSET: 4,
		UNKNOWN_INFO_OFFSET: 5
	},
	AUTHED: {
		WELCOME: 0,
		ISOTOPE_DROPDOWN: 1
	}
} as const;

/**
 * Step type enumeration
 */
export enum StepType {
	WELCOME = 'WELCOME',
	ISOTOPE_SELECT = 'ISOTOPE_SELECT',
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

function getWelcomeStep(): number {
	return STEP_CONSTANTS.UNAUTHED.WELCOME;
}

function getInitialIsotopeStep(authenticated: boolean): number {
	return authenticated
		? STEP_CONSTANTS.AUTHED.ISOTOPE_DROPDOWN
		: STEP_CONSTANTS.UNAUTHED.ISOTOPE_COUNT;
}

function getIsotopeInfoStartStep(): number {
	return STEP_CONSTANTS.UNAUTHED.ISOTOPE_INFO_START;
}

function getNavigationStepLabel(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number,
	authenticated = false
): string {
	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const stepType = getStepType(
		step,
		isotopeCount,
		referenceCount,
		resolvedUnknownCount,
		authenticated
	);

	switch (stepType) {
		case StepType.WELCOME:
			return 'Welcome';
		case StepType.ISOTOPE_SELECT:
			return 'Select Isotopes';
		case StepType.ISOTOPE_COUNT:
			return 'Number of Elements';
		case StepType.ISOTOPE_INFO: {
			const isoIndex = getIsotopeIndex(step);
			return isotopeCount === 1
				? 'Element Information'
				: `Element ${isoIndex + 1} Information`;
		}
		case StepType.REFERENCE_COUNT:
			return 'Number of Reference Materials';
		case StepType.REFERENCE_INFO: {
			const refIndex = step - getReferenceInfoStartStep(isotopeCount, authenticated);
			return referenceCount === 1
				? 'Reference Material Information'
				: `Reference Material ${refIndex + 1} Information`;
		}
		case StepType.UNKNOWN_COUNT:
			return 'Number of Unknown Materials';
		case StepType.UNKNOWN_INFO: {
			const unknownIndex = getUnknownIndex(
				step,
				isotopeCount,
				referenceCount,
				resolvedUnknownCount,
				authenticated
			);
			return resolvedUnknownCount === 1
				? 'Unknown Material Information'
				: `Unknown ${unknownIndex + 1} Information`;
		}
		case StepType.REVIEW:
			return 'Review All Information';
		default:
			return 'Step';
	}
}

/**
 * Calculate the step number for reference material input
 */
// export function getReferenceMaterialStep(isotopeCount: number, authenticated: boolean): number {
// 	return STEP_CONSTANTS[authenticated ? 'AUTHED' : 'UNAUTHED'].REFERENCE_MATERIAL_OFFSET + isotopeCount;
// }

/**
 * Calculate the step number for reference material count input.
 * Returns -1 for authenticated users (step is skipped; reference count defaults to 1).
 */
export function getReferenceCountStep(isotopeCount: number, authenticated = false): number {
	if (authenticated) return -1;
	return STEP_CONSTANTS.UNAUTHED.REFERENCE_COUNT_OFFSET + isotopeCount;
}

/**
 * Calculate the start step for reference material info.
 * For authenticated users this is directly after the isotope select step (no count step).
 */
export function getReferenceInfoStartStep(isotopeCount: number, authenticated = false): number {
	if (authenticated) return getInitialIsotopeStep(true) + 1;
	return getReferenceCountStep(isotopeCount, authenticated) + 1;
}

/**
 * Calculate the step number for isotope-reference matching
 */
export function getReferenceMatchStep(
	isotopeCount: number,
	referenceCount = 1,
	authenticated = false
): number {
	return getReferenceInfoStartStep(isotopeCount, authenticated) + referenceCount;
}

/**
 * Calculate the step number for unknown count input
 */
export function getUnknownCountStep(
	isotopeCount: number,
	referenceCount = 1,
	authenticated = false
): number {
	return getReferenceInfoStartStep(isotopeCount, authenticated) + referenceCount;
}

/**
 * Calculate the start step for unknown info
 */
export function getUnknownInfoStartStep(
	isotopeCount: number,
	referenceCount = 1,
	authenticated = false
): number {
	return getUnknownCountStep(isotopeCount, referenceCount, authenticated) + 1;
}

export function getReviewStep(
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number,
	authenticated = false
): number {
	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	return (
		getUnknownInfoStartStep(isotopeCount, referenceCount, authenticated) + resolvedUnknownCount
	);
}

/**
 * Calculate isotope index from current step
 */
export function getIsotopeIndex(step: number): number {
	return step - getIsotopeInfoStartStep();
}

/**
 * Calculate unknown index from current step and isotope count
 */
export function getUnknownIndex(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount?: number,
	unknownCount?: number,
	authenticated = false
): number {
	const { referenceCount } = normalizeCounts(
		referenceCountOrUnknownCount ?? 1,
		unknownCount
	);
	return step - getUnknownInfoStartStep(isotopeCount, referenceCount, authenticated);
}

/**
 * Get the current step type
 */
export function getStepType(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number,
	authenticated = false
): StepType {
	if (step === getWelcomeStep()) return StepType.WELCOME;
	if (step === getInitialIsotopeStep(authenticated)) {
		return authenticated ? StepType.ISOTOPE_SELECT : StepType.ISOTOPE_COUNT;
	}

	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const referenceCountStep = getReferenceCountStep(isotopeCount, authenticated);
	const referenceInfoStartStep = getReferenceInfoStartStep(isotopeCount, authenticated);
	const unknownCountStep = getUnknownCountStep(isotopeCount, referenceCount, authenticated);
	const reviewStep = getReviewStep(
		isotopeCount,
		referenceCount,
		resolvedUnknownCount,
		authenticated
	);

	if (!authenticated && step >= getIsotopeInfoStartStep() && step < referenceCountStep) {
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
	unknownCount?: number,
	authenticated = false
): number {
	if (step === getWelcomeStep()) return 0;
	if (step === getInitialIsotopeStep(authenticated)) return 1;

	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const referenceCountStep = getReferenceCountStep(isotopeCount, authenticated);
	const unknownCountStep = getUnknownCountStep(isotopeCount, referenceCount, authenticated);
	const reviewStep = getReviewStep(
		isotopeCount,
		referenceCount,
		resolvedUnknownCount,
		authenticated
	);

	if (!authenticated && step >= getIsotopeInfoStartStep() && step < reviewStep) return step;
	if (authenticated && step > getInitialIsotopeStep(true) && step <= reviewStep) return step;
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
	unknownCount?: number,
	authenticated = false
): string {
	const stepType = getStepType(
		step,
		isotopeCount,
		referenceCountOrUnknownCount,
		unknownCount,
		authenticated
	);
	const stepNum = getUserFacingStepNumber(
		step,
		isotopeCount,
		referenceCountOrUnknownCount,
		unknownCount,
		authenticated
	);
	const { referenceCount } = normalizeCounts(referenceCountOrUnknownCount, unknownCount);

	switch (stepType) {
		case StepType.WELCOME:
			return 'Welcome';
		case StepType.ISOTOPE_SELECT:
			return `Step ${stepNum}: Select Isotopes`;
		case StepType.ISOTOPE_COUNT:
			return `Step ${stepNum}: Number of Elements`;
		case StepType.ISOTOPE_INFO: {
			const isoIndex = getIsotopeIndex(step);
			return `Step ${stepNum}: Element Information for Isotope ${isoIndex + 1}`;
		}
		case StepType.REFERENCE_COUNT:
			return `Step ${stepNum}: Number of Reference Materials`;
		case StepType.REFERENCE_INFO: {
			const refIndex = step - getReferenceInfoStartStep(isotopeCount, authenticated);
			return `Step ${stepNum}: Reference Material Information for Reference ${refIndex + 1}`;
		}
		case StepType.UNKNOWN_COUNT:
			return `Step ${stepNum}: Number of Unknown Materials`;
		case StepType.UNKNOWN_INFO: {
			const unknownIdx = getUnknownIndex(
				step,
				isotopeCount,
				referenceCount,
				undefined,
				authenticated
			);
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
	unknownCount?: number,
	authenticated = false
): string {
	if (step <= getWelcomeStep()) {
		return 'Back';
	}

	return `Back: ${getNavigationStepLabel(
		step - 1,
		isotopeCount,
		referenceCountOrUnknownCount,
		unknownCount,
		authenticated
	)}`;
}

/**
 * Determine the next button text based on current step
 */
export function getNextButtonText(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number,
	authenticated = false
): string {
	if (step < getWelcomeStep()) {
		return `Next: ${getNavigationStepLabel(
			getWelcomeStep(),
			isotopeCount,
			referenceCountOrUnknownCount,
			unknownCount,
			authenticated
		)}`;
	}

	const { referenceCount, unknownCount: resolvedUnknownCount } =
		normalizeCounts(referenceCountOrUnknownCount, unknownCount);
	const reviewStep = getReviewStep(
		isotopeCount,
		referenceCount,
		resolvedUnknownCount,
		authenticated
	);

	if (step >= reviewStep) {
		return 'Review All Information';
	}

	return `Next: ${getNavigationStepLabel(
		step + 1,
		isotopeCount,
		referenceCountOrUnknownCount,
		unknownCount,
		authenticated
	)}`;
}

/**
 * Calculate progress percentage
 */
export function getProgressPercentage(
	step: number,
	isotopeCount: number,
	referenceCountOrUnknownCount: number,
	unknownCount?: number,
	authenticated = false
): number {
	const totalSteps = getReviewStep(
		isotopeCount,
		referenceCountOrUnknownCount,
		unknownCount,
		authenticated
	);
	return Math.round((step / totalSteps) * 100);
}
