import { describe, expect, it } from 'vitest';

import { parseIsotopeWriteUpload } from './isotopeWriteUpload.js';

describe('parseIsotopeWriteUpload', () => {
	it('groups variant rows into one isotope and ignores the variant letter for identity', () => {
		const result = parseIsotopeWriteUpload('CD-115A D 2.2280 336.2\nCD-115B D 2.2280 527.9');

		expect(result.sourceLineCount).toBe(2);
		expect(result.ignoredVariantCount).toBe(2);
		expect(result.items).toHaveLength(1);
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
	});

	it('rejects unknown element symbols', () => {
		expect(() => parseIsotopeWriteUpload('XX-115A D 2.2280 527.9')).toThrow(/unknown element symbol/i);
	});
});