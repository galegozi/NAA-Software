import { app } from '@azure/functions';

import { getReferenceMaterialsContainer } from '../lib/cosmosClient.js';
import { mergeReferenceMaterialWrite, normalizeReferenceMaterialWritePayload } from '../lib/referenceMaterialWritePayload.js';
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

function isLocalDevelopmentEnvironment() {
	const runtime = process.env.AZURE_FUNCTIONS_ENVIRONMENT?.trim().toLowerCase();
	const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
	return runtime === 'development' || nodeEnv === 'development';
}

function hasCosmosConfiguration() {
	const endpoint = process.env.COSMOSDB_ENDPOINT?.trim();
	const key = process.env.COSMOSDB_KEY?.trim();
	const database = process.env.COSMOSDB_DATABASE?.trim();
	const container = process.env.COSMOSDB_REFERENCE_CONTAINER?.trim();

	return Boolean(endpoint && key && database && container);
}

function shouldUseMockCatalog() {
	if (isMockCosmosEnabled()) {
		return true;
	}

	return isLocalDevelopmentEnvironment() && !hasCosmosConfiguration();
}

function clampLimit(rawValue) {
	const parsed = Number.parseInt(rawValue ?? '25', 10);
	if (!Number.isFinite(parsed)) {
		return 25;
	}

	return Math.min(Math.max(parsed, 1), 100);
}

function buildSearchQuery(rawSearch, rawLimit) {
	const limit = clampLimit(rawLimit);
	const normalizedSearch = rawSearch?.trim().toLowerCase() ?? '';

	if (!normalizedSearch) {
		return {
			query: `
				SELECT TOP ${limit} * FROM c
				WHERE c.docType = @docType
				ORDER BY c._ts DESC
			`,
			parameters: [{ name: '@docType', value: 'reference-material' }]
		};
	}

	return {
		query: `
			SELECT TOP ${limit} * FROM c
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
		`,
		parameters: [
			{ name: '@docType', value: 'reference-material' },
			{ name: '@search', value: normalizedSearch }
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
		? item.countings
				.filter((counting) => counting && typeof counting === 'object')
				.map((counting) => ({
					countingId: typeof counting.countingId === 'string' ? counting.countingId : '',
					countingLabel:
						typeof counting.countingLabel === 'string' ? counting.countingLabel : 'Counting',
					createdAt: typeof counting.createdAt === 'string' ? counting.createdAt : undefined,
					referenceMaterial: counting.referenceMaterial
				}))
		: [];

	return {
		id: typeof item?.id === 'string' ? item.id : '',
		referenceKey: typeof item?.referenceKey === 'string' ? item.referenceKey : '',
		notes: typeof item?.notes === 'string' ? item.notes : '',
		isotopes: Array.isArray(item?.isotopes)
			? item.isotopes.map((isotope) => ({
					isotopeId: typeof isotope?.isotopeId === 'string' ? isotope.isotopeId : '',
					energy: Number.isFinite(Number(isotope?.energy)) ? Number(isotope.energy) : null
				}))
			: [],
		countingCount: Array.isArray(item?.countings) ? item.countings.length : 0,
		countings,
		latestCounting: latestCounting
			? {
				countingId: typeof latestCounting.countingId === 'string' ? latestCounting.countingId : '',
				countingLabel:
					typeof latestCounting.countingLabel === 'string'
						? latestCounting.countingLabel
						: 'Counting',
				createdAt:
					typeof latestCounting.createdAt === 'string' ? latestCounting.createdAt : undefined,
				referenceMaterial: latestCounting.referenceMaterial
			}
			: null,
		createdAt: typeof item?.createdAt === 'string' ? item.createdAt : null,
		updatedAt: typeof item?.updatedAt === 'string' ? item.updatedAt : null
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

function getMockSearchResults(rawSearch, rawLimit) {
	const normalizedSearch = rawSearch?.trim().toLowerCase() ?? '';
	const limit = clampLimit(rawLimit);

	return MOCK_REFERENCE_MATERIALS.filter((item) => matchesMockSearch(item, normalizedSearch)).slice(0, limit);
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
		const mockItems = getMockSearchResults(search, limit);

		context.log('Returning mock reference material catalog results.', {
			search,
			count: mockItems.length,
			mockCosmos: isMockCosmosEnabled(),
			fallbackLocal: !isMockCosmosEnabled() && isLocalDevelopmentEnvironment()
		});

		return {
			status: 200,
			jsonBody: {
				items: mockItems.map(mapReferenceMaterialItem),
				count: mockItems.length,
				search,
				mocked: true
			}
		};
	}

	try {
		const url = new URL(request.url);
		const search = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const queryText = buildSearchQuery(search, limit);
		const container = getReferenceMaterialsContainer();
		const query = container.items.query(queryText);
		const { resources } = await query.fetchAll();

		return {
			status: 200,
			jsonBody: {
				items: resources.map(mapReferenceMaterialItem),
				count: resources.length,
				search
			}
		};
	} catch (error) {
		if (isLocalDevelopmentEnvironment()) {
			const url = new URL(request.url);
			const search = url.searchParams.get('q') ?? '';
			const limit = url.searchParams.get('limit');
			const mockItems = getMockSearchResults(search, limit);

			context.warn(
				'Cosmos query failed in local development. Falling back to mock reference material catalog.',
				{
					search,
					count: mockItems.length,
					error: error instanceof Error ? error.message : String(error)
				}
			);

			return {
				status: 200,
				jsonBody: {
					items: mockItems.map(mapReferenceMaterialItem),
					count: mockItems.length,
					search,
					mocked: true,
					fallback: 'local-cosmos-error'
				}
			};
		}

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

	if (isMockCosmosEnabled()) {
		context.log('MOCK_COSMOS enabled: mock-saving reference material payload.', {
			referenceKey: item.referenceKey,
			isotopeCount: item.isotopes.length,
			countings: item.countings.length
		});

		return {
			status: 201,
			jsonBody: {
				item,
				created: true,
				appendedCountings: item.countings.length,
				totalCountings: item.countings.length,
				mocked: true
			}
		};
	}

	try {
		const container = getReferenceMaterialsContainer();
		const existingItem = await findExistingReferenceMaterial(container, item.referenceKey);

		if (existingItem) {
			const previousCount = Array.isArray(existingItem.countings) ? existingItem.countings.length : 0;
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

app.http('reference-materials', {
	route: 'reference-materials',
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	handler: referenceMaterialsHandler
});
