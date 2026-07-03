function toTrimmedString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeLabel(value) {
	return toTrimmedString(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function uniqueNormalizedLabels(labels) {
	const normalized = labels.map(normalizeLabel).filter(Boolean);
	return normalized.filter((label, index) => normalized.indexOf(label) === index);
}

function buildDatasheetEntryMap(entries) {
	const entryMap = new Map();

	for (const entry of Array.isArray(entries) ? entries : []) {
		const key = normalizeLabel(entry?.label);
		if (!key || entryMap.has(key)) {
			continue;
		}

		entryMap.set(key, entry);
	}

	return entryMap;
}

function getLinkedIsotopeIds(isotopeId, measurementLinks) {
	const candidateIds = [isotopeId];

	for (const link of Array.isArray(measurementLinks) ? measurementLinks : []) {
		const measuredId = toTrimmedString(link?.measuredIsotope?.isotopeId ?? link?.measuredIsotope?.id);
		const targetId = toTrimmedString(link?.targetIsotope?.isotopeId ?? link?.targetIsotope?.id);

		if (targetId === isotopeId && measuredId && !candidateIds.includes(measuredId)) {
			candidateIds.push(measuredId);
		}

		if (measuredId === isotopeId && targetId && !candidateIds.includes(targetId)) {
			candidateIds.push(targetId);
		}
	}

	return candidateIds;
}

function getCatalogLabelCandidates(catalogItem) {
	if (!catalogItem) {
		return [];
	}

	const shortName = toTrimmedString(catalogItem.shortName);

	return uniqueNormalizedLabels([
		catalogItem.elementName,
		shortName
	]);
}

function enrichReferenceMaterial(referenceMaterial, isotopeSelections, lookups) {
	const datasheetId = toTrimmedString(referenceMaterial?.referenceDatasheetId);
	if (!datasheetId) {
		return referenceMaterial;
	}

	const datasheet = lookups.datasheetsById?.[datasheetId];
	if (!datasheet) {
		return referenceMaterial;
	}

	const entryMap = buildDatasheetEntryMap(datasheet.entries);
	if (entryMap.size === 0) {
		return referenceMaterial;
	}

	const isotopeCount = Array.isArray(isotopeSelections) ? isotopeSelections.length : 0;
	const nextConcentration = Array.from({ length: isotopeCount }, (_, index) =>
		Array.isArray(referenceMaterial?.knownConcentration)
			? referenceMaterial.knownConcentration[index] ?? 0
			: 0
	);
	const nextUncertainty = Array.from({ length: isotopeCount }, (_, index) =>
		Array.isArray(referenceMaterial?.knownUncertainty)
			? referenceMaterial.knownUncertainty[index] ?? 0
			: 0
	);
	const nextUnits = Array.from({ length: isotopeCount }, (_, index) =>
		Array.isArray(referenceMaterial?.concentrationUnits)
			? referenceMaterial.concentrationUnits[index]
			: undefined
	);

	let changed = false;

	for (let index = 0; index < isotopeCount; index += 1) {
		const isotopeId = toTrimmedString(isotopeSelections[index]?.isotopeId);
		if (!isotopeId) {
			continue;
		}

		const hasConcentration = Number.isFinite(nextConcentration[index]) && nextConcentration[index] > 0;
		const hasUncertainty = Number.isFinite(nextUncertainty[index]) && nextUncertainty[index] > 0;
		const hasUnit = typeof nextUnits[index] === 'string' && nextUnits[index].length > 0;

		if (hasConcentration && hasUncertainty && hasUnit) {
			continue;
		}

		const candidateIds = getLinkedIsotopeIds(isotopeId, lookups.measurementLinks);
		let matchedEntry;

		for (const candidateId of candidateIds) {
			const catalogItem = lookups.isotopeCatalogById?.[candidateId];
			for (const label of getCatalogLabelCandidates(catalogItem)) {
				const entry = entryMap.get(label);
				if (entry) {
					matchedEntry = entry;
					break;
				}
			}

			if (matchedEntry) {
				break;
			}
		}

		if (!matchedEntry) {
			continue;
		}

		nextConcentration[index] = matchedEntry.concentration;
		nextUncertainty[index] = matchedEntry.uncertainty;
		nextUnits[index] = matchedEntry.unit;
		changed = true;
	}

	if (!changed) {
		return referenceMaterial;
	}

	return {
		...referenceMaterial,
		knownConcentration: nextConcentration,
		knownUncertainty: nextUncertainty,
		concentrationUnits: nextUnits
	};
}

export function enrichReferenceMaterialCatalogItems(items, lookups) {
	return (Array.isArray(items) ? items : []).map((item) => {
		const isotopeSelections = Array.isArray(item?.isotopes) ? item.isotopes : [];
		const countings = Array.isArray(item?.countings)
			? item.countings.map((counting) => ({
				...counting,
				referenceMaterial: enrichReferenceMaterial(counting?.referenceMaterial, isotopeSelections, lookups)
			}))
			: [];

		const latestCounting = item?.latestCounting
			? {
				...item.latestCounting,
				referenceMaterial: enrichReferenceMaterial(item.latestCounting.referenceMaterial, isotopeSelections, lookups)
			}
			: null;

		return {
			...item,
			countings,
			latestCounting
		};
	});
}
