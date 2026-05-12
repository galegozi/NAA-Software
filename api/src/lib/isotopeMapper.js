function toNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return 0;
}

function normalizeHalfLife(halfLife, halfLifeUnit, halfLifeSeconds) {
	const normalizedUnit =
		typeof halfLifeUnit === 'string' && halfLifeUnit.length > 0 ? halfLifeUnit : 'seconds';

	return {
		number: toNumber(halfLife),
		unit: normalizedUnit,
		halfLifeSeconds: toNumber(halfLifeSeconds)
	};
}

export function mapIsotopeItem(item) {
	const energies = Array.isArray(item?.energies)
		? item.energies.map((energy) => toNumber(energy))
		: [];
	const halfLife = normalizeHalfLife(item?.halfLife, item?.halfLifeUnit, item?.halfLifeSeconds);

	return {
		id: String(item?.id ?? item?._id ?? `${item?.shortName ?? 'iso'}-${item?.massNumber ?? '0'}`),
		elementName: String(item?.elementName ?? ''),
		shortName: String(item?.shortName ?? ''),
		massNumber: toNumber(item?.massNumber),
		suffix: String(item?.suffix ?? ''),
		energies,
		halfLife: {
			number: halfLife.number,
			unit: halfLife.unit
		},
		halfLifeSeconds: halfLife.halfLifeSeconds
	};
}