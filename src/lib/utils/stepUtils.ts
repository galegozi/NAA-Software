/**
 * Step utilities for the unified analyze wizard.
 *
 * The wizard is a single fixed flow for every environment:
 *   0 Welcome -> 1 Select Isotopes -> 2 Build Library -> 3 Unknown Materials -> 4 Review
 */

export const APP_VERSION = '7.1.1 BETA';

/**
 * Step type enumeration
 */
export enum StepType {
	WELCOME = 'WELCOME',
	SELECT_ISOTOPES = 'SELECT_ISOTOPES',
	BUILD_LIBRARY = 'BUILD_LIBRARY',
	UNKNOWN_MATERIALS = 'UNKNOWN_MATERIALS',
	REVIEW = 'REVIEW'
}

/**
 * Fixed step numbers (0-indexed; step 0 is the welcome screen).
 */
export const STEP = {
	WELCOME: 0,
	SELECT_ISOTOPES: 1,
	BUILD_LIBRARY: 2,
	UNKNOWN_MATERIALS: 3,
	REVIEW: 4
} as const;

/** Last step of the wizard. */
export const REVIEW_STEP = STEP.REVIEW;

/** Denominator for progress ("Step X of TOTAL_STEPS"). */
export const TOTAL_STEPS = STEP.REVIEW;

const STEP_ORDER: StepType[] = [
	StepType.WELCOME,
	StepType.SELECT_ISOTOPES,
	StepType.BUILD_LIBRARY,
	StepType.UNKNOWN_MATERIALS,
	StepType.REVIEW
];

const STEP_SHORT_LABEL: Record<StepType, string> = {
	[StepType.WELCOME]: 'Welcome',
	[StepType.SELECT_ISOTOPES]: 'Select Isotopes',
	[StepType.BUILD_LIBRARY]: 'Build Library',
	[StepType.UNKNOWN_MATERIALS]: 'Unknown Materials',
	[StepType.REVIEW]: 'Review'
};

function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high);
}

/**
 * Get the current step type
 */
export function getStepType(step: number): StepType {
	return STEP_ORDER[clamp(Math.trunc(step), 0, REVIEW_STEP)] ?? StepType.REVIEW;
}

/**
 * Get step title for display
 */
export function getStepTitle(step: number): string {
	if (step <= STEP.WELCOME) {
		return 'Welcome';
	}
	const clampedStep = clamp(Math.trunc(step), 0, REVIEW_STEP);
	return `Step ${clampedStep}: ${STEP_SHORT_LABEL[getStepType(clampedStep)]}`;
}

/**
 * Determine the back button text based on current step
 */
export function getBackButtonText(step: number): string {
	if (step <= STEP.WELCOME) {
		return 'Back';
	}
	return `Back: ${STEP_SHORT_LABEL[getStepType(step - 1)]}`;
}

/**
 * Determine the next button text based on current step
 */
export function getNextButtonText(step: number): string {
	if (step >= REVIEW_STEP) {
		return 'Review All Information';
	}
	return `Next: ${STEP_SHORT_LABEL[getStepType(step + 1)]}`;
}

/**
 * Calculate progress percentage
 */
export function getProgressPercentage(step: number): number {
	return Math.round((clamp(Math.trunc(step), 0, REVIEW_STEP) / REVIEW_STEP) * 100);
}

/**
 * The final review step number.
 */
export function getReviewStep(): number {
	return REVIEW_STEP;
}
