import { app } from '@azure/functions';
import { randomUUID } from 'crypto';

import { getReferenceDatasheetContainer } from '../lib/cosmosClient.js';
import { canWriteIsotopes } from '../lib/staticWebAppsAuth.js';

function isMockCosmosEnabled() {
	const value = process.env.MOCK_COSMOS?.trim().toLowerCase();
	return value === '1' || value === 'true' || value === 'yes';
}

/**
 * Validates a single concentration entry.
 * @param {unknown} entry
 * @param {number} index
 * @returns {string|null} error message or null
 */
function validateConcentrationEntry(entry, index) {
	if (typeof entry !== 'object' || entry === null) {
		return `Entry at index ${index} must be an object.`;
	}

	const { label, concentration, uncertainty, unit } = entry;

	if (typeof label !== 'string' || label.trim().length === 0) {
		return `Entry at index ${index}: label must be a non-empty string.`;
	}

	if (typeof concentration !== 'number' || !isFinite(concentration) || concentration < 0) {
		return `Entry at index ${index}: concentration must be a non-negative finite number.`;
	}

	if (typeof uncertainty !== 'number' || !isFinite(uncertainty) || uncertainty < 0) {
		return `Entry at index ${index}: uncertainty must be a non-negative finite number.`;
	}

	if (unit !== 'ppm' && unit !== 'percentage') {
		return `Entry at index ${index}: unit must be 'ppm' or 'percentage'.`;
	}

	return null;
}

/**
 * Normalizes and validates the incoming request body into a storable document.
 * @param {unknown} body
 * @param {object} principal
 */
function normalizeDatasheetPayload(body, principal) {
	if (typeof body !== 'object' || body === null) {
		throw new Error('Request body must be a JSON object.');
	}

	const { sampleName, entries } = body;

	if (typeof sampleName !== 'string' || sampleName.trim().length === 0) {
		throw new Error('sampleName must be a non-empty string.');
	}

	if (!Array.isArray(entries) || entries.length === 0) {
		throw new Error('entries must be a non-empty array.');
	}

	for (let i = 0; i < entries.length; i++) {
		const error = validateConcentrationEntry(entries[i], i);
		if (error) {
			throw new Error(error);
		}
	}

	return {
		id: randomUUID(),
		docType: 'reference-datasheet',
		sampleName: sampleName.trim(),
		entries: entries.map((e) => ({
			label: e.label.trim(),
			concentration: e.concentration,
			uncertainty: e.uncertainty,
			unit: e.unit
		})),
		createdBy: principal?.userDetails || principal?.userId || 'unknown',
		createdAt: new Date().toISOString()
	};
}

async function listReferenceDatasheets() {
	const container = getReferenceDatasheetContainer();
	const query = container.items.query({
		query: 'SELECT * FROM c ORDER BY c.createdAt DESC'
	});

	const { resources } = await query.fetchAll();
	const items = Array.isArray(resources) ? resources : [];

	return items
		.map((item) => ({
			id: item?.id,
			sampleName: typeof item?.sampleName === 'string' ? item.sampleName : '',
			entries: Array.isArray(item?.entries) ? item.entries : [],
			createdAt: item?.createdAt ?? null
		}))
		.filter(
			(item) => typeof item.id === 'string' && item.id.length > 0 && item.sampleName.length > 0
		);
}

async function referenceDatasheetsHandler(request, context) {
	if (request.method !== 'POST' && request.method !== 'GET') {
		return {
			status: 405,
			jsonBody: { error: 'Method not allowed.' }
		};
	}

	// Reads are public — datasheets are certified reference concentrations, like
	// the rest of the shared catalog. Only writes require the `isotope_writer` role.
	if (request.method === 'GET') {
		if (isMockCosmosEnabled()) {
			return {
				status: 200,
				jsonBody: { items: [] }
			};
		}
		try {
			const items = await listReferenceDatasheets();
			return {
				status: 200,
				jsonBody: { items }
			};
		} catch (error) {
			context.log('Error listing reference datasheets:', error);
			return {
				status: 500,
				jsonBody: { error: 'Failed to load reference datasheets.' }
			};
		}
	}

	const authorization = canWriteIsotopes(request);
	if (!authorization.authorized) {
		return {
			status: authorization.status,
			jsonBody: { error: authorization.message }
		};
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return {
			status: 400,
			jsonBody: { error: 'Request body must be valid JSON.' }
		};
	}

	let item;
	try {
		item = normalizeDatasheetPayload(body, authorization.principal);
	} catch (error) {
		return {
			status: 400,
			jsonBody: { error: error instanceof Error ? error.message : 'Invalid datasheet payload.' }
		};
	}

	if (isMockCosmosEnabled()) {
		context.log('MOCK_COSMOS enabled: mock-saving reference datasheet.', {
			sampleName: item.sampleName,
			entryCount: item.entries.length
		});

		return {
			status: 201,
			jsonBody: { item, created: true, mocked: true }
		};
	}

	try {
		const container = getReferenceDatasheetContainer();
		const response = await container.items.create(item);

		return {
			status: 201,
			jsonBody: { item: response.resource ?? item, created: true }
		};
	} catch (error) {
		context.log('Error saving reference datasheet:', error);
		return {
			status: 500,
			jsonBody: { error: 'Failed to save reference datasheet.' }
		};
	}
}

app.http('reference-datasheets', {
	methods: ['POST', 'GET'],
	authLevel: 'anonymous',
	route: 'reference-datasheets',
	handler: referenceDatasheetsHandler
});

export { referenceDatasheetsHandler };
