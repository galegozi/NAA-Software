import { app } from '@azure/functions';

import {
	getCosmosContainer,
	getIsotopeMeasurementLinksContainer,
	getReferenceDatasheetContainer,
	getReferenceMaterialsContainer
} from '../lib/cosmosClient.js';
import { mapIsotopeItem } from '../lib/isotopeMapper.js';
import { enrichReferenceMaterialCatalogItems } from '../lib/referenceMaterialCatalogEnrichment.js';
import {
	mergeReferenceMaterialWrite,
	normalizeReferenceMaterialWritePayload,
	referenceMaterialHasCounting,
	replaceCountingInReferenceMaterial
} from '../lib/referenceMaterialWritePayload.js';
import { canWriteIsotopes } from '../lib/staticWebAppsAuth.js';

const MOCK_REFERENCE_MATERIALS = [
	{
		id: 'mock-rm-1',
		docType: 'reference-material',
		referenceKey: 'mock-ab0053-srm1633c',
		notes: 'Mock reference material for local development.',
		isotopes: [
			{ isotopeId: 'mock-co-60', energy: 1173.2 },
			{ isotopeId: 'mock-cs-137', energy: 661.657 }
		],
		countings: [
			{
				countingId: 'mock-counting-1',
				countingLabel: 'Counting 1',
				createdAt: new Date('2026-01-12T12:00:00.000Z').toISOString(),
				referenceMaterial: {
					NETL_code: 'AB0053',
					sampleName: 'SRM1633c',
					referenceDatasheetId: 'mock-ds-001',
					mass: 0.5,
					reactorPower: 1.25,
					irradiationTime: 3600,
					irradiationEnd: '2026-01-11T10:00',
					measurementStartTime: '2026-01-12T12:00',
					decayTime: 93600,
					liveTime: 1800,
					realTime: 1820,
					fluence: 1.2e13,
					counts: [
						{
							grossCounts: 5000,
							netCounts: 4500,
							uncertainty: 67,
							grossCountsPositionalCorrectionFactor: 1,
							netCountsPositionalCorrectionFactor: 1,
							uncertaintyPositionalCorrectionFactor: 1
						},
						{
							grossCounts: 1200,
							netCounts: 1100,
							uncertainty: 40,
							grossCountsPositionalCorrectionFactor: 1,
							netCountsPositionalCorrectionFactor: 1,
							uncertaintyPositionalCorrectionFactor: 1
						}
					],
					irradiationType: 'total',
					dtType: 'simple',
					knownConcentration: [0.1, 0.02],
					knownUncertainty: [0.005, 0.001],
					concentrationUnits: ['ppm', 'ppm']
				}
			}
		],
		createdAt: new Date('2026-01-12T12:00:00.000Z').toISOString(),
		updatedAt: new Date('2026-01-12T12:30:00.000Z').toISOString()
	}
];

function isMockCosmosEnabled() {
	const value = process.env.MOCK_COSMOS?.trim().toLowerCase();
	return value === '1' || value === 'true' || value === 'yes';
}

function hasCosmosConfiguration() {
	// Only endpoint + key are required — database and container names have
	// defaults in cosmosClient.js.
	const endpoint = process.env.COSMOSDB_ENDPOINT?.trim();
	const key = process.env.COSMOSDB_KEY?.trim();

	return Boolean(endpoint && key);
}

/**
 * Sample data only when `MOCK_COSMOS` is set or no database is configured. A
 * configured database is always used — no `NODE_ENV` / `AZURE_FUNCTIONS_ENVIRONMENT`
 * guessing (Azure SWA managed functions default that to "Development").
 */
function shouldUseMockCatalog() {
	return isMockCosmosEnabled() || !hasCosmosConfiguration();
}

function clampLimit(rawValue) {
	const parsed = Number.parseInt(rawValue ?? '25', 10);
	if (!Number.isFinite(parsed)) {
		return 25;
	}

	return Math.min(Math.max(parsed, 1), 100);
}

