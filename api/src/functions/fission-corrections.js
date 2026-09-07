import { app } from '@azure/functions';

import { getFissionCorrectionsContainer } from '../lib/cosmosClient.js';
import {
	fissionCorrectionIdentityKey,
	mergeFissionCorrectionWrite,
	normalizeFissionCorrectionPayload
} from '../lib/fissionCorrectionWritePayload.js';
import { canWriteIsotopes } from '../lib/staticWebAppsAuth.js';

const DOC_TYPE = 'fission-correction';

function isMockCosmosEnabled() {
	const value = process.env.MOCK_COSMOS?.trim().toLowerCase();
	return value === '1' || value === 'true' || value === 'yes';
}

async function listFissionCorrections(container) {
	const query = container.items.query({
		query: 'SELECT * FROM c WHERE c.docType = @docType ORDER BY c.createdAt DESC',
		parameters: [{ name: '@docType', value: DOC_TYPE }]
	});
	const { resources } = await query.fetchAll();
	return Array.isArray(resources) ? resources : [];
}

async function findExisting(container, item) {
	const wantKey = fissionCorrectionIdentityKey(item);
	const items = await listFissionCorrections(container);
	return items.find((row) => fissionCorrectionIdentityKey(row) === wantKey) ?? null;
}

async function fissionCorrectionsHandler(request, context) {
	if (request.method !== 'GET' && request.method !== 'POST') {
		return { status: 405, jsonBody: { error: 'Method not allowed.' } };
	}

	// Reads are public (this is reference data, like the rest of the catalog).
	// Only writes require the writer role.
	if (request.method === 'GET') {
		if (isMockCosmosEnabled()) {
			return { status: 200, jsonBody: { items: [] } };
		}
		try {
			const container = getFissionCorrectionsContainer();
			const items = await listFissionCorrections(container);
			return { status: 200, jsonBody: { items } };
		} catch (error) {
			context.error('Failed to list fission corrections.', error);
			return { status: 500, jsonBody: { error: 'Failed to load fission corrections.' } };
		}
	}

	const authorization = canWriteIsotopes(request);
	if (!authorization.authorized) {
		return { status: authorization.status, jsonBody: { error: authorization.message } };
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return { status: 400, jsonBody: { error: 'Request body must be valid JSON.' } };
	}

	let item;
	try {
		item = normalizeFissionCorrectionPayload(body, authorization.principal);
	} catch (error) {
		return {
			status: 400,
			jsonBody: {
				error: error instanceof Error ? error.message : 'Invalid fission-correction payload.'
			}
		};
	}

	if (isMockCosmosEnabled()) {
		return { status: 201, jsonBody: { item, created: true, mocked: true } };
	}

	try {
		const container = getFissionCorrectionsContainer();
		const existing = await findExisting(container, item);
		if (existing) {
			const merged = mergeFissionCorrectionWrite(existing, item, authorization.principal);
			const response = await container.items.upsert(merged);
			return { status: 200, jsonBody: { item: response.resource ?? merged, created: false } };
		}
		const response = await container.items.create(item);
		return { status: 201, jsonBody: { item: response.resource ?? item, created: true } };
	} catch (error) {
		context.error('Failed to save fission correction.', error);
		return { status: 500, jsonBody: { error: 'Failed to save fission correction.' } };
	}
}

app.http('fission-corrections', {
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	route: 'fission-corrections',
	handler: fissionCorrectionsHandler
});

export { fissionCorrectionsHandler };
