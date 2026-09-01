import { describe, expect, it } from 'vitest';

import {
	getBackButtonText,
	getNextButtonText,
	getProgressPercentage,
	getReviewStep,
	getStepTitle,
	getStepType,
	REVIEW_STEP,
	STEP,
	StepType,
	TOTAL_STEPS
} from './stepUtils.js';

describe('stepUtils fixed 5-step flow', () => {
	it('maps step numbers to step types and clamps out-of-range values', () => {
		expect(getStepType(0)).toBe(StepType.WELCOME);
		expect(getStepType(1)).toBe(StepType.SELECT_ISOTOPES);
		expect(getStepType(2)).toBe(StepType.BUILD_LIBRARY);
		expect(getStepType(3)).toBe(StepType.UNKNOWN_MATERIALS);
		expect(getStepType(4)).toBe(StepType.REVIEW);
		expect(getStepType(5)).toBe(StepType.REVIEW);
		expect(getStepType(-1)).toBe(StepType.WELCOME);
	});

	it('builds step titles', () => {
		expect(getStepTitle(0)).toBe('Welcome');
		expect(getStepTitle(1)).toBe('Step 1: Select Isotopes');
		expect(getStepTitle(2)).toBe('Step 2: Build Library');
		expect(getStepTitle(3)).toBe('Step 3: Unknown Materials');
		expect(getStepTitle(4)).toBe('Step 4: Review');
	});

	it('describes the back button target', () => {
		expect(getBackButtonText(0)).toBe('Back');
		expect(getBackButtonText(1)).toBe('Back: Welcome');
		expect(getBackButtonText(2)).toBe('Back: Select Isotopes');
		expect(getBackButtonText(3)).toBe('Back: Build Library');
		expect(getBackButtonText(4)).toBe('Back: Unknown Materials');
	});

	it('describes the next button target', () => {
		expect(getNextButtonText(0)).toBe('Next: Select Isotopes');
		expect(getNextButtonText(1)).toBe('Next: Build Library');
		expect(getNextButtonText(2)).toBe('Next: Unknown Materials');
		expect(getNextButtonText(3)).toBe('Next: Review');
		expect(getNextButtonText(4)).toBe('Review All Information');
	});

	it('computes progress percentage', () => {
		expect(getProgressPercentage(0)).toBe(0);
		expect(getProgressPercentage(1)).toBe(25);
		expect(getProgressPercentage(2)).toBe(50);
		expect(getProgressPercentage(3)).toBe(75);
		expect(getProgressPercentage(4)).toBe(100);
	});

	it('exposes the review step constants', () => {
		expect(getReviewStep()).toBe(4);
		expect(REVIEW_STEP).toBe(4);
		expect(TOTAL_STEPS).toBe(4);
		expect(STEP.REVIEW).toBe(4);
	});
});
