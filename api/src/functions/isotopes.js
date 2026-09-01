import { app } from '@azure/functions';

import { getCosmosContainer } from '../lib/cosmosClient.js';
import { mapIsotopeItem } from '../lib/isotopeMapper.js';
import { mergeIsotopeWrite, normalizeIsotopeWritePayload } from '../lib/isotopeWritePayload.js';
import { canWriteIsotopes } from '../lib/staticWebAppsAuth.js';

const MOCK_ISOTOPES = [
	{
		id: 'mock-co-60',
		elementName: 'Cobalt',
		shortName: 'Co',
		massNumber: 60,
		suffix: '',
		energies: [1173.2, 1332.5],
		halfLife: 5.2714,
		halfLifeUnit: 'years',
		halfLifeSeconds: 166331520
	},
	{
		id: 'mock-cs-137',
		elementName: 'Cesium',
		shortName: 'Cs',
		massNumber: 137,
		suffix: '',
		energies: [661.657],
		halfLife: 30.05,
		halfLifeUnit: 'years',
		halfLifeSeconds: 948682800
	},
	{
		id: 'mock-na-24',
		elementName: 'Sodium',
		shortName: 'Na',
		massNumber: 24,
		suffix: '',
		energies: [1368.626, 2754.007],
		halfLife: 14.96,
		halfLifeUnit: 'hours',
		halfLifeSeconds: 53856
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
	const container = process.env.COSMOSDB_CONTAINER?.trim();

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
			query: 'SELECT * FROM c ORDER BY c.id OFFSET @offset LIMIT @limit',
			parameters: pagingParameters
		};
	}

	const alphaSearch = normalizedSearch.replace(/[^a-z]/g, '');
	const massNumberMatch = normalizedSearch.match(/\d+/);
	const conditions = [
		'(IS_DEFINED(c.elementName) AND IS_STRING(c.elementName) AND CONTAINS(LOWER(c.elementName), @search))',
		'(IS_DEFINED(c.shortName) AND IS_STRING(c.shortName) AND CONTAINS(LOWER(c.shortName), @search))',
		'(IS_DEFINED(c.suffix) AND IS_STRING(c.suffix) AND CONTAINS(LOWER(c.suffix), @search))'
	];
	const parameters = [{ name: '@search', value: normalizedSearch }];

	if (alphaSearch && alphaSearch !== normalizedSearch) {
		conditions.push(
			'(IS_DEFINED(c.elementName) AND IS_STRING(c.elementName) AND CONTAINS(LOWER(c.elementName), @alphaSearch))'
		);
		conditions.push(
			'(IS_DEFINED(c.shortName) AND IS_STRING(c.shortName) AND CONTAINS(LOWER(c.shortName), @alphaSearch))'
		);
		parameters.push({ name: '@alphaSearch', value: alphaSearch });
	}

	if (massNumberMatch) {
		conditions.push('c.massNumber = @massNumber');
		parameters.push({ name: '@massNumber', value: Number.parseInt(massNumberMatch[0], 10) });
	}

	return {
		query: `SELECT * FROM c WHERE ${conditions.join(' OR ')} ORDER BY c.id OFFSET @offset LIMIT @limit`,
		parameters: [...parameters, ...pagingParameters]
	};
}

function matchesMockSearch(item, normalizedSearch) {
	if (!normalizedSearch) {
		return true;
	}

	const alphaSearch = normalizedSearch.replace(/[^a-z]/g, '');
	const massNumberMatch = normalizedSearch.match(/\d+/);
	const normalizedMass = massNumberMatch ? Number.parseInt(massNumberMatch[0], 10) : null;

	const fields = [
		item.elementName,
		item.shortName,
		item.suffix,
		String(item.massNumber),
		item.energies.map((energy) => String(energy)).join(' ')
	]
		.join(' ')
		.toLowerCase();

	if (fields.includes(normalizedSearch)) {
		return true;
	}

	if (alphaSearch && alphaSearch !== normalizedSearch) {
		const alphaFields = [item.elementName, item.shortName].join(' ').toLowerCase();
		if (alphaFields.includes(alphaSearch)) {
			return true;
		}
	}

	if (normalizedMass !== null && item.massNumber === normalizedMass) {
		return true;
	}

	return false;
}

function getMockSearchResults(rawSearch, rawLimit, rawOffset) {
	const normalizedSearch = rawSearch?.trim().toLowerCase() ?? '';
	const limit = clampLimit(rawLimit);
	const offset = clampOffset(rawOffset);
	const matches = MOCK_ISOTOPES.filter((item) => matchesMockSearch(item, normalizedSearch));

	return {
		items: matches.slice(offset, offset + limit),
		hasMore: offset + limit < matches.length
	};
}

