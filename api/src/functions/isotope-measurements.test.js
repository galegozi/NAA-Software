import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_COSMOS = 'true';

const { isotopeMeasurementsHandler } = await import('./isotope-measurements.js');

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

test('GET /api/isotope-measurements is public (no principal)', async () => {
	const response = await isotopeMeasurementsHandler(request('GET'), context);
	assert.equal(response.status, 200);
	assert.deepEqual(response.jsonBody.items, []);
});

test('POST /api/isotope-measurements without a principal is rejected', async () => {
	const response = await isotopeMeasurementsHandler(request('POST', { body: {} }), context);
	assert.equal(response.status, 401);
});

test('POST /api/isotope-measurements without the writer role is rejected', async () => {
	const response = await isotopeMeasurementsHandler(
		request('POST', { principal: { userId: 'u', userRoles: ['authenticated'] }, body: {} }),
		context
	);
	assert.equal(response.status, 403);
});

test('POST /api/isotope-measurements with the writer role is accepted', async () => {
	const response = await isotopeMeasurementsHandler(
		request('POST', {
			principal: { userId: 'w', userRoles: ['authenticated', 'isotope_writer'] },
			body: { measuredIsotope: { isotopeId: 'np-239' }, targetIsotope: { isotopeId: 'u-238' } }
		}),
		context
	);
	assert.equal(response.status, 201);
	assert.equal(response.jsonBody.created, true);
});
