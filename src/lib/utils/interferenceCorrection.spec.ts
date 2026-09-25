import { describe, expect, it } from 'vitest';
import type { EverythingComputed } from '$lib/NAAMath/types.js';
import type { IsotopeInfo, ReferenceMaterial } from '$lib/types.js';
import { createReferenceMaterial } from '$lib/utils/naaUtils.js';
import {
	computeInterferenceResults,
	createInterferent,
	interferentErrors,
	syncInterferenceSettings,
	type InterferenceContext,
	type InterferenceSetting
} from './interferenceCorrection.ts';
import { analysisIsotopeKey, primaryInterferencesFor } from './primaryInterferences.ts';

function isotope(elementName: string, isotopeName: string): IsotopeInfo {
	return { elementName, isotopeName, energy: 0, halfLife: 1, linkedReference: 0, unit: 'minutes' };
}

function computed(value: number, percent: number, k = 1.2): EverythingComputed {
	return {
		saturationFactorRatio: 1,
		deadTimeCorrectionRatio: 1,
		decayCorrectionFactorRatio: 1,
		combinedCorrectionFactor: k,
		unknownConcentration: value,
		unknownConcentrationUncertainty: percent,
		unknownConcentrationUncertaintyAbsolute: (value * percent) / 100,
		concentrationDetectionLimit: 0
	};
}

const mg = isotope('Magnesium', 'Mg-27');
const al = isotope('Aluminum', 'Al-28');

function reference(known: number[], units: ReferenceMaterial['concentrationUnits']) {
	return {
		...createReferenceMaterial(known.length),
		knownConcentration: known,
		concentrationUnits: units
	};
}

function enabledAl(overrides: Partial<ReturnType<typeof createInterferent>> = {}) {
	return {
		...createInterferent('Al', 'Al-27(n,p)Mg-27'),
		enabled: true,
		factor: 0.01,
		uncertainty: 0.0005,
		...overrides
	};
}

function context(overrides: Partial<InterferenceContext>): InterferenceContext {
	return {
		isotopes: [mg],
		references: [reference([20000], ['ppm'])],
		unknownCount: 1,
		settings: [],
		linkedReference: () => 0,
		referenceCovers: () => true,
		results: [[computed(24000, 3)]],
		...overrides
	};
}

describe('primaryInterferencesFor', () => {
	it('finds both Na-24 interferents', () => {
		const found = primaryInterferencesFor({ elementName: 'Sodium', isotopeName: 'Na-24' });
		expect(found.map((i) => i.interferingElement).sort()).toEqual(['Al', 'Mg']);
	});

	it('matches an element name + bare mass number', () => {
		const found = primaryInterferencesFor({ elementName: 'Magnesium', isotopeName: '27' });
		expect(found.map((i) => i.reaction)).toContain('Al-27(n,p)Mg-27');
	});

	it('returns nothing for an isotope without a listed interference', () => {
		expect(primaryInterferencesFor({ elementName: 'Gold', isotopeName: 'Au-198' })).toEqual([]);
	});
});

describe('syncInterferenceSettings', () => {
	it('adds known interferences switched off, and is stable once added', () => {
		const once = syncInterferenceSettings([mg, isotope('Gold', 'Au-198')], []);
		expect(once).toHaveLength(1);
		expect(once[0].isotopeKey).toBe(analysisIsotopeKey(mg));
		expect(once[0].interferents.map((i) => [i.element, i.enabled])).toEqual([
			['Al', false],
			['Si', false]
		]);
		expect(syncInterferenceSettings([mg], once)).toBe(once);
	});

	it('keeps a user-added interferent and edited values', () => {
		const settings: InterferenceSetting[] = [
			{ isotopeKey: analysisIsotopeKey(mg), interferents: [enabledAl(), createInterferent('Fe')] }
		];
		const next = syncInterferenceSettings([mg], settings);
		expect(next[0].interferents.map((i) => i.element)).toEqual(['Al', 'Fe', 'Si']);
		expect(next[0].interferents[0].factor).toBe(0.01);
	});
});

