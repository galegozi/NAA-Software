import { app } from '@azure/functions';

import { getCosmosContainer } from '../lib/cosmosClient.js';
import { mapIsotopeItem } from '../lib/isotopeMapper.js';

async function isotopesHandler(request, context) {
	try {
		const queryText = process.env.COSMOSDB_QUERY?.trim() || 'SELECT * FROM c';
		const container = getCosmosContainer();
		const query = container.items.query({ query: queryText });
		const { resources } = await query.fetchAll();

		return {
			status: 200,
			jsonBody: {
				items: resources.map(mapIsotopeItem),
				count: resources.length
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