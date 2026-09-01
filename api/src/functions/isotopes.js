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

/** Page size. Paging is via Cosmos continuation tokens, not the query text. */
function clampLimit(rawValue) {
	const parsed = Number.parseInt(rawValue ?? '100', 10);
	if (!Number.isFinite(parsed)) {
		return 100;
	}
	return Math.min(Math.max(parsed, 1), 200);
}

/**
 * Plain `SELECT` — no `TOP`, `ORDER BY` or `OFFSET`. Paging is done with the
 * Cosmos SDK's continuation token (`fetchNext()` + `maxItemCount`), which needs
 * no index and has no per-page RU penalty. Cosmos rejects `OFFSET LIMIT` without
 * an `ORDER BY`, and an `ORDER BY` on an unindexed path fails — hence neither.
 */
function buildSearchQuery(rawSearch) {
	const normalizedSearch = rawSearch?.trim().toLowerCase() ?? '';

	if (!normalizedSearch) {
		return {
			query: 'SELECT * FROM c'
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
		query: `SELECT * FROM c WHERE ${conditions.join(' OR ')}`,
		parameters
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

/** Mock paging: the "continuation token" is just the next offset as a string. */
function getMockSearchResults(rawSearch, rawLimit, rawContinuation) {
	const normalizedSearch = rawSearch?.trim().toLowerCase() ?? '';
	const limit = clampLimit(rawLimit);
	const offset = Math.max(Number.parseInt(rawContinuation ?? '0', 10) || 0, 0);
	const matches = MOCK_ISOTOPES.filter((item) => matchesMockSearch(item, normalizedSearch));
	const page = matches.slice(offset, offset + limit);
	const nextOffset = offset + page.length;

	return {
		items: page,
		continuation: nextOffset < matches.length ? String(nextOffset) : null
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

	const url = new URL(request.url);
	const search = url.searchParams.get('q') ?? '';
	const rawLimit = url.searchParams.get('limit');
	const continuation = url.searchParams.get('continuation') || undefined;

	if (shouldUseMockCatalog()) {
		const { items: mockItems, continuation: nextToken } = getMockSearchResults(
			search,
			rawLimit,
			continuation
		);

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
				continuation: nextToken,
				hasMore: Boolean(nextToken),
				mocked: true
			}
		};
	}

	try {
		const queryText = buildSearchQuery(search);
		const container = getCosmosContainer();
		const iterator = container.items.query(queryText, {
			maxItemCount: clampLimit(rawLimit),
			continuationToken: continuation
		});
		const page = await iterator.fetchNext();
		const resources = Array.isArray(page.resources) ? page.resources : [];
		const nextToken = page.hasMoreResults ? (page.continuationToken ?? null) : null;

		return {
			status: 200,
			jsonBody: {
				items: resources.map(mapIsotopeItem),
				count: resources.length,
				search,
				continuation: nextToken,
				hasMore: Boolean(nextToken)
			}
		};
	} catch (error) {
		// Only fall back to sample data when there is genuinely no database
		// configured (pure local dev). If Cosmos IS configured and the query
		// failed, that is a real error — surface it, never silently serve mocks.
		if (isLocalDevelopmentEnvironment() && !hasCosmosConfiguration()) {
			const { items: mockItems, continuation: nextToken } = getMockSearchResults(
				search,
				rawLimit,
				continuation
			);

			context.warn(
				'Cosmos query failed with no database configured. Falling back to mock isotope catalog.',
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
					continuation: nextToken,
					hasMore: Boolean(nextToken),
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

export { isotopesHandler, buildSearchQuery };
