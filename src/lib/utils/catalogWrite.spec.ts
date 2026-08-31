import { describe, expect, it } from 'vitest';
import { describeIsotope, isotopeIdentityKey, parseIsotopeName } from './catalogWrite.js';

describe('parseIsotopeName', () => {
	it('parses a hyphenated isotope name', () => {
		expect(parseIsotopeName('Au-198')).toEqual({ shortName: 'Au', massNumber: 198, suffix: '' });
	});

	it('parses a name without a hyphen', () => {
		expect(parseIsotopeName('Au198')).toEqual({ shortName: 'Au', massNumber: 198, suffix: '' });
	});

	it('keeps a trailing variant letter as the suffix', () => {
		expect(parseIsotopeName('Cd-115B')).toEqual({ shortName: 'Cd', massNumber: 115, suffix: 'B' });
	});

	it('keeps a metastable "m" marker as the suffix', () => {
		expect(parseIsotopeName('Ag-110m')).toEqual({ shortName: 'Ag', massNumber: 110, suffix: 'm' });
		expect(parseIsotopeName('Ag110m')).toEqual({ shortName: 'Ag', massNumber: 110, suffix: 'm' });
	});

	it('handles a second isomeric state (m2)', () => {
		expect(parseIsotopeName('Hf-178m2')).toEqual({
			shortName: 'Hf',
			massNumber: 178,
			suffix: 'm2'
		});
	});

	it('trims surrounding whitespace', () => {
		expect(parseIsotopeName('  Fe-59 ')).toEqual({ shortName: 'Fe', massNumber: 59, suffix: '' });
	});

	it('returns null for unparseable input', () => {
		expect(parseIsotopeName('')).toBeNull();
		expect(parseIsotopeName('not an isotope')).toBeNull();
		expect(parseIsotopeName('198')).toBeNull();
	});
});

describe('isotopeIdentityKey', () => {
	it('distinguishes a metastable isotope from its ground state', () => {
		const ground = isotopeIdentityKey({ shortName: 'Ag', massNumber: 110, suffix: '' });
		const meta = isotopeIdentityKey({ shortName: 'Ag', massNumber: 110, suffix: 'm' });
		expect(ground).not.toEqual(meta);
	});

	it('is case-insensitive on names', () => {
		expect(isotopeIdentityKey({ shortName: 'AG', massNumber: 110, suffix: 'M' })).toEqual(
			isotopeIdentityKey({ shortName: 'ag', massNumber: 110, suffix: 'm' })
		);
	});
});

describe('describeIsotope', () => {
	it('spells out a metastable state', () => {
		expect(describeIsotope({ shortName: 'Ag', massNumber: 110, suffix: 'm' }, 'Silver')).toBe(
			'Ag-110m — Silver, mass 110, metastable state “m”'
		);
	});

	it('omits the state clause when there is no suffix', () => {
		expect(describeIsotope({ shortName: 'Au', massNumber: 198, suffix: '' }, 'Gold')).toBe(
			'Au-198 — Gold, mass 198'
		);
	});
});
