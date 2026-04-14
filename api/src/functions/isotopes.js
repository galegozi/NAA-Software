import { app } from '@azure/functions';

import { getCosmosContainer } from '../lib/cosmosClient.js';
import { mapIsotopeItem } from '../lib/isotopeMapper.js';
import { mergeIsotopeWrite, normalizeIsotopeWritePayload } from '../lib/isotopeWritePayload.js';
import { canWriteIsotopes } from '../lib/staticWebAppsAuth.js';

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
			query: `SELECT TOP ${limit} * FROM c`
		};
	}

	const alphaSearch = normalizedSearch.replace(/[^a-z]/g, '');
	const massNumberMatch = normalizedSearch.match(/\d+/);
	const conditions = [
		'CONTAINS(LOWER(c.elementName), @search)',
		'CONTAINS(LOWER(c.shortName), @search)',
		'CONTAINS(LOWER(c.suffix), @search)'
	];
	const parameters = [{ name: '@search', value: normalizedSearch }];

	if (alphaSearch && alphaSearch !== normalizedSearch) {
		conditions.push('CONTAINS(LOWER(c.elementName), @alphaSearch)');
		conditions.push('CONTAINS(LOWER(c.shortName), @alphaSearch)');
		parameters.push({ name: '@alphaSearch', value: alphaSearch });
	}

	if (massNumberMatch) {
		conditions.push('c.massNumber = @massNumber');
		parameters.push({ name: '@massNumber', value: Number.parseInt(massNumberMatch[0], 10) });
	}

	return {
		query: `SELECT TOP ${limit} * FROM c WHERE ${conditions.join(' OR ')}`,
		parameters
	};
}

async function isotopesHandler(request, context) {
	if (request.method === 'POST') {
		return createIsotopeHandler(request, context);
	}

	try {
		const url = new URL(request.url);
		const search = url.searchParams.get('q') ?? '';
		const limit = url.searchParams.get('limit');
		const queryText = buildSearchQuery(search, limit);
		const container = getCosmosContainer();
		const query = container.items.query(queryText);
		const { resources } = await query.fetchAll();

		return {
			status: 200,
			jsonBody: {
				items: resources.map(mapIsotopeItem),
				count: resources.length,
				search
			}
		};
	} catch (error) {
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

	try {
		const container = getCosmosContainer();
		const existingItem = await findExistingIsotope(container, item);

		if (existingItem) {
			const mergedItem = mergeIsotopeWrite(existingItem, item, authorization.principal);
			const response = await container.items.upsert(mergedItem);

			return {
				status: 200,
				jsonBody: {
					item: mapIsotopeItem(response.resource ?? mergedItem),
					created: false,
					appendedEnergy: true
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