function clampOffset(rawValue) {
	const parsed = Number.parseInt(rawValue ?? '0', 10);
	if (!Number.isFinite(parsed)) {
		return 0;
	}

	return Math.max(parsed, 0);
}

function buildSearchQuery(rawSearch, rawLimit, rawOffset) {
	const limit = clampLimit(rawLimit);
	const offset = clampOffset(rawOffset);
	const normalizedSearch = rawSearch?.trim().toLowerCase() ?? '';
	const pagingParameters = [
		{ name: '@offset', value: offset },
		{ name: '@limit', value: limit }
	];

	if (!normalizedSearch) {
		return {
			query: `
				SELECT * FROM c
				WHERE c.docType = @docType
				ORDER BY c._ts DESC
				OFFSET @offset LIMIT @limit
			`,
			parameters: [{ name: '@docType', value: 'reference-material' }, ...pagingParameters]
		};
	}

	return {
		query: `
			SELECT * FROM c
			WHERE c.docType = @docType
				AND (
					(IS_DEFINED(c.referenceKey) AND IS_STRING(c.referenceKey) AND CONTAINS(LOWER(c.referenceKey), @search))
					OR (IS_DEFINED(c.notes) AND IS_STRING(c.notes) AND CONTAINS(LOWER(c.notes), @search))
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.referenceMaterial.sampleName)
							AND IS_STRING(counting.referenceMaterial.sampleName)
							AND CONTAINS(LOWER(counting.referenceMaterial.sampleName), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.referenceMaterial.NETL_code)
							AND IS_STRING(counting.referenceMaterial.NETL_code)
							AND CONTAINS(LOWER(counting.referenceMaterial.NETL_code), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.countingLabel)
							AND IS_STRING(counting.countingLabel)
							AND CONTAINS(LOWER(counting.countingLabel), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.createdAt)
							AND IS_STRING(counting.createdAt)
							AND CONTAINS(LOWER(counting.createdAt), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.referenceMaterial.referenceDatasheetId)
							AND IS_STRING(counting.referenceMaterial.referenceDatasheetId)
							AND CONTAINS(LOWER(counting.referenceMaterial.referenceDatasheetId), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.referenceMaterial.irradiationEnd)
							AND IS_STRING(counting.referenceMaterial.irradiationEnd)
							AND CONTAINS(LOWER(counting.referenceMaterial.irradiationEnd), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.referenceMaterial.measurementStartTime)
							AND IS_STRING(counting.referenceMaterial.measurementStartTime)
							AND CONTAINS(LOWER(counting.referenceMaterial.measurementStartTime), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.referenceMaterial.irradiationType)
							AND IS_STRING(counting.referenceMaterial.irradiationType)
							AND CONTAINS(LOWER(counting.referenceMaterial.irradiationType), @search)
					)
					OR EXISTS(
						SELECT VALUE counting FROM counting IN c.countings
						WHERE IS_DEFINED(counting.referenceMaterial.dtType)
							AND IS_STRING(counting.referenceMaterial.dtType)
							AND CONTAINS(LOWER(counting.referenceMaterial.dtType), @search)
					)
				)
			ORDER BY c._ts DESC
			OFFSET @offset LIMIT @limit
		`,
		parameters: [
			{ name: '@docType', value: 'reference-material' },
			{ name: '@search', value: normalizedSearch },
			...pagingParameters
		]
	};
}

function getLatestCounting(item) {
	if (!Array.isArray(item?.countings) || item.countings.length === 0) {
		return null;
	}

	return item.countings[item.countings.length - 1] ?? null;
}

