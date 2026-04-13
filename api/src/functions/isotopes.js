import { app } from '@azure/functions';

import { getCosmosContainer } from '../lib/cosmosClient.js';
import { mapIsotopeItem } from '../lib/isotopeMapper.js';

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

app.http('isotopes', {
	route: 'isotopes',
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: isotopesHandler
});