async function isotopesHandler(request, context) {
	if (request.method === 'POST') {
		return createIsotopeHandler(request, context);
	}

	// GET is the only other registered method — anything else is a config change.
	if (request.method !== 'GET') {
		return {
			status: 405,
			jsonBody: { error: 'Method not allowed.' }
		};
	}

	if (shouldUseMockCatalog()) {
		const url = new URL(request.url);
		const search = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const offset = url.searchParams.get('offset');
		const { items: mockItems, hasMore } = getMockSearchResults(search, limit, offset);

		context.log('Returning mock isotope catalog results.', {
			search,
			count: mockItems.length,
			mockCosmos: isMockCosmosEnabled(),
			fallbackLocal: !isMockCosmosEnabled() && isLocalDevelopmentEnvironment()
		});

		return {
			status: 200,
			jsonBody: {
				items: mockItems.map(mapIsotopeItem),
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
		const container = getCosmosContainer();
		const query = container.items.query(queryText);
		const { resources } = await query.fetchAll();

		return {
			status: 200,
			jsonBody: {
				items: resources.map(mapIsotopeItem),
				count: resources.length,
				search,
				hasMore: resources.length === clampLimit(limit)
			}
		};
	} catch (error) {
		if (isLocalDevelopmentEnvironment()) {
			const url = new URL(request.url);
			const search = url.searchParams.get('q') ?? '';
			const limit = url.searchParams.get('limit');
			const offset = url.searchParams.get('offset');
			const { items: mockItems, hasMore } = getMockSearchResults(search, limit, offset);

			context.warn(
				'Cosmos query failed in local development. Falling back to mock isotope catalog.',
				{
					search,
					count: mockItems.length,
					error: error instanceof Error ? error.message : String(error)
				}
			);

			return {
				status: 200,
				jsonBody: {
					items: mockItems.map(mapIsotopeItem),
					count: mockItems.length,
					search,
					hasMore,
					mocked: true,
					fallback: 'local-cosmos-error'
				}
			};
		}

		context.error('Failed to load isotopes from Cosmos DB.', error);

		return {
			status: 500,
			jsonBody: {
				error: 'Failed to load isotopes from Cosmos DB.'
			}
		};
	}
}

async function createIsotopeHandler(request, context) {
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
		item = normalizeIsotopeWritePayload(body, authorization.principal);
	} catch (error) {
		return {
			status: 400,
			jsonBody: {
				error: error instanceof Error ? error.message : 'Invalid isotope payload.'
			}
		};
	}

	// 'replace' lets the wizard's "Update existing" action overwrite half-life /
	// element / energy list on the matched record. Defaults to append-only.
	const writeMode = body?.mode === 'replace' ? 'replace' : 'append';

	if (isMockCosmosEnabled()) {
		context.log('MOCK_COSMOS enabled: mock-saving isotope payload.', {
			shortName: item.shortName,
			massNumber: item.massNumber,
			suffix: item.suffix,
			energies: item.energies
		});

		return {
			status: 201,
			jsonBody: {
				item: mapIsotopeItem(item),
				created: true,
				appendedEnergy: false,
				mocked: true
			}
		};
	}

	try {
		const container = getCosmosContainer();
		const existingItem = await findExistingIsotope(container, item);

		if (existingItem) {
			const mergedItem = mergeIsotopeWrite(existingItem, item, authorization.principal, {
				mode: writeMode
			});
			const response = await container.items.upsert(mergedItem);

			return {
				status: 200,
				jsonBody: {
					item: mapIsotopeItem(response.resource ?? mergedItem),
					created: false,
					appendedEnergy: writeMode === 'append',
					replaced: writeMode === 'replace'
				}
			};
		}

		const response = await container.items.create(item);

		return {
			status: 201,
			jsonBody: {
				item: mapIsotopeItem(response.resource ?? item),
				created: true,
				appendedEnergy: false
			}
		};
	} catch (error) {
		context.error('Failed to write isotope to Cosmos DB.', error);

		return {
			status: 500,
			jsonBody: {
				error: 'Failed to write isotope to Cosmos DB.'
			}
		};
	}
}

async function findExistingIsotope(container, item) {
	const query = container.items.query({
		query: `
			SELECT TOP 1 * FROM c
			WHERE (
				LOWER(c.shortName) = @shortName
				AND c.massNumber = @massNumber
				AND LOWER(c.suffix) = @suffix
			)
		`,
		parameters: [
			{ name: '@shortName', value: item.shortName.toLowerCase() },
			{ name: '@massNumber', value: item.massNumber },
			{ name: '@suffix', value: item.suffix.toLowerCase() }
		]
	});

	const { resources } = await query.fetchAll();
	return resources[0] ?? null;
}

app.http('isotopes', {
	route: 'isotopes',
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	handler: isotopesHandler
});

export { isotopesHandler };
