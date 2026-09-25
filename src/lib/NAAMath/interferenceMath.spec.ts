import { describe, expect, it } from 'vitest';
import {
	combinedRelativeUncertainty,
	computeInterferenceCorrection,
	relative,
	type InterferenceCorrectionInputs
} from './interferenceMath.ts';

// Mg-27 in a rock, with Al-27(n,p)Mg-27 interference (values in ppm; f is
// dimensionless, so ppm and mass fractions give identical arithmetic).
const mgExample: InterferenceCorrectionInputs = {
	k: 1.2,
	targetInStandard: 20000, // Mg in the standard
	interferents: [{ factor: 0.01, inStandard: 80000, inUnknown: 150000 }] // Al
};

describe('interferenceMath', () => {
	it('matches the worked Mg/Al example', () => {
		// 1.2·(20000 + 0.01·80000) − 0.01·150000 = 24960 − 1500 = 23460
		const result = computeInterferenceCorrection(mgExample);
		expect(result.uncorrected).toBeCloseTo(24000, 8);
		expect(result.corrected).toBeCloseTo(23460, 8);
		expect(result.interferenceFraction).toBeCloseTo(1500 / 24960, 12);
		expect(result.overCorrected).toBe(false);
	});

	it('sums several interferents (Na-24 from Mg and Al)', () => {
		// 1.1·(10000 + 0.002·5000 + 0.0005·60000) − 0.002·20000 − 0.0005·100000
		// = 1.1·10040 − 40 − 50 = 10954
		const result = computeInterferenceCorrection({
			k: 1.1,
			targetInStandard: 10000,
			interferents: [
				{ factor: 0.002, inStandard: 5000, inUnknown: 20000 },
				{ factor: 0.0005, inStandard: 60000, inUnknown: 100000 }
			]
		});
		expect(result.corrected).toBeCloseTo(10954, 8);
	});

	it('is the plain result with no interferents or a zero factor', () => {
		expect(computeInterferenceCorrection({ ...mgExample, interferents: [] }).corrected).toBe(24000);
		const zero = computeInterferenceCorrection({
			...mgExample,
			interferents: [{ factor: 0, inStandard: 80000, inUnknown: 150000 }]
		});
		expect(zero.corrected).toBeCloseTo(24000, 8);
		expect(zero.interferenceFraction).toBe(0);
	});

	it('flags an over-correction when interference swamps the target', () => {
		const result = computeInterferenceCorrection({
			k: 1,
			targetInStandard: 10,
			interferents: [{ factor: 0.01, inStandard: 0, inUnknown: 5000 }]
		});
		expect(result.corrected).toBeCloseTo(-40, 10);
		expect(result.overCorrected).toBe(true);
		expect(result.interferenceFraction).toBeGreaterThan(1);
	});

	it('combines relative uncertainties as a Pythagorean norm, dropping bad terms', () => {
		expect(combinedRelativeUncertainty([0.06, 0.08, 0.1])).toBeCloseTo(Math.sqrt(0.02), 12);
		expect(combinedRelativeUncertainty([0.06, NaN, -1, 0])).toBeCloseTo(0.06, 12);
		expect(relative(0.0005, 0.01)).toBeCloseTo(0.05, 12);
		expect(relative(null, 0.01)).toBe(0);
		expect(relative(1, 0)).toBe(0);
	});
});
