import { describe, expect, it } from 'vitest';

import {
	getBackButtonText,
	getNextButtonText,
	getReferenceCountStep,
	getReferenceInfoStartStep,
	getReviewStep,
	getUnknownCountStep,
	getUnknownInfoStartStep
} from './stepUtils.js';

describe('stepUtils navigation button text', () => {
	it('describes adjacent unauthenticated steps accurately', () => {
		expect(getBackButtonText(1, 2, 2, 2, false)).toBe('Back: Welcome');
		expect(getNextButtonText(1, 2, 2, 2, false)).toBe('Next: Element 1 Information');
		expect(getBackButtonText(2, 2, 2, 2, false)).toBe('Back: Number of Elements');
		expect(getNextButtonText(2, 2, 2, 2, false)).toBe('Next: Element 2 Information');
		expect(getNextButtonText(3, 2, 2, 2, false)).toBe('Next: Number of Reference Materials');
	});

	it('describes reference and unknown transitions accurately', () => {
		const isotopeCount = 2;
		const referenceCount = 2;
		const unknownCount = 2;
		const referenceCountStep = getReferenceCountStep(isotopeCount, false);
		const firstReferenceInfoStep = getReferenceInfoStartStep(isotopeCount, false);
		const unknownCountStep = getUnknownCountStep(isotopeCount, referenceCount, false);
		const firstUnknownInfoStep = getUnknownInfoStartStep(isotopeCount, referenceCount, false);
		const reviewStep = getReviewStep(isotopeCount, referenceCount, unknownCount, false);

		expect(getBackButtonText(referenceCountStep, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Back: Element 2 Information'
		);
		expect(getNextButtonText(referenceCountStep, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Next: Reference Material 1 Information'
		);
		expect(getBackButtonText(firstReferenceInfoStep, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Back: Number of Reference Materials'
		);
		expect(getNextButtonText(firstReferenceInfoStep + 1, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Next: Number of Unknown Materials'
		);
		expect(getBackButtonText(unknownCountStep, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Back: Reference Material 2 Information'
		);
		expect(getNextButtonText(unknownCountStep, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Next: Unknown 1 Information'
		);
		expect(getBackButtonText(firstUnknownInfoStep, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Back: Number of Unknown Materials'
		);
		expect(getNextButtonText(firstUnknownInfoStep + 1, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Next: Review All Information'
		);
		expect(getBackButtonText(reviewStep, isotopeCount, referenceCount, unknownCount, false)).toBe(
			'Back: Unknown 2 Information'
		);
	});

	it('describes authenticated transitions accurately', () => {
		const isotopeCount = 2;
		const referenceCount = 2;
		const unknownCount = 1;
		const selectStep = 1;
		const firstReferenceInfoStep = getReferenceInfoStartStep(isotopeCount, true);

		expect(getBackButtonText(selectStep, isotopeCount, referenceCount, unknownCount, true)).toBe(
			'Back: Welcome'
		);
		// Reference count step is skipped for authenticated users — goes straight to reference info
		expect(getNextButtonText(selectStep, isotopeCount, referenceCount, unknownCount, true)).toBe(
			'Next: Select Reference Materials'
		);
		expect(getBackButtonText(firstReferenceInfoStep, isotopeCount, referenceCount, unknownCount, true)).toBe(
			'Back: Select Isotopes'
		);
		expect(getNextButtonText(firstReferenceInfoStep, isotopeCount, referenceCount, unknownCount, true)).toBe(
			'Next: Number of Unknown Materials'
		);
	});
});