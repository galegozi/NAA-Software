import test from 'node:test';
import assert from 'node:assert/strict';

// NOTE: no `process.env.MOCK_COSMOS = 'true'` here — this file checks the real
// decision logic.
const { shouldUseMockCatalog } = await import('../src/functions/isotopes.js');

const KEYS = [
	'MOCK_COSMOS',
	'COSMOSDB_ENDPOINT',
	'COSMOSDB_KEY',
	'AZURE_FUNCTIONS_ENVIRONMENT',
	'NODE_ENV'
];

function withEnv(overrides, fn) {
	const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) delete process.env[k];
	Object.assign(process.env, overrides);
	try {
		return fn();
	} finally {
		for (const k of KEYS) delete process.env[k];
		for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
	}
}

test('a configured database is always used, even with AZURE_FUNCTIONS_ENVIRONMENT=Development', () => {
	withEnv(
		{
			COSMOSDB_ENDPOINT: 'https://x.documents.azure.com',
			COSMOSDB_KEY: 'secret',
			AZURE_FUNCTIONS_ENVIRONMENT: 'Development'
		},
		() => assert.equal(shouldUseMockCatalog(), false)
	);
});

test('MOCK_COSMOS forces sample data even with a database configured', () => {
	withEnv({ MOCK_COSMOS: 'true', COSMOSDB_ENDPOINT: 'https://x', COSMOSDB_KEY: 'secret' }, () =>
		assert.equal(shouldUseMockCatalog(), true)
	);
});

test('no database configured falls back to sample data', () => {
	withEnv({}, () => assert.equal(shouldUseMockCatalog(), true));
});
