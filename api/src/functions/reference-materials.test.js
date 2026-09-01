import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_COSMOS = 'true';

const { referenceMaterialsHandler } = await import('./reference-materials.js');

function request(method, { principal, body, url = 'https://x/api/reference-materials' } = {}) {
	const headers = new Headers();
	if (principal) {
		headers.set(
			'x-ms-client-principal',
			Buffer.from(JSON.stringify(principal), 'utf8').toString('base64')
		);
	}
	return { method, url, headers, json: async () => body };
}

const context = { log() {}, warn() {}, error() {} };

test('GET /api/reference-materials is public', async () => {
	const response = await referenceMaterialsHandler(request('GET'), context);
	assert.equal(response.status, 200);
	assert.ok(Array.isArray(response.jsonBody.items));
});

test('DELETE /api/reference-materials is rejected with 405', async () => {
	const response = await referenceMaterialsHandler(request('DELETE'), context);
	assert.equal(response.status, 405);
});

test('POST /api/reference-materials without a principal is rejected', async () => {
	const response = await referenceMaterialsHandler(request('POST', { body: {} }), context);
	assert.equal(response.status, 401);
});

test('POST /api/reference-materials without the writer role is rejected', async () => {
	const response = await referenceMaterialsHandler(
		request('POST', { principal: { userId: 'u', userRoles: ['authenticated'] }, body: {} }),
		context
	);
	assert.equal(response.status, 403);
});
