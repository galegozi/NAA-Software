import { randomUUID } from 'node:crypto';

/**
 * Payload shape / merge logic for `POST /api/fission-corrections`, kept out of
 * the handler so it can be unit-tested.
 *
 * A fission-correction record captures one interference relationship: a fissile
 * nuclide (e.g. `U-235`) whose fission during irradiation produces a nuclide
 * (e.g. `La-140`) that is also an activation product of another element, plus
 * the empirical factor used to subtract that contribution. Because the effect is
 * neutron-spectrum dependent, the irradiation position and type are part of the
 * record identity.
 */

export const IRRADIATION_TYPES = ['thermal', 'epithermal', 'fast'];
const DOC_TYPE = 'fission-correction';

function toTrimmedString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function requireString(value, fieldName, maxLength) {
	const normalized = toTrimmedString(value);
	if (!normalized) {
		throw new Error(`'${fieldName}' is required.`);
	}
	if (normalized.length > maxLength) {
		throw new Error(`'${fieldName}' must be ${maxLength} characters or fewer.`);
	}
	return normalized;
}

function optionalString(value, fieldName, maxLength) {
	const normalized = toTrimmedString(value);
	if (normalized.length > maxLength) {
		throw new Error(`'${fieldName}' must be ${maxLength} characters or fewer.`);
	}
	return normalized;
}

function requireFiniteNumber(value, fieldName, { min } = {}) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`'${fieldName}' must be a finite number.`);
	}
	if (typeof min === 'number' && parsed < min) {
		throw new Error(`'${fieldName}' must be greater than or equal to ${min}.`);
	}
	return parsed;
}

function optionalFiniteNumber(value, fieldName, { min } = {}) {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	return requireFiniteNumber(value, fieldName, { min });
}

function normalizeIrradiationType(value) {
	const normalized = toTrimmedString(value).toLowerCase() || 'thermal';
	if (!IRRADIATION_TYPES.includes(normalized)) {
		throw new Error(`'irradiationType' must be one of: ${IRRADIATION_TYPES.join(', ')}.`);
	}
	return normalized;
}

/** Identity tuple used to detect an existing record for the same relationship. */
export function fissionCorrectionIdentityKey(record) {
	return [
		toTrimmedString(record.fissileNuclide).toLowerCase(),
		toTrimmedString(record.interferingIsotope).toLowerCase(),
		record.gammaEnergyKev == null ? '' : String(record.gammaEnergyKev),
		toTrimmedString(record.irradiationPosition).toLowerCase(),
		toTrimmedString(record.irradiationType).toLowerCase()
	].join('|');
}

export function normalizeFissionCorrectionPayload(payload, principal) {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error('Request body must be a JSON object.');
	}

	const record = {
		fissileNuclide: requireString(payload.fissileNuclide, 'fissileNuclide', 64),
		interferingIsotope: requireString(payload.interferingIsotope, 'interferingIsotope', 64),
		gammaEnergyKev: optionalFiniteNumber(payload.gammaEnergyKev, 'gammaEnergyKev', { min: 0 }),
		irradiationPosition: optionalString(payload.irradiationPosition, 'irradiationPosition', 120),
		irradiationType: normalizeIrradiationType(payload.irradiationType),
		correctionFactor: requireFiniteNumber(payload.correctionFactor, 'correctionFactor'),
		uncertainty: optionalFiniteNumber(payload.uncertainty, 'uncertainty', { min: 0 }) ?? 0,
		notes: optionalString(payload.notes, 'notes', 1000)
	};

	if (
		record.fissileNuclide.toLowerCase() === record.interferingIsotope.toLowerCase() &&
		record.gammaEnergyKev == null
	) {
		throw new Error('The fissile nuclide and the interfering isotope cannot be identical.');
	}

	return {
		id: randomUUID(),
		docType: DOC_TYPE,
		...record,
		createdAt: new Date().toISOString(),
		createdBy: principal?.userDetails || principal?.userId || 'unknown'
	};
}

/** Overwrite the mutable fields of an existing record with an incoming write. */
export function mergeFissionCorrectionWrite(existingItem, incomingItem, principal) {
	return {
		...existingItem,
		docType: DOC_TYPE,
		fissileNuclide: incomingItem.fissileNuclide,
		interferingIsotope: incomingItem.interferingIsotope,
		gammaEnergyKev: incomingItem.gammaEnergyKev,
		irradiationPosition: incomingItem.irradiationPosition,
		irradiationType: incomingItem.irradiationType,
		correctionFactor: incomingItem.correctionFactor,
		uncertainty: incomingItem.uncertainty,
		notes: incomingItem.notes || existingItem.notes || '',
		updatedAt: new Date().toISOString(),
		updatedBy: principal?.userDetails || principal?.userId || 'unknown'
	};
}
