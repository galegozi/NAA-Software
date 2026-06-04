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
