import { describe, expect, it } from 'vitest';
import {
	fissionCorrectedMassFraction,
	fissionCorrectedRelativeUncertainty,
	fissionCorrectionDelta,
	uncorrectedMassFraction,
	type FissionCorrectionInputs
} from './fissionCorrectionMath.ts';

// The worked Ce-141 / U-235 example (all values in ppm; f dimensionless, so the
// arithmetic is identical whether the inputs are ppm or mass fractions).
const ceExample: FissionCorrectionInputs = {
	k: 1.25,
	f: 0.08,
	targetInStandard: 40,
	fissileInStandard: 5,
	fissileInUnknown: 30
};

describe('fissionCorrectionMath', () => {
	it('matches the worked Ce/U example', () => {
		expect(uncorrectedMassFraction(ceExample.k, ceExample.targetInStandard)).toBeCloseTo(50, 10);
		expect(fissionCorrectedMassFraction(ceExample)).toBeCloseTo(48.1, 10);
	});

	it('delta equals f * (k * Cf_S - Cf_U)', () => {
		expect(fissionCorrectionDelta(ceExample)).toBeCloseTo(-1.9, 10);
		expect(fissionCorrectionDelta(ceExample)).toBeCloseTo(
			ceExample.f * (ceExample.k * ceExample.fissileInStandard - ceExample.fissileInUnknown),
			10
		);
	});

	it('is a no-op when f is 0', () => {
		const inputs = { ...ceExample, f: 0 };
		expect(fissionCorrectedMassFraction(inputs)).toBe(
			uncorrectedMassFraction(inputs.k, inputs.targetInStandard)
		);
		expect(fissionCorrectionDelta(inputs)).toBe(0);
	});

	it('combines relative uncertainties as a Pythagorean norm (worked example)', () => {
		// predicted Ce 6%, predicted U 8%, factor 10%  →  √(0.06²+0.08²+0.10²) = √0.02
		const rel = fissionCorrectedRelativeUncertainty(0.06, 0.08, 0.1);
		expect(rel).toBeCloseTo(Math.sqrt(0.02), 12);
		expect(48.1 * rel).toBeCloseTo(6.8, 2);
	});

	it('drops terms whose relative uncertainty is missing / non-finite', () => {
		expect(fissionCorrectedRelativeUncertainty(0.06, 0, 0)).toBeCloseTo(0.06, 12);
		expect(fissionCorrectedRelativeUncertainty(0.06, NaN, -1)).toBeCloseTo(0.06, 12);
	});

	it('scales linearly with unit choice (ppm vs mass fraction)', () => {
		const asMassFraction: FissionCorrectionInputs = {
			k: ceExample.k,
			f: ceExample.f,
			targetInStandard: ceExample.targetInStandard / 1e6,
			fissileInStandard: ceExample.fissileInStandard / 1e6,
			fissileInUnknown: ceExample.fissileInUnknown / 1e6
		};
		expect(fissionCorrectedMassFraction(asMassFraction) * 1e6).toBeCloseTo(
			fissionCorrectedMassFraction(ceExample),
			10
		);
	});
});
