import { describe, expect, it } from 'vitest';
import type { FissionCorrectionRecord } from './fissionCorrections.js';
import {
	describeFissionChoice,
	describeFissionRow,
	findFissionChoice,
	fissileParentSymbol,
	fissionIsotopeKey,
	isKnownFissionProduct,
	isotopeIsElement,
	lanthanumSpecialChoice,
	LANTHANUM_SPECIAL_CONSTANT,
	matchingFissionRows,
	prefillManualFissile,
	setManualFissileValue,
	type FissionManualEntry,
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

describe('fissile parent helpers', () => {
	it('resolves an element symbol from a nuclide or element name', () => {
		expect(fissileParentSymbol('U-235')).toBe('U');
		expect(fissileParentSymbol('Uranium')).toBe('U');
		expect(fissileParentSymbol('Pu-239')).toBe('Pu');
		expect(fissileParentSymbol('')).toBe('');
	});

	it('matches an analysis isotope to an element', () => {
		expect(isotopeIsElement({ elementName: 'Uranium', isotopeName: 'U-238' }, 'U')).toBe(true);
		expect(isotopeIsElement({ elementName: 'U', isotopeName: '235' }, 'U')).toBe(true);
		expect(isotopeIsElement({ elementName: 'Cerium', isotopeName: 'Ce-141' }, 'U')).toBe(false);
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

describe('lanthanumSpecialChoice', () => {
	it('uses the built-in constant when the catalog has no thermal La-140 row', () => {
		const choice = lanthanumSpecialChoice('la-140', [row({ irradiationType: 'epithermal' })]);
		expect(choice).toMatchObject({
			factor: LANTHANUM_SPECIAL_CONSTANT.factor,
			uncertainty: LANTHANUM_SPECIAL_CONSTANT.uncertainty,
			fissileNuclide: 'U-235',
			mode: 'manual',
			useSpecialCorrection: true
		});
	});

	it('prefers a thermal uranium row from the catalog', () => {
		const choice = lanthanumSpecialChoice('la-140', [
			row({ id: 'pu', fissileNuclide: 'Pu-239', correctionFactor: 0.009 }),
			row({ id: 'u', correctionFactor: 0.0024, uncertainty: 0.0001 })
		]);
		expect(choice).toMatchObject({
			factor: 0.0024,
			uncertainty: 0.0001,
			mode: 'table',
			sourceRowId: 'u',
			useSpecialCorrection: true
		});
		expect(describeFissionChoice(choice)).toContain('Special correction — constant 0.0024');
	});
});

describe('uranium sharing between fission targets', () => {
	function entry(isotopeKey: string, unit: FissionManualEntry['unit'] = 'ppm'): FissionManualEntry {
		return {
			isotopeKey,
			unit,
			inStandard: null,
			inUnknown: [{ value: null, uncertainty: null }]
		};
	}

	it('typing uranium for one target pre-fills the empty field on the other', () => {
		const entries = [entry('la'), entry('ce')];
		setManualFissileValue(entries, 'la', { kind: 'standard' }, 5);
		setManualFissileValue(entries, 'la', { kind: 'unknown', unknownIndex: 0, part: 'value' }, 30);
		expect(entries[1].inStandard).toBe(5);
		expect(entries[1].inUnknown[0].value).toBe(30);
	});

	it('keeps following while in sync, but never overwrites a value typed separately', () => {
		const entries = [entry('la'), entry('ce')];
		setManualFissileValue(entries, 'la', { kind: 'standard' }, 5);
		setManualFissileValue(entries, 'la', { kind: 'standard' }, 6);
		expect(entries[1].inStandard).toBe(6);

		setManualFissileValue(entries, 'ce', { kind: 'standard' }, 9);
		expect(entries[0].inStandard).toBe(9); // La was in sync with Ce

		entries[0].inStandard = 4; // typed differently for La…
		entries[1].inStandard = 9;
		setManualFissileValue(entries, 'ce', { kind: 'standard' }, 10);
		expect(entries[0].inStandard).toBe(4); // …so Ce's edit leaves it alone
	});

	it("converts between the two targets' units", () => {
		const entries = [entry('la', 'ppm'), entry('ce', 'percentage')];
		setManualFissileValue(entries, 'la', { kind: 'standard' }, 50);
		expect(entries[1].inStandard).toBeCloseTo(0.005);
	});

	it('a newly appearing target starts with the uranium already typed', () => {
		const la = entry('la');
		la.inStandard = 5;
		la.inUnknown[0] = { value: 30, uncertainty: 2 };
		const ce = entry('ce');
		prefillManualFissile(ce, [la]);
		expect(ce.inStandard).toBe(5);
		expect(ce.inUnknown[0]).toEqual({ value: 30, uncertainty: 2 });
	});
});
