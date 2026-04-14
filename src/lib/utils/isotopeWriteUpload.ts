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
	variant: string;
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

export function parseIsotopeWriteUpload(text: string): ParsedIsotopeUploadResult {
	const sourceLines = text
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (sourceLines.length === 0) {
		throw new Error('The selected file does not contain any isotope rows.');
	}

	const rows: ParsedIsotopeUploadRow[] = [];
	const itemsByKey = new Map<string, ParsedIsotopeUploadItem>();
	let ignoredVariantCount = 0;

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
		const variant = isotopeMatch[3].toUpperCase();
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

		if (variant) {
			ignoredVariantCount += 1;
		}

		const row: ParsedIsotopeUploadRow = {
			lineNumber,
			raw: rawLine,
			elementName,
			shortName,
			massNumber,
			variant,
			halfLife,
			unit,
			energy
		};
		rows.push(row);

		const itemKey = `${shortName}-${massNumber}`;
		const existingItem = itemsByKey.get(itemKey);

		if (!existingItem) {
			itemsByKey.set(itemKey, {
				elementName,
				shortName,
				massNumber,
				suffix: '',
				energies: [energy],
				halfLife: {
					number: halfLife,
					unit
				},
				lineNumbers: [lineNumber],
				variantLetters: variant ? [variant] : []
			});
			continue;
		}

		existingItem.lineNumbers.push(lineNumber);
		if (variant) {
			existingItem.variantLetters.push(variant);
		}

		if (
			existingItem.halfLife.unit !== unit ||
			Math.abs(existingItem.halfLife.number - halfLife) > 1e-9
		) {
			throw new Error(
				`Line ${lineNumber} conflicts with earlier rows for ${shortName}-${massNumber}. Uploaded variants for the same isotope must use the same half-life value and unit.`
			);
		}

		if (!existingItem.energies.includes(energy)) {
			existingItem.energies = [...existingItem.energies, energy].sort(compareNumbers);
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