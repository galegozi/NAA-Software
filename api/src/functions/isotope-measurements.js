import { app } from '@azure/functions';
import { randomUUID } from 'node:crypto';

import { getIsotopeMeasurementLinksContainer } from '../lib/cosmosClient.js';
import { canWriteIsotopes } from '../lib/staticWebAppsAuth.js';

function isMockCosmosEnabled() {
	const value = process.env.MOCK_COSMOS?.trim().toLowerCase();
	return value === '1' || value === 'true' || value === 'yes';
}

function toTrimmedString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeFiniteNumber(value, fieldName, { min = -Infinity, max = Infinity } = {}) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
		throw new Error(`'${fieldName}' must be a finite number between ${min} and ${max}.`);
	}
	return parsed;
}

function normalizeIsotopeSelection(payload, fieldPrefix) {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error(`'${fieldPrefix}' must be an object.`);
	}

	const isotopeId = toTrimmedString(payload.isotopeId);
	if (!isotopeId) {
		throw new Error(`'${fieldPrefix}.isotopeId' is required.`);
	}

	return {
		isotopeId,
		energy: normalizeFiniteNumber(payload.energy, `${fieldPrefix}.energy`, { min: 0 }),
		elementName: toTrimmedString(payload.elementName),
		isotopeName: toTrimmedString(payload.isotopeName)
	};
}

function normalizePayload(body, principal) {
	if (typeof body !== 'object' || body === null) {
		throw new Error('Request body must be a JSON object.');
	}

	const measuredIsotope = normalizeIsotopeSelection(body.measuredIsotope, 'measuredIsotope');
	const targetIsotope = normalizeIsotopeSelection(body.targetIsotope, 'targetIsotope');
	const notes = toTrimmedString(body.notes).slice(0, 1000);

	if (
		measuredIsotope.isotopeId === targetIsotope.isotopeId &&
		measuredIsotope.energy === targetIsotope.energy
	) {
		throw new Error('Measured isotope and target isotope cannot be identical.');
	}

	return {
		id: randomUUID(),
		docType: 'isotope-measurement-link',
		measuredIsotope,
		targetIsotope,
		notes,
		createdAt: new Date().toISOString(),
		createdBy: principal?.userDetails || principal?.userId || 'unknown'
	};
}

async function findExistingLink(container, measuredIsotope, targetIsotope) {
	const query = container.items.query({
		query: `
			SELECT TOP 1 * FROM c
			WHERE c.docType = @docType
				AND c.measuredIsotope.isotopeId = @measuredId
				AND c.measuredIsotope.energy = @measuredEnergy
				AND c.targetIsotope.isotopeId = @targetId
				AND c.targetIsotope.energy = @targetEnergy
		`,
		parameters: [
			{ name: '@docType', value: 'isotope-measurement-link' },
			{ name: '@measuredId', value: measuredIsotope.isotopeId },
			{ name: '@measuredEnergy', value: measuredIsotope.energy },
			{ name: '@targetId', value: targetIsotope.isotopeId },
			{ name: '@targetEnergy', value: targetIsotope.energy }
		]
	});

	const { resources } = await query.fetchAll();
	return resources[0] ?? null;
}

async function listMeasurementLinks(container) {
	const query = container.items.query({
		query: 'SELECT * FROM c WHERE c.docType = @docType ORDER BY c.createdAt DESC',
		parameters: [{ name: '@docType', value: 'isotope-measurement-link' }]
	});

	const { resources } = await query.fetchAll();
	return Array.isArray(resources) ? resources : [];
}

async function isotopeMeasurementsHandler(request, context) {
	if (request.method !== 'GET' && request.method !== 'POST') {
		return {
			status: 405,
			jsonBody: { error: 'Method not allowed.' }
		};
	}

	const authorization = canWriteIsotopes(request);
	if (!authorization.authorized) {
		return {
			status: authorization.status,
			jsonBody: { error: authorization.message }
		};
	}

	if (request.method === 'GET') {
		if (isMockCosmosEnabled()) {
			return {
				status: 200,
				jsonBody: { items: [] }
			};
		}

		try {
			const container = getIsotopeMeasurementLinksContainer();
			const items = await listMeasurementLinks(container);
			return {
				status: 200,
				jsonBody: { items }
			};
		} catch (error) {
			context.error('Failed to list isotope measurement links.', error);
			return {
				status: 500,
				jsonBody: { error: 'Failed to load isotope measurement links.' }
			};
		}
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
		item = normalizePayload(body, authorization.principal);
	} catch (error) {
		return {
			status: 400,
			jsonBody: { error: error instanceof Error ? error.message : 'Invalid isotope mapping payload.' }
		};
	}

	if (isMockCosmosEnabled()) {
		return {
			status: 201,
			jsonBody: { item, created: true, mocked: true }
		};
	}

	try {
		const container = getIsotopeMeasurementLinksContainer();
		const existing = await findExistingLink(container, item.measuredIsotope, item.targetIsotope);
		if (existing) {
			const merged = {
				...existing,
				notes: item.notes || existing.notes || '',
				updatedAt: new Date().toISOString(),
				updatedBy: authorization.principal?.userDetails || authorization.principal?.userId || 'unknown'
			};
			const response = await container.items.upsert(merged);
			return {
				status: 200,
				jsonBody: { item: response.resource ?? merged, created: false }
			};
		}

		const response = await container.items.create(item);
		return {
			status: 201,
			jsonBody: { item: response.resource ?? item, created: true }
		};
	} catch (error) {
		context.error('Failed to save isotope measurement link.', error);
		return {
			status: 500,
			jsonBody: { error: 'Failed to save isotope measurement link.' }
		};
	}
}

app.http('isotope-measurements', {
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	route: 'isotope-measurements',
	handler: isotopeMeasurementsHandler
});
