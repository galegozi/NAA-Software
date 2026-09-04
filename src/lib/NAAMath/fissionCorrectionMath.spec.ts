import { describe, expect, it } from 'vitest';
import {
	fissionCorrectedMassFraction,
	fissionCorrectedRelativeUncertainty,
	fissionCorrectionDelta,
	lanthanumFissionFactor,
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

	it('uses fInUnknown for the C_fissile^U term when the two factors differ (lanthanum)', () => {
		// k·(Ct_S + f_S·Cf_S) − f_U·Cf_U = 1.25·(40 + 0.08·5) − 0.05·30 = 50.5 − 1.5 = 49.0
		const inputs: FissionCorrectionInputs = { ...ceExample, f: 0.08, fInUnknown: 0.05 };
		expect(fissionCorrectedMassFraction(inputs)).toBeCloseTo(49.0, 10);
		// falls back to `f` for both terms when fInUnknown is omitted
		expect(fissionCorrectedMassFraction({ ...ceExample, f: 0.08 })).toBeCloseTo(
			fissionCorrectedMassFraction({ ...ceExample, f: 0.08, fInUnknown: 0.08 }),
			10
		);
	});

	describe('lanthanumFissionFactor', () => {
		const params = {
			constant: 0.00233,
			lambdaBa: Math.LN2 / (12.75 * 86400),
			lambdaLa: Math.LN2 / (1.678 * 86400),
			halfIrradiationTime: 1800,
			decayTime: 3 * 86400
		};

		it('is A·[e^(-λ_Ba·m) − e^(-λ_La·m)]·e^(λ_La·t)', () => {
			const expected =
				params.constant *
				(Math.exp(-params.lambdaBa * params.halfIrradiationTime) -
					Math.exp(-params.lambdaLa * params.halfIrradiationTime)) *
				Math.exp(params.lambdaLa * params.decayTime);
			expect(lanthanumFissionFactor(params)).toBeCloseTo(expected, 14);
			expect(lanthanumFissionFactor(params)).toBeGreaterThan(0);
		});

		it('is 0 at m = 0 and grows with the decay time', () => {
			expect(
				lanthanumFissionFactor({ ...params, halfIrradiationTime: 0, decayTime: 0 })
			).toBeCloseTo(0, 14);
			const early = lanthanumFissionFactor({ ...params, decayTime: 1 * 86400 });
			const late = lanthanumFissionFactor({ ...params, decayTime: 8 * 86400 });
			expect(late).toBeGreaterThan(early);
		});
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
