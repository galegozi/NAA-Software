import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IsotopeInfo, ReferenceMaterial } from '$lib/types.js';
import {
	applyDatasheetToReference,
	datasheetEntriesFromReference,
	describeIsotope,
	findCatalogIsotope,
	findCatalogReferenceMaterial,
	findIsotopeMeasurementLink,
	isotopeElementMismatch,
	isotopeIdentityKey,
	normalizeEnergyList,
	parseIsotopeName,
	saveReferenceMaterialToCatalog,
	type SavedDatasheet
} from './catalogWrite.js';

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

describe('normalizeEnergyList', () => {
	it('parses, dedupes, sorts and drops non-positive values', () => {
		expect(normalizeEnergyList(['1332.5', 1173.2, '1173.2', 'x', 0, -5])).toEqual([1173.2, 1332.5]);
	});
});

describe('datasheetEntriesFromReference', () => {
	const covered = [
		{ isotope: { isotopeName: 'Au-198', elementName: 'Gold' }, index: 1 },
		{ isotope: { isotopeName: 'Ag-110m', elementName: 'Silver' }, index: 3 }
	] as unknown as Array<{ isotope: IsotopeInfo; index: number }>;

	it('reads concentrations by the isotope’s position in the analysis, not the covered subset', () => {
		const reference = {
			// index 1 => Au-198, index 3 => Ag-110m (indices 0 and 2 are uncovered)
			knownConcentration: [0, 12.5, 0, 4],
			knownUncertainty: [0, 0.4, 0, 0.1],
			concentrationUnits: ['', 'ppm', '', 'percentage']
		} as unknown as ReferenceMaterial;

		expect(datasheetEntriesFromReference(reference, covered)).toEqual([
			{ label: 'Au-198', concentration: 12.5, uncertainty: 0.4, unit: 'ppm' },
			{ label: 'Ag-110m', concentration: 4, uncertainty: 0.1, unit: 'percentage' }
		]);
	});

	it('returns an empty list when nothing has a concentration', () => {
		const reference = {
			knownConcentration: [0, 0, 0, 0],
			knownUncertainty: [0, 0, 0, 0],
			concentrationUnits: []
		} as unknown as ReferenceMaterial;
		expect(datasheetEntriesFromReference(reference, covered)).toEqual([]);
	});
});

function stubFetchJson(payload: unknown, ok = true) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok, json: async () => payload }) as unknown as Response)
	);
}

describe('findCatalogIsotope', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('matches on exact (shortName, massNumber, suffix), distinguishing the metastable state', async () => {
		stubFetchJson({
			items: [
				{
					id: 'a',
					shortName: 'Ag',
					massNumber: 110,
					suffix: '',
					energies: [658],
					halfLife: { number: 24.6, unit: 'seconds' }
				},
				{
					id: 'b',
					shortName: 'Ag',
					massNumber: 110,
					suffix: 'm',
					energies: [657.8, 884.7],
					halfLife: { number: 249.8, unit: 'days' }
				}
			]
		});
		const match = await findCatalogIsotope({ shortName: 'Ag', massNumber: 110, suffix: 'm' });
		expect(match?.id).toBe('b');
	});

	it('returns null when nothing matches or the request fails', async () => {
		stubFetchJson({ items: [{ id: 'a', shortName: 'Au', massNumber: 198, suffix: '' }] });
		expect(await findCatalogIsotope({ shortName: 'Ag', massNumber: 110, suffix: 'm' })).toBeNull();

		stubFetchJson({}, false);
		expect(await findCatalogIsotope({ shortName: 'Au', massNumber: 198, suffix: '' })).toBeNull();
	});
});

