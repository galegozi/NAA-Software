import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_COSMOS = 'true';

const { isotopesHandler, buildSearchQuery } = await import('../src/functions/isotopes.js');

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

test('buildSearchQuery emits no TOP / OFFSET / ORDER BY (paging is via continuation token)', () => {
	const browse = buildSearchQuery('');
	assert.equal(browse.query.trim(), 'SELECT * FROM c');

	const search = buildSearchQuery('gold');
	assert.match(search.query, /^\s*SELECT \* FROM c WHERE /);

	for (const q of [browse.query, search.query]) {
		assert.doesNotMatch(q, /\bTOP\b/i);
		assert.doesNotMatch(q, /\bOFFSET\b/i);
		assert.doesNotMatch(q, /\bORDER BY\b/i);
	}
});

test('GET /api/isotopes returns a continuation token when there are more pages', async () => {
	const first = await isotopesHandler(
		request('GET', { url: 'https://x/api/isotopes?limit=2' }),
		context
	);
	assert.equal(first.status, 200);
	assert.equal(first.jsonBody.items.length, 2);
	assert.equal(first.jsonBody.hasMore, true);
	assert.equal(typeof first.jsonBody.continuation, 'string');

	const second = await isotopesHandler(
		request('GET', {
			url: `https://x/api/isotopes?limit=2&continuation=${first.jsonBody.continuation}`
		}),
		context
	);
	assert.equal(second.jsonBody.items.length, 1);
	assert.equal(second.jsonBody.hasMore, false);
	assert.equal(second.jsonBody.continuation, null);
});
