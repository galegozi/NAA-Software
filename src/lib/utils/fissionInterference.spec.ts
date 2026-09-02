import { describe, expect, it } from 'vitest';
import type { FissionCorrectionRecord } from './fissionCorrections.js';
import {
	describeFissionChoice,
	describeFissionRow,
	findFissionChoice,
	fissionIsotopeKey,
	isKnownFissionProduct,
	matchingFissionRows,
	pruneFissionChoices,
	upsertFissionChoice,
	type FissionChoice
} from './fissionInterference.js';

function row(overrides: Partial<FissionCorrectionRecord> = {}): FissionCorrectionRecord {
	return {
		id: 'r',
		docType: 'fission-correction',
		fissileNuclide: 'U-235',
		interferingIsotope: 'La-140',
		gammaEnergyKev: 1596.2,
		irradiationPosition: '',
		irradiationType: 'thermal',
		correctionFactor: 0.0123,
		uncertainty: 0,
		notes: '',
		...overrides
	};
}

describe('fissionIsotopeKey', () => {
	it('normalizes a catalog-style name', () => {
		expect(fissionIsotopeKey({ elementName: 'Lanthanum', isotopeName: 'La-140' })).toBe('la|140|');
	});

	it('normalizes an element name plus a bare mass number', () => {
		expect(fissionIsotopeKey({ elementName: 'Lanthanum', isotopeName: '140' })).toBe('la|140|');
	});

	it('keeps a metastable suffix distinct', () => {
		expect(fissionIsotopeKey({ elementName: 'Silver', isotopeName: 'Ag-110m' })).toBe('ag|110|m');
		expect(fissionIsotopeKey({ elementName: 'Silver', isotopeName: 'Ag-110' })).not.toBe(
			fissionIsotopeKey({ elementName: 'Silver', isotopeName: 'Ag-110m' })
		);
	});
});

describe('matchingFissionRows', () => {
	const rows = [
		row(),
		row({ id: 'r2', fissileNuclide: 'U-238', irradiationType: 'fast' }),
		row({ id: 'r3', interferingIsotope: 'Mo-99', fissileNuclide: 'U-235' })
	];

	it('returns rows whose interfering isotope matches, sorted', () => {
		const matched = matchingFissionRows({ elementName: 'Lanthanum', isotopeName: '140' }, rows);
		expect(matched.map((r) => r.id)).toEqual(['r', 'r2']);
	});

	it('returns nothing for an isotope not in the table', () => {
		expect(matchingFissionRows({ elementName: 'Gold', isotopeName: 'Au-198' }, rows)).toEqual([]);
	});
});

describe('isKnownFissionProduct', () => {
	it('flags a common fission product regardless of name style', () => {
		expect(isKnownFissionProduct({ elementName: 'Lanthanum', isotopeName: 'La-140' })).toBe(true);
		expect(isKnownFissionProduct({ elementName: 'Molybdenum', isotopeName: '99' })).toBe(true);
	});

	it('does not flag a plain activation product', () => {
		expect(isKnownFissionProduct({ elementName: 'Gold', isotopeName: 'Au-198' })).toBe(false);
	});
});

describe('choice helpers', () => {
	const choiceLa: FissionChoice = {
		isotopeKey: 'la|140|',
		factor: 0.0123,
		uncertainty: 0,
		mode: 'table',
		fissileNuclide: 'U-235',
		irradiationType: 'thermal'
	};

	it('upsert replaces by isotope key and null removes', () => {
		let choices = upsertFissionChoice([], 'la|140|', choiceLa);
		expect(choices).toHaveLength(1);
		choices = upsertFissionChoice(choices, 'la|140|', { ...choiceLa, factor: 0.02 });
		expect(choices).toHaveLength(1);
		expect(choices[0].factor).toBe(0.02);
		expect(upsertFissionChoice(choices, 'la|140|', null)).toEqual([]);
	});

	it('finds a choice for an isotope by identity', () => {
		const choices = [choiceLa];
		expect(findFissionChoice(choices, { elementName: 'Lanthanum', isotopeName: '140' })).toBe(
			choiceLa
		);
	});

	it('prunes choices whose isotope is gone', () => {
		const choices = [choiceLa, { ...choiceLa, isotopeKey: 'mo|99|' }];
		expect(
			pruneFissionChoices(choices, [{ elementName: 'Lanthanum', isotopeName: 'La-140' }])
		).toEqual([choiceLa]);
	});
});

describe('describe helpers', () => {
	it('summarizes a table row', () => {
		expect(describeFissionRow(row())).toBe('U-235 · 1596.2 keV · thermal → factor 0.0123');
	});

	it('summarizes an explicit "no interference" choice', () => {
		expect(
			describeFissionChoice({ isotopeKey: 'x', factor: 0, uncertainty: 0, mode: 'none' })
		).toBe('No fission interference (0)');
	});
});
