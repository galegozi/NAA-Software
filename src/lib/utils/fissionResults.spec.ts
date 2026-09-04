import { describe, expect, it } from 'vitest';
import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '$lib/types.js';
import type { EverythingComputed } from '$lib/NAAMath/types.js';
import type { FissionChoice } from './fissionInterference.js';
import { computeFissionResults, type FissionResultsContext } from './fissionResults.js';

const iso = (
	elementName: string,
	isotopeName: string,
	halfLife = 0,
	unit: IsotopeInfo['unit'] = 'seconds'
): IsotopeInfo => ({
	elementName,
	isotopeName,
	energy: 0,
	halfLife,
	linkedReference: 0,
	unit
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
		manualFissile: [],
		bariumDecayConstant: null,
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

	it('prompts for hand-entered concentrations when the fissile element is not analysed', () => {
		const result = computeFissionResults(
			baseContext({ isotopeInfo: [iso('Cerium', 'Ce-141')], everythingComp: [[comp(1.25, 50)]] })
		).get('0:0');
		expect(result?.applied).toBe(false);
		expect(result?.needsFissileInput).toBe(true);
		expect(result?.note).toMatch(/isn't one of your analysed isotopes/i);
	});

	it('applies the correction from hand-entered concentrations (no uranium isotope)', () => {
		const result = computeFissionResults(
			baseContext({
				isotopeInfo: [iso('Cerium', 'Ce-141')],
				everythingComp: [[comp(1.25, 50)]],
				manualFissile: [
					{
						isotopeKey: 'ce|141|',
						unit: 'ppm',
						inStandard: 5,
						inUnknown: [{ value: 30, uncertainty: 1.5 }]
					}
				]
			})
		).get('0:0');
		expect(result?.applied).toBe(true);
		expect(result?.needsFissileInput).toBe(false);
		expect(result?.cFissileStandard).toBeCloseTo(5, 8);
		expect(result?.cFissileUnknown).toBeCloseTo(30, 8);
		expect(result?.corrected).toBeCloseTo(48.1, 8);
		// relFissile = 1.5/30 = 5%, no factor uncertainty, target 0% → 5%
		expect(result?.correctedUncertaintyPercent).toBeCloseTo(5, 6);
	});

	// --- La-140: Ba-140 → La-140 in-growth --------------------------------------
	const lanthanumChoice: FissionChoice = {
		isotopeKey: 'la|140|',
		factor: 0.00233,
		uncertainty: 0.00012,
		mode: 'table',
		fissileNuclide: 'U-235'
	};

	function lanthanumContext(overrides: Partial<FissionResultsContext> = {}): FissionResultsContext {
		return baseContext({
			candidates: [{ index: 0, choice: lanthanumChoice }],
			isotopeInfo: [iso('Lanthanum', 'La-140', 1.678, 'days'), iso('Uranium', 'U-238')],
			references: [
				{
					knownConcentration: [30, 5],
					concentrationUnits: ['ppm', 'ppm'],
					irradiationTime: 3600,
					decayTime: 3 * 86400
				} as unknown as ReferenceMaterial
			],
			unknowns: [{ irradiationTime: 3600, decayTime: 5 * 86400 } as UnknownMaterial],
			everythingComp: [[comp(1.25, 37.5)], [comp(0.9, 30)]],
			bariumDecayConstant: Math.LN2 / (12.75 * 86400),
			...overrides
		});
	}

	it('applies the La-140 correction with per-sample f_S / f_U from the Ba-140 in-growth', () => {
		const result = computeFissionResults(lanthanumContext()).get('0:0');
		expect(result?.applied).toBe(true);
		expect(result?.isLanthanum).toBe(true);
		// longer decay on the unknown (5 d vs 3 d) → larger factor there
		expect(result?.f).toBeGreaterThan(result!.fStandard);
		expect(result!.fStandard).toBeGreaterThan(0);
		// tiny interference here (U ≈ La), so the corrected value barely moves
		expect(result?.corrected).toBeCloseTo(37.5, 1);
	});

	it('blocks the La-140 correction (needsBariumHalfLife) with no Ba-140 half-life', () => {
		const result = computeFissionResults(lanthanumContext({ bariumDecayConstant: null })).get(
			'0:0'
		);
		expect(result?.applied).toBe(false);
		expect(result?.needsBariumHalfLife).toBe(true);
		expect(result?.note).toMatch(/Ba-140 half-life/i);
	});

	it('blocks the La-140 correction when an irradiation time is missing', () => {
		const result = computeFissionResults(
			lanthanumContext({ unknowns: [{ decayTime: 5 * 86400 } as UnknownMaterial] })
		).get('0:0');
		expect(result?.applied).toBe(false);
		expect(result?.needsBariumHalfLife).toBe(false);
		expect(result?.note).toMatch(/irradiation time/i);
	});

	it('falls back to a flat factor when useSpecialCorrection is false — no Ba-140 half-life needed', () => {
		const result = computeFissionResults(
			lanthanumContext({
				candidates: [{ index: 0, choice: { ...lanthanumChoice, useSpecialCorrection: false } }],
				bariumDecayConstant: null // would block the special path, but it's opted out
			})
		).get('0:0');
		expect(result?.applied).toBe(true);
		expect(result?.isLanthanum).toBe(false);
		expect(result?.needsBariumHalfLife).toBe(false);
		expect(result?.f).toBe(lanthanumChoice.factor);
		expect(result?.fStandard).toBe(lanthanumChoice.factor);
	});

	it('prompts (needsFissileInput) when the reference has no known fissile concentration', () => {
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
		expect(result?.needsFissileInput).toBe(true);
	});
});
