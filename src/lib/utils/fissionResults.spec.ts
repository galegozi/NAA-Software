import { describe, expect, it } from 'vitest';
import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '$lib/types.js';
import type { EverythingComputed } from '$lib/NAAMath/types.js';
import type { FissionChoice } from './fissionInterference.js';
import { computeFissionResults, type FissionResultsContext } from './fissionResults.js';

const iso = (elementName: string, isotopeName: string): IsotopeInfo => ({
	elementName,
	isotopeName,
	energy: 0,
	halfLife: 0,
	linkedReference: 0,
	unit: 'seconds'
});

const comp = (
	k: number,
	unknownConcentration: number,
	percentUncertainty = 0
): EverythingComputed =>
	({
		combinedCorrectionFactor: k,
		unknownConcentration,
		unknownConcentrationUncertainty: percentUncertainty,
		unknownConcentrationUncertaintyAbsolute: (percentUncertainty / 100) * unknownConcentration
	}) as EverythingComputed;

const tableChoice: FissionChoice = {
	isotopeKey: 'ce|141|',
	factor: 0.08,
	uncertainty: 0,
	mode: 'table',
	fissileNuclide: 'U-235'
};

/** Ce-141 (idx 0) + U-238 (idx 1); one reference, one unknown. */
function baseContext(overrides: Partial<FissionResultsContext> = {}): FissionResultsContext {
	return {
		candidates: [{ index: 0, choice: tableChoice }],
		isotopeInfo: [iso('Cerium', 'Ce-141'), iso('Uranium', 'U-238')],
		references: [
			{
				knownConcentration: [40, 5],
				concentrationUnits: ['ppm', 'ppm']
			} as unknown as ReferenceMaterial
		],
		unknowns: [{} as UnknownMaterial],
		everythingComp: [
			[comp(1.25, 50)], // Ce: k=1.25, uncorrected = 1.25*40 = 50
			[comp(0.9, 30)] // U:  C_U^U = 30
		],
		linkedReferenceIndex: () => 0,
		...overrides
	};
}

describe('computeFissionResults', () => {
	it('applies the Ce/U correction and matches the worked example', () => {
		const result = computeFissionResults(baseContext()).get('0:0');
		expect(result?.applied).toBe(true);
		expect(result?.k).toBeCloseTo(1.25, 10);
		expect(result?.f).toBe(0.08);
		expect(result?.cTargetStandard).toBeCloseTo(40, 8);
		expect(result?.cFissileStandard).toBeCloseTo(5, 8);
		expect(result?.cFissileUnknown).toBeCloseTo(30, 8);
		expect(result?.uncorrected).toBeCloseTo(50, 8);
		expect(result?.corrected).toBeCloseTo(48.1, 8);
	});

	it('combines relative uncertainties as a Pythagorean norm and scales by the corrected value', () => {
		const ctx = baseContext({
			candidates: [
				{ index: 0, choice: { ...tableChoice, factor: 0.08, uncertainty: 0.008 } } // f: 10%
			],
			everythingComp: [
				[comp(1.25, 50, 6)], // predicted Ce: 6%
				[comp(0.9, 30, 8)] // predicted U:  8%
			]
		});
		const result = computeFissionResults(ctx).get('0:0');
		expect(result?.applied).toBe(true);
		// √(0.06² + 0.08² + 0.10²) = √0.02 = 14.142%
		expect(result?.correctedUncertaintyPercent).toBeCloseTo(Math.sqrt(0.02) * 100, 8);
		// × corrected (48.1) ≈ 6.80 ppm
		expect(result?.correctedUncertaintyAbsolute).toBeCloseTo(48.1 * Math.sqrt(0.02), 6);
	});

	it('drops the factor term when the choice has no uncertainty', () => {
		const ctx = baseContext({
			everythingComp: [[comp(1.25, 50, 6)], [comp(0.9, 30, 8)]]
		});
		const result = computeFissionResults(ctx).get('0:0');
		// only predicted-Ce and predicted-U terms
		expect(result?.correctedUncertaintyPercent).toBeCloseTo(Math.hypot(6, 8), 8);
	});

	it('converts a mixed-unit fissile concentration into the target unit', () => {
		// U known conc entered as a percentage: 0.0005 % == 5 ppm; result must be unchanged.
		const ctx = baseContext({
			references: [
				{
					knownConcentration: [40, 0.0005],
					concentrationUnits: ['ppm', 'percentage']
				} as unknown as ReferenceMaterial
			],
			everythingComp: [[comp(1.25, 50)], [comp(0.9, 0.003)]] // 0.003 % == 30 ppm
		});
		const result = computeFissionResults(ctx).get('0:0');
		expect(result?.applied).toBe(true);
		expect(result?.cFissileStandard).toBeCloseTo(5, 6);
		expect(result?.cFissileUnknown).toBeCloseTo(30, 6);
		expect(result?.corrected).toBeCloseTo(48.1, 6);
	});

	it('skips a factor of 0 / "no interference" choice', () => {
		expect(
			computeFissionResults(
				baseContext({
					candidates: [{ index: 0, choice: { ...tableChoice, factor: 0, mode: 'none' } }]
				})
			).size
		).toBe(0);
	});

	it('blocks with a note when the fissile parent is unset', () => {
		const result = computeFissionResults(
			baseContext({
				candidates: [
					{ index: 0, choice: { ...tableChoice, mode: 'manual', fissileNuclide: undefined } }
				]
			})
		).get('0:0');
		expect(result?.applied).toBe(false);
		expect(result?.note).toMatch(/fissile parent/i);
	});

	it('blocks when the fissile element is not an analysed isotope', () => {
		const result = computeFissionResults(
			baseContext({ isotopeInfo: [iso('Cerium', 'Ce-141')], everythingComp: [[comp(1.25, 50)]] })
		).get('0:0');
		expect(result?.applied).toBe(false);
		expect(result?.note).toMatch(/not an analysed isotope/i);
	});

	it('blocks when the reference has no known fissile concentration', () => {
		const result = computeFissionResults(
			baseContext({
				references: [
					{
						knownConcentration: [40, 0],
						concentrationUnits: ['ppm', 'ppm']
					} as unknown as ReferenceMaterial
				]
			})
		).get('0:0');
		expect(result?.applied).toBe(false);
		expect(result?.note).toMatch(/no known .*concentration/i);
	});
});
