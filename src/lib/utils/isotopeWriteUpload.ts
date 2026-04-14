import type { HalfLife } from '$lib/types.js';

import { lookupElementName, normalizeElementSymbol } from './elementNames.js';

const HALF_LIFE_UNIT_ALIASES: Record<string, HalfLife['unit']> = {
	s: 'seconds',
	sec: 'seconds',
	secs: 'seconds',
	second: 'seconds',
	seconds: 'seconds',
	m: 'minutes',
	min: 'minutes',
	mins: 'minutes',
	minute: 'minutes',
	minutes: 'minutes',
	h: 'hours',
	hr: 'hours',
	hrs: 'hours',
	hour: 'hours',
	hours: 'hours',
	d: 'days',
	day: 'days',
	days: 'days',
	w: 'weeks',
	wk: 'weeks',
	wks: 'weeks',
	week: 'weeks',
	weeks: 'weeks',
	y: 'years',
	yr: 'years',
	yrs: 'years',
	year: 'years',
	years: 'years'
};

export interface ParsedIsotopeUploadRow {
	lineNumber: number;
	raw: string;
	elementName: string;
	shortName: string;
	massNumber: number;
	suffix: string;
	variantCode: string;
	halfLife: number;
	unit: HalfLife['unit'];
	energy: number;
}

export interface ParsedIsotopeUploadItem {
	elementName: string;
	shortName: string;
	massNumber: number;
	suffix: string;
	energies: number[];
	halfLife: {
		number: number;
		unit: HalfLife['unit'];
	};
	lineNumbers: number[];
	variantLetters: string[];
}

export interface ParsedIsotopeUploadResult {
	rows: ParsedIsotopeUploadRow[];
	items: ParsedIsotopeUploadItem[];
	ignoredVariantCount: number;
	sourceLineCount: number;
}

function normalizeUploadUnit(value: string): HalfLife['unit'] | null {
	return HALF_LIFE_UNIT_ALIASES[value.trim().toLowerCase()] ?? null;
}

function compareNumbers(left: number, right: number): number {
	return left - right;
}

function getContiguousVariantCodes(rows: ParsedIsotopeUploadRow[]): Set<string> {
	const suffixCodes = new Set(
		rows
			.map((row) => row.variantCode)
			.filter((variantCode) => variantCode.length === 1 && /^[A-Z]$/u.test(variantCode))
	);

	const contiguousCodes = new Set<string>();
	for (let code = 65; code <= 90; code += 1) {
		const letter = String.fromCharCode(code);
		if (!suffixCodes.has(letter)) {
			break;
		}

		contiguousCodes.add(letter);
	}

	return contiguousCodes;
}

export function parseIsotopeWriteUpload(text: string): ParsedIsotopeUploadResult {
	const sourceLines = text
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (sourceLines.length === 0) {
		throw new Error('The selected file does not contain any isotope rows.');
	}

	const rows: ParsedIsotopeUploadRow[] = [];

	for (const [index, rawLine] of sourceLines.entries()) {
		const lineNumber = index + 1;
		const parts = rawLine.split(/\s+/u);

		if (parts.length !== 4) {
			throw new Error(
				`Line ${lineNumber} must contain exactly 4 fields: SYMBOL-MASS[LETTER] UNIT HALF_LIFE ENERGY.`
			);
		}

		const isotopeMatch = parts[0].match(/^([A-Za-z]{1,3})-(\d{1,3})([A-Za-z]?)$/u);
		if (!isotopeMatch) {
			throw new Error(
				`Line ${lineNumber} has an invalid isotope token '${parts[0]}'. Expected format like Cd-115B.`
			);
		}

		const shortName = normalizeElementSymbol(isotopeMatch[1]);
		const massNumber = Number.parseInt(isotopeMatch[2], 10);
		const suffix = isotopeMatch[3].toLowerCase();
		const variantCode = isotopeMatch[3].toUpperCase();
		const elementName = lookupElementName(shortName);

		if (!elementName) {
			throw new Error(
				`Line ${lineNumber} uses unknown element symbol '${shortName}', so the full element name cannot be inferred.`
			);
		}

		const unit = normalizeUploadUnit(parts[1]);
		if (!unit) {
			throw new Error(
				`Line ${lineNumber} uses unsupported half-life unit '${parts[1]}'. Use seconds, minutes, hours, days, weeks, years, or their short forms.`
			);
		}

		const halfLife = Number(parts[2]);
		const energy = Number(parts[3]);

		if (!Number.isFinite(halfLife) || halfLife <= 0) {
			throw new Error(`Line ${lineNumber} has an invalid half-life value '${parts[2]}'.`);
		}

		if (!Number.isFinite(energy) || energy <= 0) {
			throw new Error(`Line ${lineNumber} has an invalid energy value '${parts[3]}'.`);
		}

		const row: ParsedIsotopeUploadRow = {
			lineNumber,
			raw: rawLine,
			elementName,
			shortName,
			massNumber,
			suffix,
			variantCode,
			halfLife,
			unit,
			energy
		};
		rows.push(row);
	}

	const itemsByKey = new Map<string, ParsedIsotopeUploadItem>();
	let ignoredVariantCount = 0;
	const rowsByBaseKey = new Map<string, ParsedIsotopeUploadRow[]>();

	for (const row of rows) {
		const baseKey = `${row.shortName}-${row.massNumber}`;
		const group = rowsByBaseKey.get(baseKey);
		if (group) {
			group.push(row);
		} else {
			rowsByBaseKey.set(baseKey, [row]);
		}
	}

	for (const groupRows of rowsByBaseKey.values()) {
		const variantCodes = getContiguousVariantCodes(groupRows);

		for (const row of groupRows) {
			const isVariant = row.variantCode !== '' && variantCodes.has(row.variantCode);
			const itemSuffix = isVariant ? '' : row.suffix;
			const itemKey = `${row.shortName}-${row.massNumber}-${itemSuffix}`;

			if (isVariant) {
				ignoredVariantCount += 1;
			}

		const existingItem = itemsByKey.get(itemKey);

		if (!existingItem) {
			itemsByKey.set(itemKey, {
				elementName: row.elementName,
				shortName: row.shortName,
				massNumber: row.massNumber,
				suffix: itemSuffix,
				energies: [row.energy],
				halfLife: {
					number: row.halfLife,
					unit: row.unit
				},
				lineNumbers: [row.lineNumber],
				variantLetters: isVariant ? [row.variantCode] : []
			});
			continue;
		}

		existingItem.lineNumbers.push(row.lineNumber);
		if (isVariant) {
			existingItem.variantLetters.push(row.variantCode);
		}

		if (
			existingItem.halfLife.unit !== row.unit ||
			Math.abs(existingItem.halfLife.number - row.halfLife) > 1e-9
		) {
			throw new Error(
				`Line ${row.lineNumber} conflicts with earlier rows for ${row.shortName}-${row.massNumber}${itemSuffix ? itemSuffix : ''}. Uploaded variants for the same isotope must use the same half-life value and unit.`
			);
		}

		if (!existingItem.energies.includes(row.energy)) {
			existingItem.energies = [...existingItem.energies, row.energy].sort(compareNumbers);
		}
		}
	}

	return {
		rows,
		items: [...itemsByKey.values()].sort((left, right) => {
			if (left.shortName === right.shortName) {
				return left.massNumber - right.massNumber;
			}

			return left.shortName.localeCompare(right.shortName);
		}),
		ignoredVariantCount,
		sourceLineCount: sourceLines.length
	};
}