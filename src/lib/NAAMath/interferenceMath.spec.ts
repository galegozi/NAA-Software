import { describe, expect, it } from 'vitest';
import { fissionCorrectedMassFraction } from './fissionCorrectionMath.ts';
import {
	combinedRelativeUncertainty,
	computeInterferenceCorrection,
	interferenceCorrectedMassFraction,
	interferenceFactorFromMeasurement,
	type InterferenceCorrectionInputs
} from './interferenceMath.ts';
import { primaryInterferencesFor } from '$lib/utils/primaryInterferences.js';

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
		expect(result.delta).toBeCloseTo(-540, 8);
		expect(result.interferenceFraction).toBeCloseTo(1500 / 24960, 12);
		expect(result.overCorrected).toBe(false);
	});

	it('reduces to the fission correction with a single interferent', () => {
		const fission = {
			k: 1.25,
			f: 0.08,
			targetInStandard: 40,
			fissileInStandard: 5,
			fissileInUnknown: 30
		};
		const general = interferenceCorrectedMassFraction({
			k: fission.k,
			targetInStandard: fission.targetInStandard,
			interferents: [
				{
					factor: fission.f,
					inStandard: fission.fissileInStandard,
					inUnknown: fission.fissileInUnknown
				}
			]
		});
		expect(general).toBeCloseTo(fissionCorrectedMassFraction(fission), 12);
		expect(general).toBeCloseTo(48.1, 10);
	});

	it('sums several interferents (Na-24 from Mg and Al)', () => {
		// k·(Ct_S + fMg·Mg_S + fAl·Al_S) − fMg·Mg_U − fAl·Al_U
		// = 1.1·(10000 + 0.002·5000 + 0.0005·60000) − 0.002·20000 − 0.0005·100000
		// = 1.1·10040 − 40 − 50 = 11044 − 90 = 10954
		const corrected = interferenceCorrectedMassFraction({
			k: 1.1,
			targetInStandard: 10000,
			interferents: [
				{ factor: 0.002, inStandard: 5000, inUnknown: 20000 },
				{ factor: 0.0005, inStandard: 60000, inUnknown: 100000 }
			]
		});
		expect(corrected).toBeCloseTo(10954, 8);
	});

	it('is a no-op with no interferents or zero factors', () => {
		expect(interferenceCorrectedMassFraction({ ...mgExample, interferents: [] })).toBe(24000);
		const zero = computeInterferenceCorrection({
			...mgExample,
			interferents: [{ factor: 0, inStandard: 80000, inUnknown: 150000 }]
		});
		expect(zero.delta).toBe(0);
		expect(zero.interferenceFraction).toBe(0);
	});

	it('uses factorInUnknown for the unknown term when given', () => {
		// 1.2·(20000 + 0.01·80000) − 0.02·150000 = 24960 − 3000 = 21960
		const corrected = interferenceCorrectedMassFraction({
			...mgExample,
			interferents: [{ factor: 0.01, factorInUnknown: 0.02, inStandard: 80000, inUnknown: 150000 }]
		});
		expect(corrected).toBeCloseTo(21960, 8);
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

	it('derives a factor from a pure-interferent irradiation', () => {
		// Pure Al foil (100% Al) reads as 1.0% "Mg" → f = 0.01; 3% and 4% relative → 5%
		const { factor, uncertainty } = interferenceFactorFromMeasurement({
			apparentTarget: 0.01,
			apparentTargetUncertainty: 0.0003,
			interferentConcentration: 1,
			interferentConcentrationUncertainty: 0.04
		});
		expect(factor).toBeCloseTo(0.01, 12);
		expect(uncertainty).toBeCloseTo(0.0005, 12);
	});

	it('combines relative uncertainties as a Pythagorean norm, dropping bad terms', () => {
		expect(combinedRelativeUncertainty([0.06, 0.08, 0.1])).toBeCloseTo(Math.sqrt(0.02), 12);
		expect(combinedRelativeUncertainty([0.06, NaN, -1, 0])).toBeCloseTo(0.06, 12);
	});
});

describe('primaryInterferencesFor', () => {
	it('finds both Na-24 interferents', () => {
		const found = primaryInterferencesFor({ elementName: 'Sodium', isotopeName: 'Na-24' });
		expect(found.map((i) => i.interferingElement).sort()).toEqual(['Al', 'Mg']);
	});

	it('matches an element name + bare mass number', () => {
		const found = primaryInterferencesFor({ elementName: 'Magnesium', isotopeName: '27' });
		expect(found).toHaveLength(1);
		expect(found[0].reaction).toBe('Al-27(n,p)Mg-27');
	});

	it('returns nothing for an isotope without a listed interference', () => {
		expect(primaryInterferencesFor({ elementName: 'Gold', isotopeName: 'Au-198' })).toEqual([]);
	});
});
