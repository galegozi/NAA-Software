// Reexport your entry components here

// Export types
export type {
	IsotopeInfo,
	CountData,
	DeadTimeType,
	BaseMaterialInfo,
	ReferenceMaterial,
	UnknownMaterial,
	Materials,
	RoiData
} from './types.js';

// Export utilities
export {
	createIsotopeInfo,
	createCountData,
	createCountDataArray,
	createReferenceMaterial,
	createUnknownMaterial,
	findRoiIndices
} from './utils/naaUtils.js';

export {
	APP_VERSION,
	STEP_CONSTANTS,
	StepType,
	getReferenceMaterialStep,
	getUnknownCountStep,
	getReviewStep,
	getIsotopeIndex,
	getUnknownIndex,
	getStepType,
	getUserFacingStepNumber,
	getStepTitle,
	getNextButtonText,
	getBackButtonText,
	getProgressPercentage,
	canProceedFromStep
} from './utils/stepUtils.js';

export type { NAAState } from './utils/stateManager.js';
export {
	createInitialState,
	updateIsotopeCount,
	updateUnknownCount,
	nextStep,
	prevStep
} from './utils/stateManager.js';

// Export optimization utilities
export { memoize, debounce } from './utils/optimization.js';
