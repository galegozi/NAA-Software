import { createHash, randomUUID } from 'node:crypto';

const ALLOWED_DT_TYPES = new Set(['short', 'simple', 'mixed']);
const ALLOWED_IRRADIATION_TYPES = new Set(['gated', 'total']);
const ALLOWED_CONCENTRATION_UNITS = new Set(['percentage', 'ppm']);

function toTrimmedString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function requireString(value, fieldName, maxLength = 200) {
	const normalized = toTrimmedString(value);
	if (!normalized) {
		throw new Error(`'${fieldName}' is required.`);
	}

	if (normalized.length > maxLength) {
		throw new Error(`'${fieldName}' must be ${maxLength} characters or fewer.`);
	}

	return normalized;
}

function normalizeFiniteNumber(value, fieldName, { min = -Infinity, max = Infinity } = {}) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
		throw new Error(`'${fieldName}' must be a finite number between ${min} and ${max}.`);
	}
	return parsed;
}

function normalizeIsotopeSelection(payload, index) {
	if (typeof payload === 'string') {
		return {
			isotopeId: requireString(payload, `isotopes[${index}]`, 200),
			energy: null
		};
	}

	if (typeof payload === 'object' && payload !== null) {
		const isotopeId = requireString(
			payload.isotopeId ?? payload.id,
			`isotopes[${index}].isotopeId`,
			200
		);

		const hasEnergy = payload.energy !== undefined && payload.energy !== null;
		const energy = hasEnergy
			? normalizeFiniteNumber(payload.energy, `isotopes[${index}].energy`, { min: 0 })
			: null;

		return {
			isotopeId,
			energy
		};
	}

	throw new Error(`'isotopes[${index}]' must be an isotope selection object or ID string.`);
}

function normalizeCountData(payload, fieldPrefix) {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error(`'${fieldPrefix}' must be an object.`);
	}

	return {
		grossCounts: normalizeFiniteNumber(payload.grossCounts, `${fieldPrefix}.grossCounts`, { min: 0 }),
		netCounts: normalizeFiniteNumber(payload.netCounts, `${fieldPrefix}.netCounts`, { min: 0 }),
		uncertainty: normalizeFiniteNumber(payload.uncertainty, `${fieldPrefix}.uncertainty`, { min: 0 }),
		grossCountsPositionalCorrectionFactor: normalizeFiniteNumber(
			payload.grossCountsPositionalCorrectionFactor,
			`${fieldPrefix}.grossCountsPositionalCorrectionFactor`,
			{ min: 0 }
		),
		netCountsPositionalCorrectionFactor: normalizeFiniteNumber(
			payload.netCountsPositionalCorrectionFactor,
			`${fieldPrefix}.netCountsPositionalCorrectionFactor`,
			{ min: 0 }
		),
		uncertaintyPositionalCorrectionFactor: normalizeFiniteNumber(
			payload.uncertaintyPositionalCorrectionFactor,
			`${fieldPrefix}.uncertaintyPositionalCorrectionFactor`,
			{ min: 0 }
		)
	};
}

function normalizeOptionalDateTime(value, fieldName) {
	const normalized = toTrimmedString(value);
	if (!normalized) {
		return '';
	}

	const parsed = new Date(normalized);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`'${fieldName}' must be a valid datetime string.`);
	}

	return normalized;
}

