import { randomUUID } from 'node:crypto';

import { lookupElementName, normalizeElementSymbol } from './elementNames.js';

const HALF_LIFE_UNIT_TO_SECONDS = {
	seconds: 1,
	minutes: 60,
	hours: 60 * 60,
	days: 24 * 60 * 60,
	weeks: 7 * 24 * 60 * 60,
	years: 365.25 * 24 * 60 * 60
};

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

function normalizeOptionalString(value, fieldName, maxLength) {
	const normalized = toTrimmedString(value);
	if (!normalized) {
		return '';
	}

	if (normalized.length > maxLength) {
		throw new Error(`'${fieldName}' must be ${maxLength} characters or fewer.`);
	}

	return normalized;
}

function normalizeMassNumber(value) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 999) {
		throw new Error("'massNumber' must be an integer between 1 and 999.");
	}

	return parsed;
}

function normalizeEnergies(value) {
	if (value == null) {
		return [];
	}

	if (!Array.isArray(value)) {
		throw new Error("'energies' must be an array of numbers.");
	}

	const normalized = [];
	for (const energy of value) {
		const parsed = Number(energy);
		if (!Number.isFinite(parsed) || parsed < 0) {
			throw new Error("Each 'energies' value must be a finite number greater than or equal to 0.");
		}

		normalized.push(parsed);
	}

	return [...new Set(normalized)].sort((left, right) => left - right);
}

function normalizeHalfLife(payload) {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error("'halfLife' is required.");
	}

	const halfLifeNumber = Number(payload.number);
	if (!Number.isFinite(halfLifeNumber) || halfLifeNumber < 0) {
		throw new Error("'halfLife.number' must be a finite number greater than or equal to 0.");
	}

	const unit = toTrimmedString(payload.unit).toLowerCase() || 'seconds';
	const unitMultiplier = HALF_LIFE_UNIT_TO_SECONDS[unit];
	if (!unitMultiplier) {
		throw new Error("'halfLife.unit' must be one of: seconds, minutes, hours, days, weeks, years.");
	}

	return {
		number: halfLifeNumber,
		unit,
		halfLifeSeconds: halfLifeNumber * unitMultiplier
	};
}

function mergeEnergies(existingEnergies, incomingEnergies) {
	const normalized = [
		...(Array.isArray(existingEnergies) ? existingEnergies : []),
		...(Array.isArray(incomingEnergies) ? incomingEnergies : [])
	].map((energy) => Number(energy));

	return [...new Set(normalized.filter((energy) => Number.isFinite(energy) && energy >= 0))].sort(
		(left, right) => left - right
	);
}

/**
 * Combine an incoming isotope write with the existing catalog record.
 *
 * `mode: 'append'` (default) keeps every existing field and only unions in new
 * energies — safe for casual "found another energy line" writes.
 *
 * `mode: 'replace'` treats the incoming document as authoritative: element name,
 * half-life and the full energy list overwrite what is stored. The isotope
 * identity (shortName/massNumber/suffix) and audit-creation fields are always
 * preserved. Used by the wizard's "Update existing" action, which first asks the
 * user to confirm the complete energy list.
 */
export function mergeIsotopeWrite(existingItem, incomingItem, principal, { mode = 'append' } = {}) {
	const updatedAt = new Date().toISOString();
	const replace = mode === 'replace';

	return {
		...existingItem,
		elementName: replace
			? incomingItem.elementName || existingItem.elementName
			: existingItem.elementName || incomingItem.elementName,
		shortName: existingItem.shortName || incomingItem.shortName,
		massNumber: existingItem.massNumber ?? incomingItem.massNumber,
		suffix: existingItem.suffix ?? incomingItem.suffix,
		halfLife: replace ? incomingItem.halfLife : (existingItem.halfLife ?? incomingItem.halfLife),
		halfLifeUnit: replace
			? incomingItem.halfLifeUnit || existingItem.halfLifeUnit
			: existingItem.halfLifeUnit || incomingItem.halfLifeUnit,
		halfLifeSeconds: replace
			? incomingItem.halfLifeSeconds
			: (existingItem.halfLifeSeconds ?? incomingItem.halfLifeSeconds),
		energies: replace
			? mergeEnergies([], incomingItem.energies)
			: mergeEnergies(existingItem.energies, incomingItem.energies),
		updatedAt,
		updatedBy: principal?.userId || principal?.userDetails || 'unknown',
		updatedByDetails: principal?.userDetails || '',
		updatedByIdentityProvider: principal?.identityProvider || ''
	};
}

export function normalizeIsotopeWritePayload(payload, principal) {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error('Request body must be a JSON object.');
	}

	const shortName = normalizeElementSymbol(requireString(payload.shortName, 'shortName', 32));
	const elementName =
		normalizeOptionalString(payload.elementName, 'elementName', 120) ||
		lookupElementName(shortName);
	if (!elementName) {
		throw new Error("'elementName' is required unless it can be inferred from 'shortName'.");
	}
	const massNumber = normalizeMassNumber(payload.massNumber);
	const suffix = normalizeOptionalString(payload.suffix, 'suffix', 32);
	const energies = normalizeEnergies(payload.energies);
	const halfLife = normalizeHalfLife(payload.halfLife);
	const createdAt = new Date().toISOString();

	return {
		id: randomUUID(),
		elementName,
		shortName,
		massNumber,
		suffix,
		energies,
		halfLife: halfLife.number,
		halfLifeUnit: halfLife.unit,
		halfLifeSeconds: halfLife.halfLifeSeconds,
		createdAt,
		createdBy: principal?.userId || principal?.userDetails || 'unknown',
		createdByDetails: principal?.userDetails || '',
		createdByIdentityProvider: principal?.identityProvider || ''
	};
}
