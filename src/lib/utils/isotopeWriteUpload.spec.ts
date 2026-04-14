import { describe, expect, it } from 'vitest';

import { parseIsotopeWriteUpload } from './isotopeWriteUpload.js';

describe('parseIsotopeWriteUpload', () => {
	it('groups contiguous A/B rows into one isotope but keeps other letters as suffixes', () => {
		const result = parseIsotopeWriteUpload(
			'CD-115A D 2.2280 336.2\nCD-115B D 2.2280 527.9\nCD-115m D 2.2280 412.1'
		);

		expect(result.sourceLineCount).toBe(3);
		expect(result.ignoredVariantCount).toBe(2);
		expect(result.items).toHaveLength(2);
		expect(result.items[0]).toMatchObject({
			elementName: 'Cadmium',
			shortName: 'Cd',
			massNumber: 115,
			suffix: '',
			halfLife: {
				number: 2.228,
				unit: 'days'
			},
			lineNumbers: [1, 2],
			variantLetters: ['A', 'B']
		});
		expect(result.items[0].energies).toEqual([336.2, 527.9]);
		expect(result.items[1]).toMatchObject({
			elementName: 'Cadmium',
			shortName: 'Cd',
			massNumber: 115,
			suffix: 'm',
			halfLife: {
				number: 2.228,
				unit: 'days'
			},
			lineNumbers: [3],
			variantLetters: []
		});
		expect(result.items[1].energies).toEqual([412.1]);
	});

	it('does not collapse non-contiguous lettering into variant energies', () => {
		const result = parseIsotopeWriteUpload('CD-115B D 2.2280 527.9\nCD-115m D 2.2280 412.1');

		expect(result.ignoredVariantCount).toBe(0);
		expect(result.items).toHaveLength(2);
		expect(result.items[0].suffix).toBe('b');
		expect(result.items[1].suffix).toBe('m');
	});

	it('rejects unknown element symbols', () => {
		expect(() => parseIsotopeWriteUpload('XX-115A D 2.2280 527.9')).toThrow(/unknown element symbol/i);
	});
});