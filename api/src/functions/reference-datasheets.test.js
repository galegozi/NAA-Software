import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_COSMOS = 'true';

const { referenceDatasheetsHandler } = await import('./reference-datasheets.js');

function request(method, { principal, body } = {}) {
	const headers = new Headers();
	if (principal) {
		headers.set(
			'x-ms-client-principal',
			Buffer.from(JSON.stringify(principal), 'utf8').toString('base64')
		);
	}
	return { method, headers, json: async () => body };
}

const context = { error() {}, log() {} };

test('GET /api/reference-datasheets is public (no principal)', async () => {
	const response = await referenceDatasheetsHandler(request('GET'), context);
	assert.equal(response.status, 200);
	assert.ok(Array.isArray(response.jsonBody.items));
});

test('POST /api/reference-datasheets without a principal is rejected', async () => {
	const response = await referenceDatasheetsHandler(request('POST', { body: {} }), context);
	assert.equal(response.status, 401);
});

test('POST /api/reference-datasheets with the writer role is accepted', async () => {
	const response = await referenceDatasheetsHandler(
		request('POST', {
			principal: { userId: 'w', userRoles: ['authenticated', 'isotope_writer'] },
			body: {
				sampleName: 'SRM 1633c',
				entries: [{ label: 'Gold', concentration: 8, uncertainty: 0.1, unit: 'ppm' }]
			}
		}),
		context
	);
	assert.equal(response.status, 201);
	assert.equal(response.jsonBody.created, true);
});
