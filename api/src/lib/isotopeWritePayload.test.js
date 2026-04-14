import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeIsotopeWrite, normalizeIsotopeWritePayload } from './isotopeWritePayload.js';

const principal = {
	userId: 'writer-123',
	userDetails: 'writer@example.com',
	identityProvider: 'aad'
};

test('normalizeIsotopeWritePayload normalizes a valid isotope document', () => {
	const document = normalizeIsotopeWritePayload(
		{
			elementName: 'Cobalt',
			shortName: 'Co',
			massNumber: '60',
			suffix: 'm',
			energies: [1173.2, 1332.5, 1173.2],
			halfLife: {
				number: 5.2714,
				unit: 'years'
			}
		},
		principal
	);

	assert.match(document.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	assert.deepEqual(document.energies, [1173.2, 1332.5]);
	assert.equal(document.halfLifeUnit, 'years');
	assert.equal(document.createdBy, 'writer-123');
	assert.ok(document.halfLifeSeconds > 0);
});

test('normalizeIsotopeWritePayload rejects invalid half-life units', () => {
	assert.throws(
		() =>
			normalizeIsotopeWritePayload(
				{
					elementName: 'Cobalt',
					shortName: 'Co',
					massNumber: 60,
					halfLife: {
						number: 5.2714,
						unit: 'fortnights'
					}
				},
				principal
			),
		/unit/i
	);
});
test('mergeIsotopeWrite appends unique energies to an existing isotope', () => {
	const merged = mergeIsotopeWrite(
		{
			id: 'existing-guid',
			elementName: 'Cobalt',
			shortName: 'Co',
			massNumber: 60,
			suffix: 'm',
			energies: [1173.2],
			halfLife: 5.2714,
			halfLifeUnit: 'years',
			halfLifeSeconds: 166315280.64,
			createdAt: '2026-01-01T00:00:00.000Z',
			createdBy: 'writer-123'
		},
		{
			id: 'new-guid',
			elementName: 'Cobalt',
			shortName: 'Co',
			massNumber: 60,
			suffix: 'm',
			energies: [1173.2, 1332.5],
			halfLife: 5.2714,
			halfLifeUnit: 'years',
			halfLifeSeconds: 166315280.64
		},
		principal
	);

	assert.equal(merged.id, 'existing-guid');
	assert.deepEqual(merged.energies, [1173.2, 1332.5]);
	assert.equal(merged.updatedBy, 'writer-123');
	assert.ok(merged.updatedAt);
});