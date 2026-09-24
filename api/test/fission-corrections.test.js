import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_COSMOS = 'true';

const { fissionCorrectionsHandler } = await import('../src/functions/fission-corrections.js');

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
const validBody = {
	fissileNuclide: 'U-235',
	interferingIsotope: 'La-140',
	gammaEnergyKev: 1596.2,
	irradiationType: 'thermal',
	correctionFactor: 0.0123
};

test('GET /api/fission-corrections is public', async () => {
	const response = await fissionCorrectionsHandler(request('GET'), context);
	assert.equal(response.status, 200);
	assert.deepEqual(response.jsonBody.items, []);
});

test('DELETE /api/fission-corrections is rejected with 405', async () => {
	const response = await fissionCorrectionsHandler(request('DELETE'), context);
	assert.equal(response.status, 405);
});

test('POST /api/fission-corrections without a principal is rejected', async () => {
	const response = await fissionCorrectionsHandler(request('POST', { body: validBody }), context);
	assert.equal(response.status, 401);
});

test('POST /api/fission-corrections without the writer role is rejected', async () => {
	const response = await fissionCorrectionsHandler(
		request('POST', {
			principal: { userId: 'u', userRoles: ['authenticated'] },
			body: validBody
		}),
		context
	);
	assert.equal(response.status, 403);
});

test('POST /api/fission-corrections with the writer role is accepted', async () => {
	const response = await fissionCorrectionsHandler(
		request('POST', {
			principal: { userId: 'w', userRoles: ['authenticated', 'isotope_writer'] },
			body: validBody
		}),
		context
	);
	assert.equal(response.status, 201);
	assert.equal(response.jsonBody.created, true);
	assert.equal(response.jsonBody.item.fissileNuclide, 'U-235');
});

test('POST /api/fission-corrections rejects an invalid payload with 400', async () => {
	const response = await fissionCorrectionsHandler(
		request('POST', {
			principal: { userId: 'w', userRoles: ['authenticated', 'isotope_writer'] },
			body: { interferingIsotope: 'La-140' }
		}),
		context
	);
	assert.equal(response.status, 400);
});