function parseDateTimeInput(value) {
	const trimmed = toTrimmedString(value);
	if (!trimmed) {
		return null;
	}

	const localMatch = trimmed.match(
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/
	);

	if (localMatch) {
		const year = Number(localMatch[1]);
		const month = Number(localMatch[2]);
		const day = Number(localMatch[3]);
		const hour = Number(localMatch[4]);
		const minute = Number(localMatch[5]);
		const second = Number(localMatch[6] ?? '0');
		const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	const parsed = new Date(trimmed);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTimeLocal(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeMaterialTiming(material) {
	let measurementStartDate = parseDateTimeInput(material.measurementStartTime);
	let irradiationEndDate = parseDateTimeInput(material.irradiationEnd);
	let decayTime = material.decayTime;

	if (measurementStartDate && irradiationEndDate) {
		decayTime = (measurementStartDate.getTime() - irradiationEndDate.getTime()) / 1000;
	} else if (measurementStartDate && Number.isFinite(decayTime)) {
		irradiationEndDate = new Date(measurementStartDate.getTime() - decayTime * 1000);
	} else if (irradiationEndDate && Number.isFinite(decayTime)) {
		measurementStartDate = new Date(irradiationEndDate.getTime() + decayTime * 1000);
	}

	const irradiationStartDate =
		irradiationEndDate && Number.isFinite(material.irradiationTime)
			? new Date(irradiationEndDate.getTime() - material.irradiationTime * 1000)
			: null;

	return {
		measurementStartTime: measurementStartDate ? formatDateTimeLocal(measurementStartDate) : '',
		measurementStartEpochMs: measurementStartDate ? measurementStartDate.getTime() : null,
		irradiationEnd: irradiationEndDate ? formatDateTimeLocal(irradiationEndDate) : '',
		irradiationEndEpochMs: irradiationEndDate ? irradiationEndDate.getTime() : null,
		irradiationStartTime: irradiationStartDate ? formatDateTimeLocal(irradiationStartDate) : '',
		irradiationStartEpochMs: irradiationStartDate ? irradiationStartDate.getTime() : null,
		decayTime
	};
}

function normalizeReferenceMaterial(payload, isotopeCount, fieldPrefix) {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error(`'${fieldPrefix}' must be an object.`);
	}

	const referenceDatasheetId = requireString(
		payload.referenceDatasheetId,
		`${fieldPrefix}.referenceDatasheetId`,
		128
	);

	if (!Array.isArray(payload.counts) || payload.counts.length !== isotopeCount) {
		throw new Error(`'${fieldPrefix}.counts' must include exactly ${isotopeCount} isotope rows.`);
	}

	const dtType = toTrimmedString(payload.dtType);
	if (dtType && !ALLOWED_DT_TYPES.has(dtType)) {
		throw new Error(`'${fieldPrefix}.dtType' must be one of: short, simple, mixed.`);
	}

	const irradiationType = toTrimmedString(payload.irradiationType) || 'total';
	if (!ALLOWED_IRRADIATION_TYPES.has(irradiationType)) {
		throw new Error(`'${fieldPrefix}.irradiationType' must be one of: gated, total.`);
	}

	const normalizedMaterial = {
		NETL_code: requireString(payload.NETL_code, `${fieldPrefix}.NETL_code`, 64),
		sampleName: requireString(payload.sampleName, `${fieldPrefix}.sampleName`, 120),
		referenceDatasheetId,
		mass: normalizeFiniteNumber(payload.mass, `${fieldPrefix}.mass`, { min: 0 }),
		reactorPower: normalizeFiniteNumber(payload.reactorPower, `${fieldPrefix}.reactorPower`),
		irradiationTime: normalizeFiniteNumber(payload.irradiationTime, `${fieldPrefix}.irradiationTime`, {
			min: 0
		}),
		irradiationEnd: normalizeOptionalDateTime(payload.irradiationEnd, `${fieldPrefix}.irradiationEnd`),
		measurementStartTime: normalizeOptionalDateTime(
			payload.measurementStartTime,
			`${fieldPrefix}.measurementStartTime`
		),
		decayTime: normalizeFiniteNumber(payload.decayTime, `${fieldPrefix}.decayTime`),
		liveTime: normalizeFiniteNumber(payload.liveTime, `${fieldPrefix}.liveTime`, { min: 0 }),
		realTime: normalizeFiniteNumber(payload.realTime, `${fieldPrefix}.realTime`, { min: 0 }),
		fluence: normalizeFiniteNumber(payload.fluence, `${fieldPrefix}.fluence`, { min: 0 }),
		counts: payload.counts.map((countData, index) =>
			normalizeCountData(countData, `${fieldPrefix}.counts[${index}]`)
		),
		irradiationType,
		dtType: dtType || undefined,
		knownConcentration: Array.from({ length: isotopeCount }, (_, i) => {
			const val = Array.isArray(payload.knownConcentration) ? payload.knownConcentration[i] : undefined;
			const n = Number(val);
			return Number.isFinite(n) && n >= 0 ? n : 0;
		}),
		knownUncertainty: Array.from({ length: isotopeCount }, (_, i) => {
			const val = Array.isArray(payload.knownUncertainty) ? payload.knownUncertainty[i] : undefined;
			const n = Number(val);
			return Number.isFinite(n) && n >= 0 ? n : 0;
		}),
		concentrationUnits: Array.from({ length: isotopeCount }, (_, i) => {
			const val = Array.isArray(payload.concentrationUnits) ? toTrimmedString(payload.concentrationUnits[i]) : '';
			return ALLOWED_CONCENTRATION_UNITS.has(val) ? val : undefined;
		})
	};

	const timing = normalizeMaterialTiming(normalizedMaterial);

	return {
		...normalizedMaterial,
		measurementStartTime: timing.measurementStartTime,
		measurementStartEpochMs: timing.measurementStartEpochMs,
		irradiationEnd: timing.irradiationEnd,
		irradiationEndEpochMs: timing.irradiationEndEpochMs,
		irradiationStartTime: timing.irradiationStartTime,
		irradiationStartEpochMs: timing.irradiationStartEpochMs,
		decayTime: timing.decayTime
	};
}

function normalizeReferenceKey(value) {
	const normalized = toTrimmedString(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120);

	if (!normalized) {
		return randomUUID();
	}

	return normalized;
}

function arraysEqual(left, right) {
	if (!Array.isArray(left) || !Array.isArray(right)) {
		return false;
	}

	if (left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}

	return true;
}

function isotopeSelectionsEqual(left, right) {
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		const l = left[index];
		const r = right[index];
		if (
			l?.isotopeId !== r?.isotopeId ||
			l?.energy !== r?.energy
		) {
			return false;
		}
	}

	return true;
}

function isotopesEqual(left, right) {
	return isotopeSelectionsEqual(left, right);
}

function countsEqual(leftCounts, rightCounts) {
	if (!Array.isArray(leftCounts) || !Array.isArray(rightCounts) || leftCounts.length !== rightCounts.length) {
		return false;
	}

	for (let index = 0; index < leftCounts.length; index += 1) {
		const left = leftCounts[index];
		const right = rightCounts[index];
		if (
			left?.grossCounts !== right?.grossCounts ||
			left?.netCounts !== right?.netCounts ||
			left?.uncertainty !== right?.uncertainty ||
			left?.grossCountsPositionalCorrectionFactor !== right?.grossCountsPositionalCorrectionFactor ||
			left?.netCountsPositionalCorrectionFactor !== right?.netCountsPositionalCorrectionFactor ||
			left?.uncertaintyPositionalCorrectionFactor !== right?.uncertaintyPositionalCorrectionFactor
		) {
			return false;
		}
	}

	return true;
}

function referenceMaterialEqual(left, right, { includeCounts = true } = {}) {
	if (!left || !right) {
		return false;
	}

	const baseMatches =
		left.NETL_code === right.NETL_code &&
		left.sampleName === right.sampleName &&
		left.referenceDatasheetId === right.referenceDatasheetId &&
		left.mass === right.mass &&
		left.reactorPower === right.reactorPower &&
		left.irradiationTime === right.irradiationTime &&
		left.irradiationStartTime === right.irradiationStartTime &&
		left.irradiationEnd === right.irradiationEnd &&
		left.measurementStartTime === right.measurementStartTime &&
		left.decayTime === right.decayTime &&
		left.liveTime === right.liveTime &&
		left.realTime === right.realTime &&
		left.fluence === right.fluence &&
		left.irradiationType === right.irradiationType &&
		left.dtType === right.dtType;

	if (!baseMatches) {
		return false;
	}

	if (!includeCounts) {
		return true;
	}

	return countsEqual(left.counts, right.counts);
}

function buildReferenceIdentityMaterial(material, isotopes) {
	return {
		netlCode: material.NETL_code,
		sampleName: material.sampleName,
		referenceDatasheetId: material.referenceDatasheetId,
		mass: material.mass,
		reactorPower: material.reactorPower,
		irradiationTime: material.irradiationTime,
		irradiationStartTime: material.irradiationStartTime,
		irradiationEnd: material.irradiationEnd,
		measurementStartTime: material.measurementStartTime,
		decayTime: material.decayTime,
		liveTime: material.liveTime,
		realTime: material.realTime,
		fluence: material.fluence,
		dtType: material.dtType || '',
		isotopes
	};
}

function buildReferenceIdentityKey(material, isotopes) {
	const identity = buildReferenceIdentityMaterial(material, isotopes);
	const digest = createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 40);
	return `rm-${digest}`;
}

