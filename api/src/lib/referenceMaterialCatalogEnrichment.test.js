import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichReferenceMaterialCatalogItems } from './referenceMaterialCatalogEnrichment.js';

test('enrichReferenceMaterialCatalogItems fills missing concentration fields from datasheet entries', () => {
	const items = [
		{
			id: 'ref-1',
			isotopes: [
				{ isotopeId: 'iso-co-60', energy: 1173.2 },
				{ isotopeId: 'iso-cs-137', energy: 661.657 }
			],
			countings: [
				{
					countingId: 'count-1',
					referenceMaterial: {
						referenceDatasheetId: 'ds-1',
						knownConcentration: [0, 0],
						knownUncertainty: [0, 0],
						concentrationUnits: [undefined, undefined]
					}
				}
			],
			latestCounting: {
				countingId: 'count-1',
				referenceMaterial: {
					referenceDatasheetId: 'ds-1',
					knownConcentration: [0, 0],
					knownUncertainty: [0, 0],
					concentrationUnits: [undefined, undefined]
				}
			}
		}
	];

	const lookups = {
		datasheetsById: {
			'ds-1': {
				id: 'ds-1',
				entries: [
					{ label: 'Co', concentration: 0.1, uncertainty: 0.005, unit: 'ppm' },
					{ label: 'Cs', concentration: 0.02, uncertainty: 0.001, unit: 'percentage' }
				]
			}
		},
		isotopeCatalogById: {
			'iso-co-60': {
				id: 'iso-co-60',
				elementName: 'Cobalt',
				shortName: 'Co',
				massNumber: 60,
				suffix: ''
			},
			'iso-cs-137': {
				id: 'iso-cs-137',
				elementName: 'Cesium',
				shortName: 'Cs',
				massNumber: 137,
				suffix: ''
			}
		},
		measurementLinks: []
	};

	const [enriched] = enrichReferenceMaterialCatalogItems(items, lookups);

	assert.deepEqual(enriched.countings[0].referenceMaterial.knownConcentration, [0.1, 0.02]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.knownUncertainty, [0.005, 0.001]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.concentrationUnits, ['ppm', 'percentage']);
	assert.deepEqual(enriched.latestCounting.referenceMaterial.knownConcentration, [0.1, 0.02]);
});

test('enrichReferenceMaterialCatalogItems matches datasheet element labels and preserves counting index arrays', () => {
	const items = [
		{
			id: 'ref-idx',
			isotopes: [
				{ isotopeId: 'iso-fe-59', energy: 1099.0 },
				{ isotopeId: 'iso-zn-65', energy: 1115.5 }
			],
			countings: [
				{
					countingId: 'count-A',
					referenceMaterial: {
						referenceDatasheetId: 'ds-elements',
						knownConcentration: [0, 0],
						knownUncertainty: [0, 0],
						concentrationUnits: [undefined, undefined],
						counts: [{ netCounts: 10 }, { netCounts: 20 }]
					}
				},
				{
					countingId: 'count-B',
					referenceMaterial: {
						referenceDatasheetId: 'ds-elements',
						knownConcentration: [0, 0],
						knownUncertainty: [0, 0],
						concentrationUnits: [undefined, undefined],
						counts: [{ netCounts: 30 }, { netCounts: 40 }]
					}
				}
			],
			latestCounting: null
		}
	];

	const lookups = {
		datasheetsById: {
			'ds-elements': {
				id: 'ds-elements',
				entries: [
					{ label: 'Iron', concentration: 1.5, uncertainty: 0.15, unit: 'ppm' },
					{ label: 'Zn', concentration: 2.5, uncertainty: 0.25, unit: 'percentage' }
				]
			}
		},
		isotopeCatalogById: {
			'iso-fe-59': {
				id: 'iso-fe-59',
				elementName: 'Iron',
				shortName: 'Fe',
				massNumber: 59,
				suffix: ''
			},
			'iso-zn-65': {
				id: 'iso-zn-65',
				elementName: 'Zinc',
				shortName: 'Zn',
				massNumber: 65,
				suffix: ''
			}
		},
		measurementLinks: []
	};

	const [enriched] = enrichReferenceMaterialCatalogItems(items, lookups);

	assert.deepEqual(enriched.countings[0].referenceMaterial.counts, [{ netCounts: 10 }, { netCounts: 20 }]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.counts, [{ netCounts: 30 }, { netCounts: 40 }]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.knownConcentration, [1.5, 2.5]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.knownConcentration, [1.5, 2.5]);
});