describe('findCatalogReferenceMaterial', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('matches a NETL code inside any counting', async () => {
		stubFetchJson({
			items: [
				{
					id: 'rm1',
					countingCount: 2,
					countings: [{ referenceMaterial: { NETL_code: 'AB0053', sampleName: 'SRM1633c' } }]
				}
			]
		});
		const match = await findCatalogReferenceMaterial({ netlCode: 'ab0053' });
		expect(match).toMatchObject({ itemId: 'rm1', netlCode: 'AB0053', countingCount: 2 });
	});

	it('returns null with no identity or no match', async () => {
		expect(await findCatalogReferenceMaterial({})).toBeNull();
		stubFetchJson({ items: [] });
		expect(await findCatalogReferenceMaterial({ netlCode: 'ZZ' })).toBeNull();
	});
});

describe('isotopeElementMismatch', () => {
	it('flags a proxy: name implies a different element than the label', () => {
		expect(
			isotopeElementMismatch({ isotopeName: 'Np-239', elementName: 'Uranium' } as IsotopeInfo)
		).toEqual({ nameElement: 'Neptunium', labelElement: 'Uranium' });
	});

	it('returns null when name and label agree, or a piece is missing', () => {
		expect(
			isotopeElementMismatch({ isotopeName: 'Au-198', elementName: 'Gold' } as IsotopeInfo)
		).toBeNull();
		expect(
			isotopeElementMismatch({ isotopeName: 'gibberish', elementName: 'Uranium' } as IsotopeInfo)
		).toBeNull();
		expect(
			isotopeElementMismatch({ isotopeName: 'Np-239', elementName: '' } as IsotopeInfo)
		).toBeNull();
	});
});

describe('findIsotopeMeasurementLink', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('finds an existing (measured, target) pair', async () => {
		stubFetchJson({
			items: [{ measuredIsotope: { isotopeId: 'np239' }, targetIsotope: { isotopeId: 'u238' } }]
		});
		expect(await findIsotopeMeasurementLink('np239', 'u238')).toBe(true);
		expect(await findIsotopeMeasurementLink('np239', 'u235')).toBe(false);
	});

	it('is false with missing ids or a failed request', async () => {
		expect(await findIsotopeMeasurementLink('', 'u238')).toBe(false);
		stubFetchJson({}, false);
		expect(await findIsotopeMeasurementLink('np239', 'u238')).toBe(false);
	});
});

describe('saveReferenceMaterialToCatalog', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('sends counts/known values for exactly the covered isotopes, in order', async () => {
		type SentBody = {
			isotopes: Array<{ isotopeId: string }>;
			countings: Array<{
				referenceMaterial: {
					counts: Array<{ netCounts: number }>;
					knownConcentration: number[];
					knownUncertainty: number[];
					concentrationUnits: string[];
				};
			}>;
		};
		let sentBody: SentBody = { isotopes: [], countings: [] };
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				sentBody = JSON.parse(String(init.body)) as SentBody;
				return {
					ok: true,
					json: async () => ({ created: true, totalCountings: 1 })
				} as unknown as Response;
			})
		);

		// Analysis has 3 isotopes; this reference only covers indices 0 and 2.
		const reference = {
			NETL_code: 'AB1',
			sampleName: 'S1',
			counts: [{ netCounts: 10 }, { netCounts: 999 }, { netCounts: 30 }],
			knownConcentration: [1, 999, 3],
			knownUncertainty: [0.1, 999, 0.3],
			concentrationUnits: ['ppm', 'percentage', 'ppm']
		} as unknown as ReferenceMaterial;

		await saveReferenceMaterialToCatalog({
			reference,
			covered: [
				{ isotope: { id: 'iso0', energy: 100 }, index: 0 },
				{ isotope: { id: 'iso2', energy: 300 }, index: 2 }
			] as never,
			referenceDatasheetId: 'ds1',
			countingLabel: 'C1',
			notes: ''
		});

		const rm = sentBody.countings[0].referenceMaterial;
		expect(sentBody.isotopes.map((i) => i.isotopeId)).toEqual(['iso0', 'iso2']);
		expect(rm.counts.map((c) => c.netCounts)).toEqual([10, 30]);
		expect(rm.knownConcentration).toEqual([1, 3]);
		expect(rm.knownUncertainty).toEqual([0.1, 0.3]);
		expect(rm.concentrationUnits).toEqual(['ppm', 'ppm']);
	});

	it('sends countingMode, defaulting to normal and passing compton through', async () => {
		type SentBody = { countings: Array<{ referenceMaterial: { countingMode: string } }> };
		let sentBody: SentBody = { countings: [] };
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				sentBody = JSON.parse(String(init.body)) as SentBody;
				return { ok: true, json: async () => ({ created: true }) } as unknown as Response;
			})
		);

		const covered = [{ isotope: { id: 'iso0', energy: 100 }, index: 0 }] as never;
		const base = {
			NETL_code: 'AB1',
			sampleName: 'S1',
			counts: [{ netCounts: 10 }],
			knownConcentration: [1],
			knownUncertainty: [0.1],
			concentrationUnits: ['ppm']
		};

		await saveReferenceMaterialToCatalog({
			reference: base as unknown as ReferenceMaterial,
			covered,
			referenceDatasheetId: 'ds1',
			countingLabel: 'C1',
			notes: ''
		});
		expect(sentBody.countings[0].referenceMaterial.countingMode).toBe('normal');

		await saveReferenceMaterialToCatalog({
			reference: { ...base, countingMode: 'compton' } as unknown as ReferenceMaterial,
			covered,
			referenceDatasheetId: 'ds1',
			countingLabel: 'C1',
			notes: ''
		});
		expect(sentBody.countings[0].referenceMaterial.countingMode).toBe('compton');
	});
});

