import { describe, expect, it } from 'vitest';

import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '$lib/types.js';
import { getAll as getEverything } from './everythingMath.ts';

function createIsotope(): IsotopeInfo {
	return {
		elementName: 'Fe',
		isotopeName: '59',
		energy: 1099,
		halfLife: 10,
		linkedReference: 0,
		unit: 'seconds'
	};
}

function createReferenceMaterial(
	unit: 'percentage' | 'ppm',
	concentration: number
): ReferenceMaterial {
	return {
		NETL_code: 'REF-1',
		sampleName: 'Reference',
		mass: 1,
		reactorPower: 1,
		irradiationTime: 60,
		irradiationEnd: '2026-01-01T00:00:00.000Z',
		measurementStartTime: '2026-01-01T00:10:00.000Z',
		decayTime: 600,
		liveTime: 30,
		realTime: 30,
		fluence: 1,
		counts: [
			{
				grossCounts: 120,
				netCounts: 100,
				uncertainty: 1,
				grossCountsPositionalCorrectionFactor: 1,
				netCountsPositionalCorrectionFactor: 1,
				uncertaintyPositionalCorrectionFactor: 1
			}
		],
		irradiationType: 'total',
		dtType: undefined,
		concentrationUnits: [unit],
		knownConcentration: [concentration],
		knownUncertainty: [concentration * 0.01]
	};
}

function createUnknownMaterial(netCounts: number): UnknownMaterial {
	return {
		NETL_code: 'UNK-1',
		sampleName: 'Unknown',
		mass: 1,
		reactorPower: 1,
		irradiationTime: 60,
		irradiationEnd: '2026-01-01T00:00:00.000Z',
		measurementStartTime: '2026-01-01T00:10:00.000Z',
		decayTime: 600,
		liveTime: 30,
		realTime: 30,
		fluence: 1,
		counts: [
			{
				grossCounts: netCounts + 20,
				netCounts,
				uncertainty: 1,
				grossCountsPositionalCorrectionFactor: 1,
				netCountsPositionalCorrectionFactor: 1,
				uncertaintyPositionalCorrectionFactor: 1
			}
		],
		irradiationType: 'total',
		dtType: undefined
	};
}

describe('everythingMath concentration unit handling', () => {
	it('keeps ppm and percentage outputs separated by 4 orders of magnitude for equivalent compositions', () => {
		const isotope = createIsotope();
		const unknown = createUnknownMaterial(100);

		const percentResult = getEverything(
			createReferenceMaterial('percentage', 1),
			unknown,
			isotope,
			0
		).unknownConcentration;

		const ppmResult = getEverything(
			createReferenceMaterial('ppm', 10_000),
			unknown,
			isotope,
			0
		).unknownConcentration;

		expect(percentResult).toBeCloseTo(1, 10);
		expect(ppmResult).toBeCloseTo(10_000, 6);
		expect(ppmResult / percentResult).toBeCloseTo(10_000, 4);
	});

	it('exposes k such that unknownConcentration === k * knownConcentration', () => {
		const isotope = createIsotope();
		const unknown = createUnknownMaterial(37);

		for (const [unit, conc] of [
			['percentage', 1],
			['ppm', 250]
		] as const) {
			const result = getEverything(createReferenceMaterial(unit, conc), unknown, isotope, 0);
			expect(result.combinedCorrectionFactor).not.toBe(1);
			expect(result.combinedCorrectionFactor * conc).toBeCloseTo(result.unknownConcentration, 8);
		}
	});

	it('preserves unit scaling when count-ratio corrections change the concentration', () => {
		const isotope = createIsotope();
		const unknown = createUnknownMaterial(20);

		const percentResult = getEverything(
			createReferenceMaterial('percentage', 1),
			unknown,
			isotope,
			0
		).unknownConcentration;

		const ppmResult = getEverything(
			createReferenceMaterial('ppm', 10_000),
			unknown,
			isotope,
			0
		).unknownConcentration;

		expect(percentResult).toBeCloseTo(0.2, 10);
		expect(ppmResult).toBeCloseTo(2_000, 6);
		expect(ppmResult / percentResult).toBeCloseTo(10_000, 4);
	});
});
