import test from 'node:test';
import assert from 'node:assert/strict';

import { canWriteIsotopes, getRequiredRole } from './staticWebAppsAuth.js';

function createRequest(principal) {
	const encodedPrincipal = Buffer.from(JSON.stringify(principal), 'utf8').toString('base64');

	return {
		headers: new Headers({
			'x-ms-client-principal': encodedPrincipal
		})
	};
}

test('getRequiredRole falls back to isotope_writer', () => {
	const previousRole = process.env.ISOTOPE_WRITE_ROLE;
	delete process.env.ISOTOPE_WRITE_ROLE;

	assert.equal(getRequiredRole(), 'isotope_writer');

	if (previousRole) {
		process.env.ISOTOPE_WRITE_ROLE = previousRole;
	}
});

test('canWriteIsotopes allows principals with the writer role', () => {
	const result = canWriteIsotopes(
		createRequest({
			userId: 'writer-123',
			userDetails: 'writer@example.com',
			identityProvider: 'aad',
			userRoles: ['authenticated', 'isotope_writer']
		})
	);

	assert.equal(result.authorized, true);
	assert.equal(result.principal.userId, 'writer-123');
	});

test('canWriteIsotopes rejects principals without the writer role', () => {
	const result = canWriteIsotopes(
		createRequest({
			userId: 'reader-123',
			userDetails: 'reader@example.com',
			identityProvider: 'aad',
			userRoles: ['authenticated', 'isotope_reader']
		})
	);

	assert.equal(result.authorized, false);
	assert.equal(result.status, 403);
	});

test('canWriteIsotopes rejects missing principals', () => {
	const result = canWriteIsotopes({ headers: new Headers() });

	assert.equal(result.authorized, false);
	assert.equal(result.status, 401);
	});