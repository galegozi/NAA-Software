import { app } from '@azure/functions';

import { getReferenceMaterialsContainer } from '../lib/cosmosClient.js';
import { mergeReferenceMaterialWrite, normalizeReferenceMaterialWritePayload } from '../lib/referenceMaterialWritePayload.js';
import { canWriteIsotopes } from '../lib/staticWebAppsAuth.js';

function isMockCosmosEnabled() {
	const value = process.env.MOCK_COSMOS?.trim().toLowerCase();
	return value === '1' || value === 'true' || value === 'yes';
}

async function referenceMaterialsHandler(request, context) {
	if (request.method !== 'POST') {
		return {
			status: 405,
			jsonBody: {
				error: 'Method not allowed.'
			}
		};
	}

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
	methods: ['POST'],
	authLevel: 'anonymous',
	handler: referenceMaterialsHandler
});