export function normalizeReferenceMaterialWritePayload(payload, principal) {
	if (typeof payload !== 'object' || payload === null) {
		throw new Error('Request body must be a JSON object.');
	}

	if (!Array.isArray(payload.isotopes) || payload.isotopes.length === 0) {
		throw new Error("'isotopes' must be a non-empty array.");
	}

	if (!Array.isArray(payload.countings) || payload.countings.length === 0) {
		throw new Error("'countings' must be a non-empty array.");
	}

	const isotopes = payload.isotopes.map((isotope, index) =>
		normalizeIsotopeSelection(isotope, index)
	);
	const isotopeCount = isotopes.length;
	const normalizedCountings = payload.countings.map((entry, index) => {
		if (typeof entry !== 'object' || entry === null) {
			throw new Error(`'countings[${index}]' must be an object.`);
		}

		const countingLabel = toTrimmedString(entry.countingLabel) || `Counting ${index + 1}`;
		if (countingLabel.length > 120) {
			throw new Error(`'countings[${index}].countingLabel' must be 120 characters or fewer.`);
		}

		const referenceMaterial = normalizeReferenceMaterial(
			entry.referenceMaterial,
			isotopeCount,
			`countings[${index}].referenceMaterial`
		);

		return {
			countingId: randomUUID(),
			countingLabel,
			referenceMaterial,
			identityKey: buildReferenceIdentityKey(referenceMaterial, isotopes),
			createdAt: new Date().toISOString(),
			createdBy: principal?.userId || principal?.userDetails || 'unknown'
		};
	});

	const referenceKey = normalizedCountings[0].identityKey;
	const hasMixedIdentity = normalizedCountings.some((counting) => counting.identityKey !== referenceKey);
	if (hasMixedIdentity) {
		throw new Error(
			"All submitted countings must represent the same material metadata and isotope set. Submit different materials separately."
		);
	}
	const now = new Date().toISOString();

	return {
		id: randomUUID(),
		docType: 'reference-material',
		referenceKey,
		isotopes,
		countings: normalizedCountings.map((counting) => ({
			countingId: counting.countingId,
			countingLabel: counting.countingLabel,
			referenceMaterial: counting.referenceMaterial,
			createdAt: counting.createdAt,
			createdBy: counting.createdBy
		})),
		notes: toTrimmedString(payload.notes).slice(0, 1000),
		createdAt: now,
		createdBy: principal?.userId || principal?.userDetails || 'unknown',
		createdByDetails: principal?.userDetails || '',
		createdByIdentityProvider: principal?.identityProvider || ''
	};
}