function mapReferenceMaterialItem(item) {
	const latestCounting = getLatestCounting(item);
	const countings = Array.isArray(item?.countings)
		? item.countings.filter((counting) => counting && typeof counting === 'object')
		: [];
	const isotopes = Array.isArray(item?.isotopes)
		? item.isotopes.filter((isotope) => isotope && typeof isotope === 'object')
		: [];

	return {
		id: typeof item?.id === 'string' ? item.id : '',
		referenceKey: typeof item?.referenceKey === 'string' ? item.referenceKey : '',
		notes: typeof item?.notes === 'string' ? item.notes : '',
		isotopes,
		countingCount: countings.length,
		countings,
		latestCounting: latestCounting && typeof latestCounting === 'object' ? latestCounting : null,
		createdAt: typeof item?.createdAt === 'string' ? item.createdAt : null,
		updatedAt: typeof item?.updatedAt === 'string' ? item.updatedAt : null,
		raw: item
	};
}

function matchesMockSearch(item, normalizedSearch) {
	if (!normalizedSearch) {
		return true;
	}

	const latestMaterial = getLatestCounting(item)?.referenceMaterial;
	const latestCounting = getLatestCounting(item);
	const haystack = [
		item.referenceKey,
		latestMaterial?.NETL_code,
		latestMaterial?.sampleName,
		item.notes,
		latestCounting?.countingLabel,
		latestCounting?.createdAt,
		latestMaterial?.referenceDatasheetId,
		latestMaterial?.irradiationEnd,
		latestMaterial?.measurementStartTime,
		latestMaterial?.irradiationType,
		latestMaterial?.dtType
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();

	return haystack.includes(normalizedSearch);
}

function getMockSearchResults(rawSearch, rawLimit, rawOffset) {
	const normalizedSearch = rawSearch?.trim().toLowerCase() ?? '';
	const limit = clampLimit(rawLimit);
	const offset = clampOffset(rawOffset);
	const matches = MOCK_REFERENCE_MATERIALS.filter((item) =>
		matchesMockSearch(item, normalizedSearch)
	);

	return {
		items: matches.slice(offset, offset + limit),
		hasMore: offset + limit < matches.length
	};
}

async function fetchItemsByIds(container, ids) {
	const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
	const results = await Promise.all(
		uniqueIds.map(async (id) => {
			const query = container.items.query({
				query: 'SELECT TOP 1 * FROM c WHERE c.id = @id',
				parameters: [{ name: '@id', value: id }]
			});

			const { resources } = await query.fetchAll();
			return resources[0] ?? null;
		})
	);

	return results.filter(Boolean);
}

async function fetchMeasurementLinks() {
	const container = getIsotopeMeasurementLinksContainer();
	const query = container.items.query({
		query: 'SELECT * FROM c WHERE c.docType = @docType',
		parameters: [{ name: '@docType', value: 'isotope-measurement-link' }]
	});

	const { resources } = await query.fetchAll();
	return Array.isArray(resources) ? resources : [];
}

async function buildReferenceMaterialEnrichmentLookups(items) {
	const datasheetIds = [];
	const isotopeIds = [];

	for (const item of items) {
		for (const isotope of Array.isArray(item?.isotopes) ? item.isotopes : []) {
			if (typeof isotope?.isotopeId === 'string' && isotope.isotopeId.trim().length > 0) {
				isotopeIds.push(isotope.isotopeId.trim());
			}
		}

		for (const counting of Array.isArray(item?.countings) ? item.countings : []) {
			const datasheetId = counting?.referenceMaterial?.referenceDatasheetId?.trim?.();
			if (datasheetId) {
				datasheetIds.push(datasheetId);
			}
		}

		const latestDatasheetId =
			item?.latestCounting?.referenceMaterial?.referenceDatasheetId?.trim?.();
		if (latestDatasheetId) {
			datasheetIds.push(latestDatasheetId);
		}
	}

	if (datasheetIds.length === 0 || isotopeIds.length === 0) {
		return {
			datasheetsById: {},
			isotopeCatalogById: {},
			measurementLinks: []
		};
	}

	const measurementLinks = await fetchMeasurementLinks().catch(() => []);
	for (const link of measurementLinks) {
		const measuredId = link?.measuredIsotope?.isotopeId?.trim?.();
		const targetId = link?.targetIsotope?.isotopeId?.trim?.();

		if (measuredId && isotopeIds.includes(measuredId) && targetId) {
			isotopeIds.push(targetId);
		}

		if (targetId && isotopeIds.includes(targetId) && measuredId) {
			isotopeIds.push(measuredId);
		}
	}

	const [datasheets, isotopes] = await Promise.all([
		fetchItemsByIds(getReferenceDatasheetContainer(), datasheetIds),
		fetchItemsByIds(getCosmosContainer(), isotopeIds)
	]);

	return {
		datasheetsById: Object.fromEntries(datasheets.map((item) => [item.id, item])),
		isotopeCatalogById: Object.fromEntries(
			isotopes.map((item) => {
				const mapped = mapIsotopeItem(item);
				return [mapped.id, mapped];
			})
		),
		measurementLinks
	};
}

async function referenceMaterialsHandler(request, context) {
	if (request.method === 'GET') {
		return getReferenceMaterialsHandler(request, context);
	}

	if (request.method === 'POST') {
		return createReferenceMaterialHandler(request, context);
	}

	return {
		status: 405,
		jsonBody: {
			error: 'Method not allowed.'
		}
	};
}

async function getReferenceMaterialsHandler(request, context) {
	if (shouldUseMockCatalog()) {
		const url = new URL(request.url);
		const search = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const offset = url.searchParams.get('offset');
		const { items: mockItems, hasMore } = getMockSearchResults(search, limit, offset);

		context.log('Returning mock reference material catalog results.', {
			search,
			count: mockItems.length,
			reason: isMockCosmosEnabled() ? 'MOCK_COSMOS' : 'no COSMOSDB_* configured'
		});

		return {
			status: 200,
			jsonBody: {
				items: mockItems.map(mapReferenceMaterialItem),
				count: mockItems.length,
				search,
				hasMore,
				mocked: true
			}
		};
	}

	try {
		const url = new URL(request.url);
		const search = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const offset = url.searchParams.get('offset');
		const queryText = buildSearchQuery(search, limit, offset);
		const container = getReferenceMaterialsContainer();
		const query = container.items.query(queryText);
		const { resources } = await query.fetchAll();
		const mappedItems = resources.map(mapReferenceMaterialItem);

		let enrichedItems = mappedItems;
		try {
			const lookups = await buildReferenceMaterialEnrichmentLookups(mappedItems);
			enrichedItems = enrichReferenceMaterialCatalogItems(mappedItems, lookups);
		} catch (error) {
			context.warn('Failed to enrich reference materials with datasheet concentrations.', error);
		}

		return {
			status: 200,
			jsonBody: {
				items: enrichedItems,
				count: resources.length,
				search,
				hasMore: resources.length === clampLimit(limit)
			}
		};
	} catch (error) {
		// A database is configured (we would not be here otherwise) but the query
		// failed — a real error. Surface it; never silently serve sample data.
		context.error('Failed to load reference materials from Cosmos DB.', error);

		return {
			status: 500,
			jsonBody: {
				error: 'Failed to load reference materials from Cosmos DB.'
			}
		};
	}
}

async function createReferenceMaterialHandler(request, context) {
	const authorization = canWriteIsotopes(request);
	if (!authorization.authorized) {
		return {
			status: authorization.status,
			jsonBody: {
				error: authorization.message
			}
		};
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return {
			status: 400,
			jsonBody: {
				error: 'Request body must be valid JSON.'
			}
		};
	}

	let item;
	try {
		item = normalizeReferenceMaterialWritePayload(body, authorization.principal);
	} catch (error) {
		return {
			status: 400,
			jsonBody: {
				error: error instanceof Error ? error.message : 'Invalid reference material payload.'
			}
		};
	}

	// "Update existing": overwrite one counting on a known document by id, rather
	// than matching on the metadata fingerprint (which forks on any edit).
	const replaceTarget =
		body?.mode === 'replace-counting' &&
		typeof body.targetItemId === 'string' &&
		body.targetItemId.trim() &&
		typeof body.targetCountingId === 'string' &&
		body.targetCountingId.trim()
			? { itemId: body.targetItemId.trim(), countingId: body.targetCountingId.trim() }
			: null;

	if (isMockCosmosEnabled()) {
		context.log('MOCK_COSMOS enabled: mock-saving reference material payload.', {
			referenceKey: item.referenceKey,
			isotopeCount: item.isotopes.length,
			countings: item.countings.length
		});

		return {
			status: replaceTarget ? 200 : 201,
			jsonBody: {
				item,
				created: !replaceTarget,
				...(replaceTarget
					? { replacedCounting: true }
					: { appendedCountings: item.countings.length }),
				totalCountings: item.countings.length,
				mocked: true
			}
		};
	}

	try {
		const container = getReferenceMaterialsContainer();

		if (replaceTarget) {
			const targetItem = await findReferenceMaterialById(container, replaceTarget.itemId);
			if (!targetItem) {
				return {
					status: 404,
					jsonBody: { error: 'The reference material to update no longer exists in the catalog.' }
				};
			}

			const replacedCounting = referenceMaterialHasCounting(targetItem, replaceTarget.countingId);
			const updatedItem = replaceCountingInReferenceMaterial(
				targetItem,
				item,
				replaceTarget.countingId,
				authorization.principal
			);
			const response = await container.items.upsert(updatedItem);

			return {
				status: 200,
				jsonBody: {
					item: response.resource ?? updatedItem,
					created: false,
					replacedCounting,
					totalCountings: updatedItem.countings.length
				}
			};
		}

		const existingItem = await findExistingReferenceMaterial(container, item.referenceKey);

		if (existingItem) {
			const previousCount = Array.isArray(existingItem.countings)
				? existingItem.countings.length
				: 0;
			const mergedItem = mergeReferenceMaterialWrite(existingItem, item, authorization.principal);
			const response = await container.items.upsert(mergedItem);
			const nextCount = Array.isArray(mergedItem.countings) ? mergedItem.countings.length : 0;
			const appendedCountings = Math.max(0, nextCount - previousCount);

			return {
				status: 200,
				jsonBody: {
					item: response.resource ?? mergedItem,
					created: false,
					appendedCountings,
					totalCountings: mergedItem.countings.length
				}
			};
		}

		const response = await container.items.create(item);

		return {
			status: 201,
			jsonBody: {
				item: response.resource ?? item,
				created: true,
				appendedCountings: item.countings.length,
				totalCountings: item.countings.length
			}
		};
	} catch (error) {
		context.error('Failed to write reference material to Cosmos DB.', error);

		return {
			status: 500,
			jsonBody: {
				error: 'Failed to write reference material to Cosmos DB.'
			}
		};
	}
}

async function findExistingReferenceMaterial(container, referenceKey) {
	const query = container.items.query({
		query: `
			SELECT TOP 1 * FROM c
			WHERE c.docType = @docType AND c.referenceKey = @referenceKey
		`,
		parameters: [
			{ name: '@docType', value: 'reference-material' },
			{ name: '@referenceKey', value: referenceKey }
		]
	});

	const { resources } = await query.fetchAll();
	return resources[0] ?? null;
}

async function findReferenceMaterialById(container, id) {
	const query = container.items.query({
		query: 'SELECT TOP 1 * FROM c WHERE c.docType = @docType AND c.id = @id',
		parameters: [
			{ name: '@docType', value: 'reference-material' },
			{ name: '@id', value: id }
		]
	});

	const { resources } = await query.fetchAll();
	return resources[0] ?? null;
}

app.http('reference-materials', {
	route: 'reference-materials',
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	handler: referenceMaterialsHandler
});

export { referenceMaterialsHandler };
