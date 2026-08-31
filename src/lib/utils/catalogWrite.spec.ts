import { describe, expect, it } from 'vitest';
import { parseIsotopeName } from './catalogWrite.js';

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

	it('trims surrounding whitespace', () => {
		expect(parseIsotopeName('  Fe-59 ')).toEqual({ shortName: 'Fe', massNumber: 59, suffix: '' });
	});

	it('returns null for unparseable input', () => {
		expect(parseIsotopeName('')).toBeNull();
		expect(parseIsotopeName('not an isotope')).toBeNull();
		expect(parseIsotopeName('198')).toBeNull();
	});
});