export function mergeReferenceMaterialWrite(existingItem, incomingItem, principal) {
	const now = new Date().toISOString();
	const existingCountings = Array.isArray(existingItem.countings) ? existingItem.countings : [];
	const incomingCountings = Array.isArray(incomingItem.countings) ? incomingItem.countings : [];
	const acceptedIncomingCountings = incomingCountings.filter((incomingCounting) => {
		return !existingCountings.some((existingCounting) => {
			if (!isotopesEqual(existingItem.isotopes, incomingItem.isotopes)) {
				return false;
			}

			return referenceMaterialEqual(
				existingCounting.referenceMaterial,
				incomingCounting.referenceMaterial,
				{ includeCounts: true }
			);
		});
	});

	return {
		...existingItem,
		docType: 'reference-material',
		referenceKey: normalizeReferenceKey(existingItem.referenceKey || incomingItem.referenceKey),
		isotopes: incomingItem.isotopes,
		countings: [...existingCountings, ...acceptedIncomingCountings],
		notes: incomingItem.notes || existingItem.notes || '',
		updatedAt: now,
		updatedBy: principal?.userId || principal?.userDetails || 'unknown',
		updatedByDetails: principal?.userDetails || '',
		updatedByIdentityProvider: principal?.identityProvider || ''
	};
}