describe('interferentErrors', () => {
	it('requires a factor only when enabled', () => {
		expect(interferentErrors(createInterferent('Al', 'x'))).toEqual([]);
		expect(interferentErrors({ ...createInterferent('Al', 'x'), enabled: true })).toHaveLength(1);
		expect(interferentErrors(enabledAl({ uncertainty: -1 }))).toHaveLength(1);
		expect(interferentErrors(enabledAl())).toEqual([]);
	});
});

describe('computeInterferenceResults', () => {
	it('ignores isotopes with no enabled interferent', () => {
		const settings = syncInterferenceSettings([mg], []);
		expect(computeInterferenceResults(context({ settings })).size).toBe(0);
	});

	it('uses hand-entered concentrations when the element is not analysed', () => {
		const settings: InterferenceSetting[] = [
			{
				isotopeKey: analysisIsotopeKey(mg),
				interferents: [enabledAl({ manualInStandard: 80000, manualInUnknown: [150000] })]
			}
		];
		const result = computeInterferenceResults(context({ settings })).get('0:0')!;
		expect(result.missing).toEqual([]);
		expect(result.interferents[0].standardSource).toBe('manual');
		// 1.2·(20000 + 0.01·80000) − 0.01·150000 = 23460
		expect(result.corrected).toBeCloseTo(23460, 6);
		// target 3 %, factor 5 % → hypot = 5.83 %
		expect(result.correctedUncertaintyPercent).toBeCloseTo(Math.hypot(3, 5), 8);
		expect(result.correctedUncertainty).toBeCloseTo(23460 * Math.hypot(0.03, 0.05), 6);
	});

	it('converts hand-entered % into the target unit', () => {
		const settings: InterferenceSetting[] = [
			{
				isotopeKey: analysisIsotopeKey(mg),
				interferents: [
					enabledAl({ unit: 'percentage', manualInStandard: 8, manualInUnknown: [15] })
				]
			}
		];
		const result = computeInterferenceResults(context({ settings })).get('0:0')!;
		expect(result.interferents[0].inUnknown).toBeCloseTo(150000, 6);
		expect(result.corrected).toBeCloseTo(23460, 6);
	});

	it('reports what is missing and leaves the result uncorrected', () => {
		const settings: InterferenceSetting[] = [
			{ isotopeKey: analysisIsotopeKey(mg), interferents: [enabledAl({ manualInStandard: 80000 })] }
		];
		const result = computeInterferenceResults(context({ settings })).get('0:0')!;
		expect(result.corrected).toBeNull();
		expect(result.missing).toEqual(['Al in the unknown']);
	});

	it('takes the interferent from the analysis when it is an analysed isotope', () => {
		const settings: InterferenceSetting[] = [
			{ isotopeKey: analysisIsotopeKey(mg), interferents: [enabledAl()] }
		];
		// Reference certifies Mg 20000 ppm and Al 8 %; the unknown's Al result is 15 % ± 4 %.
		const result = computeInterferenceResults(
			context({
				isotopes: [mg, al],
				references: [reference([20000, 8], ['ppm', 'percentage'])],
				results: [[computed(24000, 3)], [computed(15, 4)]],
				settings
			})
		).get('0:0')!;
		expect(result.interferents[0]).toMatchObject({
			standardSource: 'analysed',
			unknownSource: 'analysed'
		});
		expect(result.interferents[0].inStandard).toBeCloseTo(80000, 6);
		expect(result.corrected).toBeCloseTo(23460, 6);
		expect(result.correctedUncertaintyPercent).toBeCloseTo(Math.hypot(3, 4, 5), 8);
	});

	it('falls back to an entered standard value when the reference does not cover the element', () => {
		const settings: InterferenceSetting[] = [
			{ isotopeKey: analysisIsotopeKey(mg), interferents: [enabledAl({ manualInStandard: 80000 })] }
		];
		const result = computeInterferenceResults(
			context({
				isotopes: [mg, al],
				references: [reference([20000, 8], ['ppm', 'percentage'])],
				results: [[computed(24000, 3)], [computed(15, 4)]],
				referenceCovers: (_r, i) => i === 0,
				settings
			})
		).get('0:0')!;
		expect(result.interferents[0].standardSource).toBe('manual');
		expect(result.interferents[0].unknownSource).toBe('analysed');
		expect(result.corrected).toBeCloseTo(23460, 6);
	});
});