test('enrichReferenceMaterialCatalogItems preserves populated concentration fields', () => {
	const items = [
		{
			id: 'ref-2',
			isotopes: [{ isotopeId: 'iso-co-60', energy: 1173.2 }],
			countings: [
				{
					countingId: 'count-2',
					referenceMaterial: {
						referenceDatasheetId: 'ds-1',
						knownConcentration: [0.25],
						knownUncertainty: [0.01],
						concentrationUnits: ['ppm']
					}
				}
			],
			latestCounting: null
		}
	];

	const lookups = {
		datasheetsById: {
			'ds-1': {
				id: 'ds-1',
				entries: [{ label: 'Co', concentration: 0.1, uncertainty: 0.005, unit: 'percentage' }]
			}
		},
		isotopeCatalogById: {
			'iso-co-60': {
				id: 'iso-co-60',
				elementName: 'Cobalt',
				shortName: 'Co',
				massNumber: 60,
				suffix: ''
			}
		},
		measurementLinks: []
	};

	const [enriched] = enrichReferenceMaterialCatalogItems(items, lookups);

	assert.deepEqual(enriched.countings[0].referenceMaterial.knownConcentration, [0.25]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.knownUncertainty, [0.01]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.concentrationUnits, ['ppm']);
});

test('enrichReferenceMaterialCatalogItems fills all isotope indices for duplicate isotope IDs across multiple countings', () => {
	const items = [
		{
			id: 'bb6910e0-c8bd-4ca9-8a6b-2015f7665aff',
			isotopes: [
				{ isotopeId: 'iso-zr-95', energy: 91.1 },
				{ isotopeId: 'iso-zr-95', energy: 531.0 },
				{ isotopeId: 'iso-eu-152', energy: 1408.0 }
			],
			countings: [
				{
					countingId: 'count-total',
					countingLabel: '1633c Total RSR',
					referenceMaterial: {
						referenceDatasheetId: '153c3141-0c62-41b2-a33e-1cd154860b2d',
						counts: [{ netCounts: 45452 }, { netCounts: 9124 }, { netCounts: 15347 }],
						irradiationType: 'total',
						dtType: 'simple'
					}
				},
				{
					countingId: 'count-gated',
					countingLabel: '1633c Gated RSR',
					referenceMaterial: {
						referenceDatasheetId: '153c3141-0c62-41b2-a33e-1cd154860b2d',
						counts: [{ netCounts: 43762 }, { netCounts: 8070 }, { netCounts: 13740 }],
						irradiationType: 'gated',
						dtType: 'simple'
					}
				}
			],
			latestCounting: null
		}
	];

	const lookups = {
		datasheetsById: {
			'153c3141-0c62-41b2-a33e-1cd154860b2d': {
				id: '153c3141-0c62-41b2-a33e-1cd154860b2d',
				entries: [
					{ label: 'Zirconium', concentration: 1.11, uncertainty: 0.11, unit: 'ppm' },
					{ label: 'Eu', concentration: 0.22, uncertainty: 0.02, unit: 'percentage' }
				]
			}
		},
		isotopeCatalogById: {
			'iso-zr-95': {
				id: 'iso-zr-95',
				elementName: 'Zirconium',
				shortName: 'Zr',
				massNumber: 95,
				suffix: ''
			},
			'iso-eu-152': {
				id: 'iso-eu-152',
				elementName: 'Europium',
				shortName: 'Eu',
				massNumber: 152,
				suffix: ''
			}
		},
		measurementLinks: []
	};

	const [enriched] = enrichReferenceMaterialCatalogItems(items, lookups);

	assert.deepEqual(enriched.countings[0].referenceMaterial.knownConcentration, [1.11, 1.11, 0.22]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.knownConcentration, [1.11, 1.11, 0.22]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.knownUncertainty, [0.11, 0.11, 0.02]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.knownUncertainty, [0.11, 0.11, 0.02]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.concentrationUnits, ['ppm', 'ppm', 'percentage']);
	assert.deepEqual(enriched.countings[1].referenceMaterial.concentrationUnits, ['ppm', 'ppm', 'percentage']);

	assert.deepEqual(enriched.countings[0].referenceMaterial.counts, [
		{ netCounts: 45452 },
		{ netCounts: 9124 },
		{ netCounts: 15347 }
	]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.counts, [
		{ netCounts: 43762 },
		{ netCounts: 8070 },
		{ netCounts: 13740 }
	]);
});

