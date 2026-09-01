import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_COSMOS = 'true';

const { isotopesHandler, buildSearchQuery } = await import('./isotopes.js');

function request(method, { principal, body, url = 'https://x/api/isotopes' } = {}) {
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

test('GET /api/isotopes is public', async () => {
	const response = await isotopesHandler(request('GET'), context);
	assert.equal(response.status, 200);
	assert.ok(Array.isArray(response.jsonBody.items));
});

test('PUT /api/isotopes is rejected with 405', async () => {
	const response = await isotopesHandler(request('PUT'), context);
	assert.equal(response.status, 405);
});

test('POST /api/isotopes without a principal is rejected', async () => {
	const response = await isotopesHandler(request('POST', { body: {} }), context);
	assert.equal(response.status, 401);
});

test('POST /api/isotopes without the writer role is rejected', async () => {
	const response = await isotopesHandler(
		request('POST', { principal: { userId: 'u', userRoles: ['authenticated'] }, body: {} }),
		context
	);
	assert.equal(response.status, 403);
});

test('buildSearchQuery uses SELECT TOP and never OFFSET (Cosmos rejects OFFSET without ORDER BY)', () => {
	const browse = buildSearchQuery('', '1000');
	assert.match(browse.query, /^\s*SELECT TOP \d+ \* FROM c\s*$/);
	assert.doesNotMatch(browse.query, /OFFSET/i);
	assert.doesNotMatch(browse.query, /ORDER BY/i);

	const search = buildSearchQuery('gold', '25');
	assert.match(search.query, /^\s*SELECT TOP \d+ \* FROM c WHERE /);
	assert.doesNotMatch(search.query, /OFFSET/i);
});
