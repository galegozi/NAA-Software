import test from 'node:test';
import assert from 'node:assert/strict';

import {
	mergeReferenceMaterialWrite,
	normalizeReferenceMaterialWritePayload
} from './referenceMaterialWritePayload.js';

function buildValidPayload() {
	return {
		referenceKey: 'AB0053::SRM1633c',
		notes: 'first submission',
		isotopes: [
			{
				elementName: 'Cobalt',
				isotopeName: 'Co-60',
				energy: 1173.2,
				halfLife: 5.27,
				unit: 'years'
			}
		],
		countings: [
			{
				countingLabel: 'Initial ROI',
				referenceMaterial: {
					NETL_code: 'AB0053',
					sampleName: 'SRM1633c',
					mass: 0.5,
					irradiationTime: 3600,
					irradiationEnd: '2026-01-11T10:00',
					measurementStartTime: '2026-01-12T12:00',
					decayTime: 93600,
					liveTime: 1800,
					realTime: 1810,
					fluence: 1.2e13,
					irradiationType: 'total',
					counts: [
						{
							grossCounts: 5000,
							netCounts: 4500,
							uncertainty: 67,
							grossCountsPositionalCorrectionFactor: 1,
							netCountsPositionalCorrectionFactor: 1,
							uncertaintyPositionalCorrectionFactor: 1
						}
					],
					dtType: 'simple',
					knownConcentration: [0.12],
					knownUncertainty: [0.006],
					concentrationUnits: ['ppm']
				}
			}
		]
	};
}

test('normalizeReferenceMaterialWritePayload normalizes a valid payload', () => {
	const payload = buildValidPayload();
	const result = normalizeReferenceMaterialWritePayload(payload, { userId: 'writer-1' });

	assert.equal(result.docType, 'reference-material');
	assert.match(result.referenceKey, /^rm-[a-f0-9]{40}$/u);
	assert.equal(result.isotopes.length, 1);
	assert.equal(result.countings.length, 1);
	assert.equal(result.countings[0].referenceMaterial.counts[0].netCounts, 4500);
	assert.equal(result.countings[0].referenceMaterial.irradiationStartTime, '2026-01-11T09:00');
	assert.equal(result.countings[0].referenceMaterial.decayTime, 93600);
	assert.equal(result.countings[0].referenceMaterial.irradiationStartEpochMs !== null, true);
	assert.equal(result.createdBy, 'writer-1');
});

test('normalizeReferenceMaterialWritePayload computes irradiationEnd from measurementStart and decayTime', () => {
	const payload = buildValidPayload();
	payload.countings[0].referenceMaterial.irradiationEnd = '';

	const result = normalizeReferenceMaterialWritePayload(payload, { userId: 'writer-1' });
	const material = result.countings[0].referenceMaterial;

	assert.equal(material.irradiationEnd, '2026-01-11T10:00');
	assert.equal(material.irradiationStartTime, '2026-01-11T09:00');
	assert.equal(material.decayTime, 93600);
});

test('normalizeReferenceMaterialWritePayload computes decayTime from measurementStart and irradiationEnd', () => {
	const payload = buildValidPayload();
	payload.countings[0].referenceMaterial.decayTime = 0;

	const result = normalizeReferenceMaterialWritePayload(payload, { userId: 'writer-1' });
	const material = result.countings[0].referenceMaterial;

	assert.equal(material.decayTime, 93600);
	assert.equal(material.irradiationStartTime, '2026-01-11T09:00');
});

test('normalizeReferenceMaterialWritePayload changes identity when irradiation changes', () => {
	const payloadA = buildValidPayload();
	const payloadB = buildValidPayload();
	payloadB.countings[0].referenceMaterial.irradiationType = 'gated';

	const resultA = normalizeReferenceMaterialWritePayload(payloadA, { userId: 'writer-1' });
	const resultB = normalizeReferenceMaterialWritePayload(payloadB, { userId: 'writer-1' });

	assert.notEqual(resultA.referenceKey, resultB.referenceKey);
});

test('normalizeReferenceMaterialWritePayload rejects mixed irradiation identities in one submission', () => {
	const payload = buildValidPayload();
	payload.countings.push({
		countingLabel: 'Second irradiation',
		referenceMaterial: {
			...payload.countings[0].referenceMaterial,
			irradiationEnd: '2026-02-11T10:00'
		}
	});

	assert.throws(
		() => normalizeReferenceMaterialWritePayload(payload, { userId: 'writer-1' }),
		/same material metadata and irradiation/iu
	);
});

test('normalizeReferenceMaterialWritePayload rejects mismatched isotope/count arrays', () => {
	const payload = buildValidPayload();
	payload.countings[0].referenceMaterial.counts = [];

	assert.throws(
		() => normalizeReferenceMaterialWritePayload(payload, { userId: 'writer-1' }),
		/counts/iu
	);
});

test('mergeReferenceMaterialWrite appends incoming countings', () => {
	const existing = normalizeReferenceMaterialWritePayload(buildValidPayload(), { userId: 'writer-1' });
	const nextPayload = buildValidPayload();
	nextPayload.countings[0].referenceMaterial.counts[0].netCounts = 4300;
	const incoming = normalizeReferenceMaterialWritePayload(nextPayload, { userId: 'writer-2' });
	const merged = mergeReferenceMaterialWrite(existing, incoming, { userId: 'writer-2' });

	assert.equal(merged.countings.length, 2);
	assert.equal(merged.updatedBy, 'writer-2');
});

test('mergeReferenceMaterialWrite skips exact duplicate countings', () => {
	const existing = normalizeReferenceMaterialWritePayload(buildValidPayload(), { userId: 'writer-1' });
	const incoming = normalizeReferenceMaterialWritePayload(buildValidPayload(), { userId: 'writer-2' });
	const merged = mergeReferenceMaterialWrite(existing, incoming, { userId: 'writer-2' });

	assert.equal(merged.countings.length, 1);
});