test('enrichReferenceMaterialCatalogItems hydrates symbol-labeled datasheet entries for realistic 1633c shape', () => {
	const items = [
		{
			id: 'bb6910e0-c8bd-4ca9-8a6b-2015f7665aff',
			isotopes: [
				{ isotopeId: '0c92e8ff-0c2a-415c-8093-c51e426cd882', energy: 91.1 },
				{ isotopeId: '0c92e8ff-0c2a-415c-8093-c51e426cd882', energy: 531.0 },
				{ isotopeId: 'e2b7fdc4-0e8e-4844-b040-b7d79246504f', energy: 889.2 },
				{ isotopeId: '02184fd3-526d-4a35-a943-b8c48b59a9a3', energy: 1115.5 }
			],
			countings: [
				{
					countingId: '961b64d2-af12-4bfd-ad0c-87f5673b6c3d',
					countingLabel: '1633c Total RSR',
					referenceMaterial: {
						referenceDatasheetId: '153c3141-0c62-41b2-a33e-1cd154860b2d',
						counts: [
							{ netCounts: 45452 },
							{ netCounts: 9124 },
							{ netCounts: 1432223 },
							{ netCounts: 12227 }
						]
					}
				},
				{
					countingId: '7c46e648-16f0-4711-abbc-4089f372a18f',
					countingLabel: '1633c Gated RSR',
					referenceMaterial: {
						referenceDatasheetId: '153c3141-0c62-41b2-a33e-1cd154860b2d',
						counts: [
							{ netCounts: 43762 },
							{ netCounts: 8070 },
							{ netCounts: 253334 },
							{ netCounts: 13740 }
						]
					}
				}
			],
			latestCounting: null
		}
	];

	const lookups = {
		datasheetsById: {
			'153c3141-0c62-41b2-a33e-1cd154860b2d': {
				id: '153c3141-0c62-41b2-a33e-1cd154860b2d',
				entries: [
					{ label: 'Zr', concentration: 35.0, uncertainty: 1.2, unit: 'ppm' },
					{ label: 'Y', concentration: 21.0, uncertainty: 1.0, unit: 'ppm' },
					{ label: 'Zn', concentration: 235.0, uncertainty: 14.0, unit: 'ppm' }
				]
			}
		},
		isotopeCatalogById: {
			'0c92e8ff-0c2a-415c-8093-c51e426cd882': {
				id: '0c92e8ff-0c2a-415c-8093-c51e426cd882',
				elementName: 'Zirconium',
				shortName: 'Zr',
				massNumber: 95,
				suffix: ''
			},
			'e2b7fdc4-0e8e-4844-b040-b7d79246504f': {
				id: 'e2b7fdc4-0e8e-4844-b040-b7d79246504f',
				elementName: 'Yttrium',
				shortName: 'Y',
				massNumber: 88,
				suffix: ''
			},
			'02184fd3-526d-4a35-a943-b8c48b59a9a3': {
				id: '02184fd3-526d-4a35-a943-b8c48b59a9a3',
				elementName: 'Zinc',
				shortName: 'Zn',
				massNumber: 65,
				suffix: ''
			}
		},
		measurementLinks: []
	};

	const [enriched] = enrichReferenceMaterialCatalogItems(items, lookups);

	assert.deepEqual(enriched.countings[0].referenceMaterial.knownConcentration, [35, 35, 21, 235]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.knownConcentration, [35, 35, 21, 235]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.knownUncertainty, [1.2, 1.2, 1.0, 14.0]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.knownUncertainty, [1.2, 1.2, 1.0, 14.0]);
	assert.deepEqual(enriched.countings[0].referenceMaterial.concentrationUnits, ['ppm', 'ppm', 'ppm', 'ppm']);
	assert.deepEqual(enriched.countings[1].referenceMaterial.concentrationUnits, ['ppm', 'ppm', 'ppm', 'ppm']);

	assert.deepEqual(enriched.countings[0].referenceMaterial.counts, [
		{ netCounts: 45452 },
		{ netCounts: 9124 },
		{ netCounts: 1432223 },
		{ netCounts: 12227 }
	]);
	assert.deepEqual(enriched.countings[1].referenceMaterial.counts, [
		{ netCounts: 43762 },
		{ netCounts: 8070 },
		{ netCounts: 253334 },
		{ netCounts: 13740 }
	]);
});