describe('applyDatasheetToReference', () => {
	const isotopes = [
		{ isotopeName: 'Au-198', elementName: 'Gold' },
		{ isotopeName: 'Sb-124', elementName: 'Antimony' },
		{ isotopeName: 'Ag-110m', elementName: 'Silver' }
	] as unknown as IsotopeInfo[];

	const reference = {
		knownConcentration: [0, 0, 0],
		knownUncertainty: [0, 0, 0],
		concentrationUnits: []
	} as unknown as ReferenceMaterial;

	it('matches rows to isotopes by element name, isotope name, or symbol', () => {
		const datasheet: SavedDatasheet = {
			id: 'ds1',
			sampleName: 'SRM 1633c',
			entries: [
				{ label: 'Gold', concentration: 81.5, uncertainty: 1.2, unit: 'ppm' },
				{ label: 'Sb-124', concentration: 6.3, uncertainty: 0.3, unit: 'ppm' },
				{ label: 'Ag', concentration: 0.5, uncertainty: 0.05, unit: 'percentage' },
				{ label: 'Unrelated', concentration: 99, uncertainty: 1, unit: 'ppm' }
			]
		};

		const { reference: updated, matchedCount } = applyDatasheetToReference(
			reference,
			isotopes,
			datasheet
		);

		expect(matchedCount).toBe(3);
		expect(updated.knownConcentration).toEqual([81.5, 6.3, 0.5]);
		expect(updated.knownUncertainty).toEqual([1.2, 0.3, 0.05]);
		expect(updated.concentrationUnits).toEqual(['ppm', 'ppm', 'percentage']);
		expect(updated.referenceDatasheetId).toBe('ds1');
	});

	it('leaves unmatched isotopes untouched', () => {
		const datasheet: SavedDatasheet = {
			id: 'ds2',
			sampleName: 'Gold-only sheet',
			entries: [{ label: 'Au', concentration: 10, uncertainty: 1, unit: 'ppm' }]
		};

		const { reference: updated, matchedCount } = applyDatasheetToReference(
			reference,
			isotopes,
			datasheet
		);

		expect(matchedCount).toBe(1);
		expect(updated.knownConcentration).toEqual([10, 0, 0]);
	});
});
