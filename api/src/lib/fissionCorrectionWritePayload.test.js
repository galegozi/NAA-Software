import test from 'node:test';
import assert from 'node:assert/strict';

import {
	fissionCorrectionIdentityKey,
	mergeFissionCorrectionWrite,
	normalizeFissionCorrectionPayload
} from './fissionCorrectionWritePayload.js';

const principal = {
	userId: 'writer-123',
	userDetails: 'writer@example.com',
	identityProvider: 'aad'
};

test('normalizeFissionCorrectionPayload normalizes a valid record', () => {
	const doc = normalizeFissionCorrectionPayload(
		{
			fissileNuclide: '  U-235 ',
			interferingIsotope: 'La-140',
			gammaEnergyKev: '1596.2',
			irradiationPosition: 'Rabbit 1',
			irradiationType: 'THERMAL',
			correctionFactor: '0.0123',
			uncertainty: '0.0004',
			notes: 'from a U standard'
		},
		principal
	);

	assert.match(
		doc.id,
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
	);
	assert.equal(doc.docType, 'fission-correction');
	assert.equal(doc.fissileNuclide, 'U-235');
	assert.equal(doc.interferingIsotope, 'La-140');
	assert.equal(doc.gammaEnergyKev, 1596.2);
	assert.equal(doc.irradiationPosition, 'Rabbit 1');
	assert.equal(doc.irradiationType, 'thermal');
	assert.equal(doc.correctionFactor, 0.0123);
	assert.equal(doc.uncertainty, 0.0004);
	assert.equal(doc.notes, 'from a U standard');
	assert.equal(doc.createdBy, 'writer@example.com');
	assert.ok(doc.createdAt);
});

test('normalizeFissionCorrectionPayload applies defaults for optional fields', () => {
	const doc = normalizeFissionCorrectionPayload(
		{ fissileNuclide: 'U-238', interferingIsotope: 'Zr-95', correctionFactor: 2 },
		principal
	);
	assert.equal(doc.gammaEnergyKev, null);
	assert.equal(doc.irradiationPosition, '');
	assert.equal(doc.irradiationType, 'thermal');
	assert.equal(doc.uncertainty, 0);
	assert.equal(doc.notes, '');
});

test('normalizeFissionCorrectionPayload rejects missing required fields', () => {
	assert.throws(
		() => normalizeFissionCorrectionPayload({ interferingIsotope: 'La-140', correctionFactor: 1 }),
		/fissileNuclide/
	);
	assert.throws(
		() =>
			normalizeFissionCorrectionPayload({ fissileNuclide: 'U-235', interferingIsotope: 'La-140' }),
		/correctionFactor/
	);
});

test('normalizeFissionCorrectionPayload rejects a bad irradiation type and non-numeric factor', () => {
	assert.throws(
		() =>
			normalizeFissionCorrectionPayload({
				fissileNuclide: 'U-235',
				interferingIsotope: 'La-140',
				correctionFactor: 1,
				irradiationType: 'lukewarm'
			}),
		/irradiationType/
	);
	assert.throws(
		() =>
			normalizeFissionCorrectionPayload({
				fissileNuclide: 'U-235',
				interferingIsotope: 'La-140',
				correctionFactor: 'lots'
			}),
		/correctionFactor/
	);
});

test('fissionCorrectionIdentityKey ignores case and matches on the relationship tuple', () => {
	const a = fissionCorrectionIdentityKey({
		fissileNuclide: 'U-235',
		interferingIsotope: 'La-140',
		gammaEnergyKev: 1596.2,
		irradiationPosition: 'Rabbit 1',
		irradiationType: 'thermal'
	});
	const b = fissionCorrectionIdentityKey({
		fissileNuclide: 'u-235',
		interferingIsotope: 'la-140',
		gammaEnergyKev: 1596.2,
		irradiationPosition: 'rabbit 1',
		irradiationType: 'THERMAL'
	});
	assert.equal(a, b);
});

test('mergeFissionCorrectionWrite overwrites mutable fields and stamps the editor', () => {
	const existing = {
		id: 'keep-me',
		docType: 'fission-correction',
		fissileNuclide: 'U-235',
		interferingIsotope: 'La-140',
		gammaEnergyKev: 1596.2,
		irradiationPosition: 'Rabbit 1',
		irradiationType: 'thermal',
		correctionFactor: 0.01,
		uncertainty: 0.001,
		notes: 'old',
		createdAt: '2020-01-01T00:00:00.000Z',
		createdBy: 'someone@example.com'
	};
	const incoming = normalizeFissionCorrectionPayload(
		{
			fissileNuclide: 'U-235',
			interferingIsotope: 'La-140',
			gammaEnergyKev: 1596.2,
			irradiationPosition: 'Rabbit 1',
			irradiationType: 'thermal',
			correctionFactor: 0.02,
			uncertainty: 0.002,
			notes: 'new'
		},
		principal
	);

	const merged = mergeFissionCorrectionWrite(existing, incoming, principal);
	assert.equal(merged.id, 'keep-me');
	assert.equal(merged.createdAt, '2020-01-01T00:00:00.000Z');
	assert.equal(merged.correctionFactor, 0.02);
	assert.equal(merged.uncertainty, 0.002);
	assert.equal(merged.notes, 'new');
	assert.equal(merged.updatedBy, 'writer@example.com');
	assert.ok(merged.updatedAt);
});
