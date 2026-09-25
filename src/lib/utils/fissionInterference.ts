/**
 * Fission-interference correction — matching a selected ("interfering") isotope
 * to the `fission-corrections` catalog table and holding the user's per-isotope
 * choice with the analysis draft.
 *
 * An isotope such as La-140 can also be produced by the in-pile fission of a
 * fissile nuclide (U-235, U-238, Pu-239, Th-232…) present in the sample, so its
 * detector counts carry a contribution that has to be subtracted. The catalog
 * table (populated through `/admin/fission-corrections`) gives an empirical
 * factor per (fissile nuclide, interfering isotope, gamma energy, irradiation
 * position, irradiation type).
 *
 * This module only wires up the *choice* (which factor, or an explicit 0 for
 * "no interference"); the subtraction math is in `fissionResults.ts`.
 */
import type { ConcUnitType, HalfLife, IsotopeInfo } from '$lib/types.js';
import { parseIsotopeName, isotopeIdentityKey } from '$lib/utils/catalogWrite.js';
import { lookupElementSymbol, normalizeElementSymbol } from '$lib/utils/elementNames.js';
import type { FissionCorrectionRecord, IrradiationType } from '$lib/utils/fissionCorrections.js';
import { BUILTIN_FISSION_ROW_PREFIX, isBuiltinFissionRow } from '$lib/utils/landsbergerFission.js';

type IsotopeIdentity = Pick<IsotopeInfo, 'elementName' | 'isotopeName'>;

/** How the user answered the fission-interference prompt for one isotope. */
export type FissionChoiceMode = 'table' | 'manual' | 'none';

export type FissionChoice = {
	/** Normalized isotope identity — see {@link fissionIsotopeKey}. */
	isotopeKey: string;
	/** Chosen correction factor. `0` with mode `'none'` means "no fission interference". */
	factor: number;
	uncertainty: number;
	mode: FissionChoiceMode;
	/** Provenance, when `mode === 'table'`. */
	fissileNuclide?: string;
	gammaEnergyKev?: number | null;
	irradiationPosition?: string;
	irradiationType?: IrradiationType;
	/** Catalog row id the factor came from, when available. */
	sourceRowId?: string;
	/**
	 * La-140 only: whether to use the special Ba-140 → La-140 in-growth
	 * correction (`true`, the default when unset) instead of treating `factor`
	 * as a plain flat number like every other isotope. Ignored for anything
	 * that isn't La-140.
	 */
	useSpecialCorrection?: boolean;
};

/**
 * Hand-entered Ba-140 half-life for the La-140 fission correction's precursor
 * in-growth term, used when it can't be resolved from an analysed Ba-140
 * isotope or the catalog. Held with the draft.
 */
export type FissionBariumHalfLife = { value: number | null; unit: HalfLife['unit'] };

export const DEFAULT_FISSION_BARIUM_HALF_LIFE: FissionBariumHalfLife = {
	value: null,
	unit: 'days'
};

/**
 * Hand-entered fissile-element concentrations for the fission correction, used
 * when the fissile element is not one of the analysed isotopes (so the standard
 * value and the per-unknown value cannot be pulled from the analysis). Held with
 * the draft, keyed by the target (interfering) isotope.
 */
export type FissionManualFissileValue = { value: number | null; uncertainty: number | null };

export type FissionManualEntry = {
	isotopeKey: string;
	/** Unit the concentrations below are entered in (the target isotope's unit). */
	unit: ConcUnitType;
	/** Fissile-element concentration in the standard, `C_fissile^S`. */
	inStandard: number | null;
	/** Fissile-element concentration per unknown material, by index, `C_fissile^U`. */
	inUnknown: FissionManualFissileValue[];
};

export function findManualFissile(
	entries: FissionManualEntry[],
	isotopeKey: string
): FissionManualEntry | null {
	return entries.find((entry) => entry.isotopeKey === isotopeKey) ?? null;
}

/** Add or replace the manual entry for one target isotope. */
export function upsertManualFissile(
	entries: FissionManualEntry[],
	entry: FissionManualEntry
): FissionManualEntry[] {
	return [...entries.filter((e) => e.isotopeKey !== entry.isotopeKey), entry];
}

/** One hand-typed fissile value: the standard's, or an unknown's value / uncertainty. */
export type ManualFissileField =
	{ kind: 'standard' } | { kind: 'unknown'; unknownIndex: number; part: 'value' | 'uncertainty' };

function readManualField(entry: FissionManualEntry, field: ManualFissileField): number | null {
	if (field.kind === 'standard') {
		return entry.inStandard;
	}
	return entry.inUnknown[field.unknownIndex]?.[field.part] ?? null;
}

function writeManualField(
	entry: FissionManualEntry,
	field: ManualFissileField,
	value: number | null
): void {
	if (field.kind === 'standard') {
		entry.inStandard = value;
	} else if (entry.inUnknown[field.unknownIndex]) {
		entry.inUnknown[field.unknownIndex][field.part] = value;
	}
}

const MASS_FRACTION_PER_UNIT: Record<string, number> = { ppm: 1e-6, percentage: 1e-2 };

/** Re-express a concentration from one unit in another (unknown units pass through). */
function convertConcentration(value: number, from: ConcUnitType, to: ConcUnitType): number {
	const f = MASS_FRACTION_PER_UNIT[from ?? ''];
	const t = MASS_FRACTION_PER_UNIT[to ?? ''];
	return f && t ? (value * f) / t : value;
}

function sameNumber(a: number, b: number): boolean {
	return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * Set one hand-typed uranium value on `sourceKey`'s entry and pre-fill the same
 * field on every other target isotope's entry — uranium is a property of the
 * sample, so typing it once for La fills it in for Ce too. Another entry is only
 * overwritten while it is empty or still holds the value this one had (i.e. it
 * was pre-filled, not typed separately), so a deliberately different value is
 * kept. Values are converted between the entries' units. Mutates in place.
 */
export function setManualFissileValue(
	entries: FissionManualEntry[],
	sourceKey: string,
	field: ManualFissileField,
	value: number | null
): void {
	const source = entries.find((entry) => entry.isotopeKey === sourceKey);
	if (!source) {
		return;
	}
	const clean = typeof value === 'number' && Number.isFinite(value) ? value : null;
	const previous = readManualField(source, field);
	writeManualField(source, field, clean);
	for (const other of entries) {
		if (other === source) {
			continue;
		}
		const current = readManualField(other, field);
		const inSync =
			current === null ||
			(previous !== null &&
				sameNumber(current, convertConcentration(previous, source.unit, other.unit)));
		if (!inSync) {
			continue;
		}
		writeManualField(
			other,
			field,
			clean === null ? null : convertConcentration(clean, source.unit, other.unit)
		);
	}
}

/**
 * Fill `target`'s empty fields (standard, and unknowns from `fromUnknownIndex`
 * on) from the other entries' values — used when a new fission target's
 * uranium fields first appear after uranium was already typed for another.
 * Mutates `target` in place.
 */
export function prefillManualFissile(
	target: FissionManualEntry,
	entries: FissionManualEntry[],
	fromUnknownIndex = 0
): void {
	const others = entries.filter((entry) => entry.isotopeKey !== target.isotopeKey);
	const fill = (field: ManualFissileField) => {
		if (readManualField(target, field) !== null) {
			return;
		}
		for (const other of others) {
			const value = readManualField(other, field);
			if (value !== null) {
				writeManualField(target, field, convertConcentration(value, other.unit, target.unit));
				return;
			}
		}
	};
	if (fromUnknownIndex === 0) {
		fill({ kind: 'standard' });
	}
	for (let i = fromUnknownIndex; i < target.inUnknown.length; i++) {
		fill({ kind: 'unknown', unknownIndex: i, part: 'value' });
		fill({ kind: 'unknown', unknownIndex: i, part: 'uncertainty' });
	}
}

/** Drop manual entries whose target isotope is no longer in the analysis. */
export function pruneManualFissile(
	entries: FissionManualEntry[],
	isotopes: IsotopeIdentity[]
): FissionManualEntry[] {
	const live = new Set(isotopes.map((iso) => fissionIsotopeKey(iso)));
	return entries.filter((entry) => live.has(entry.isotopeKey));
}

/**
 * Normalized identity for an analysis isotope, used both to match catalog rows
 * and to key the stored choice. Handles catalog names ("La-140", "Ag-110m") and
 * a bare mass number paired with an element name or symbol ("Lanthanum" + "140").
 * Falls back to a lowercased `element-name` string when nothing parses.
 */
export function fissionIsotopeKey(isotope: IsotopeIdentity): string {
	const raw = (isotope.isotopeName ?? '').trim();
	const symbol = lookupElementSymbol(isotope.elementName ?? '');
	const parsed = parseIsotopeName(raw) ?? (symbol ? parseIsotopeName(`${symbol}-${raw}`) : null);
	if (parsed) {
		return isotopeIdentityKey(parsed);
	}
	return `raw:${(isotope.elementName ?? '').trim().toLowerCase()}-${raw.toLowerCase()}`;
}

function keyFor(name: string): string {
	const parsed = parseIsotopeName(name);
	return parsed ? isotopeIdentityKey(parsed) : `raw:-${name.toLowerCase()}`;
}

const LA_140_KEY = keyFor('La-140');
const BA_140_KEY = keyFor('Ba-140');

/**
 * True when the isotope is La-140 — the one fission product whose interference
 * correction needs the Ba-140 → La-140 in-growth term rather than a flat factor.
 */
export function isLanthanum140(isotope: IsotopeIdentity): boolean {
	return fissionIsotopeKey(isotope) === LA_140_KEY;
}

/** True when the isotope is Ba-140 (the La-140 fission precursor). */
export function isBarium140(isotope: IsotopeIdentity): boolean {
	return fissionIsotopeKey(isotope) === BA_140_KEY;
}

/**
 * Well-known high-yield fission products that are also common activation
 * products — used to raise the "possible fission interference" prompt even
 * before (or without) a matching row in the `fission-corrections` catalog.
 * Not exhaustive; the catalog table is the authority once populated.
 */
const KNOWN_FISSION_PRODUCT_KEYS: ReadonlySet<string> = new Set(
	[
		'Sr-89',
		'Sr-91',
		'Sr-92',
		'Y-91',
		'Y-92',
		'Y-93',
		'Zr-95',
		'Zr-97',
		'Nb-95',
		'Nb-97',
		'Mo-99',
		'Tc-99m',
		'Ru-103',
		'Ru-105',
		'Ru-106',
		'Rh-105',
		'Sb-127',
		'Sb-129',
		'Te-132',
		'I-131',
		'I-133',
		'I-135',
		'Xe-133',
		'Xe-135',
		'Cs-136',
		'Cs-137',
		'Cs-138',
		'Ba-139',
		'Ba-140',
		'La-140',
		'La-141',
		'La-142',
		'Ce-141',
		'Ce-143',
		'Ce-144',
		'Pr-143',
		'Nd-147',
		'Pm-147',
		'Pm-149',
		'Pm-151',
		'Sm-153',
		'Eu-155',
		'Eu-156'
	].map((name) => {
		const parsed = parseIsotopeName(name);
		return parsed ? isotopeIdentityKey(parsed) : `raw:-${name.toLowerCase()}`;
	})
);

/** True when the isotope is a well-known fission product (see the note above). */
export function isKnownFissionProduct(isotope: IsotopeIdentity): boolean {
	return KNOWN_FISSION_PRODUCT_KEYS.has(fissionIsotopeKey(isotope));
}

/** The same normalized key for a catalog row's `interferingIsotope` string. */
export function fissionRowKey(record: Pick<FissionCorrectionRecord, 'interferingIsotope'>): string {
	const name = (record.interferingIsotope ?? '').trim();
	const parsed = parseIsotopeName(name);
	return parsed ? isotopeIdentityKey(parsed) : `raw:-${name.toLowerCase()}`;
}

/** Catalog rows whose interfering isotope matches this analysis isotope. */
export function matchingFissionRows(
	isotope: IsotopeIdentity,
	rows: FissionCorrectionRecord[]
): FissionCorrectionRecord[] {
	const key = fissionIsotopeKey(isotope);
	return rows
		.filter((row) => fissionRowKey(row) === key)
		.slice()
		.sort(
			(a, b) =>
				a.fissileNuclide.localeCompare(b.fissileNuclide) ||
				(a.gammaEnergyKev ?? 0) - (b.gammaEnergyKev ?? 0) ||
				a.irradiationType.localeCompare(b.irradiationType)
		);
}

/** Short human summary of a catalog row, for a selectable list. */
export function describeFissionRow(row: FissionCorrectionRecord): string {
	const parts: string[] = [row.fissileNuclide];
	if (row.gammaEnergyKev != null) {
		parts.push(`${row.gammaEnergyKev} keV`);
	}
	if (row.irradiationPosition) {
		parts.push(row.irradiationPosition);
	}
	parts.push(row.irradiationType);
	const unc = row.uncertainty ? ` ± ${row.uncertainty}` : '';
	const source = isBuiltinFissionRow(row) ? ` — ${row.notes}` : '';
	return `${parts.join(' · ')} → factor ${row.correctionFactor}${unc}${source}`;
}

/**
 * Built-in constant for the La-140 special correction (thermal U-235 fission),
 * used when the catalog table has no thermal La-140 row.
 */
export const LANTHANUM_SPECIAL_CONSTANT = {
	factor: 0.00233,
	uncertainty: 0.00012,
	fissileNuclide: 'U-235'
} as const;

/**
 * The complete choice for La-140's special correction. The special correction
 * *is* the factor — the constant `A` fed into the Ba-140 in-growth formula — so
 * nothing needs to be typed: it comes from a thermal La-140 row in the catalog
 * (U-235 preferred) or, failing that, {@link LANTHANUM_SPECIAL_CONSTANT}.
 * `rows` are the catalog rows already matched to the isotope.
 */
export function lanthanumSpecialChoice(
	isotopeKey: string,
	rows: FissionCorrectionRecord[]
): FissionChoice {
	const thermal = rows.filter(
		(row) => row.irradiationType === 'thermal' && Number(row.correctionFactor) > 0
	);
	const row =
		thermal.find((candidate) => fissileParentSymbol(candidate.fissileNuclide) === 'U') ??
		thermal[0];
	if (row) {
		return {
			isotopeKey,
			factor: row.correctionFactor,
			uncertainty: row.uncertainty ?? 0,
			mode: 'table',
			fissileNuclide: row.fissileNuclide,
			gammaEnergyKev: row.gammaEnergyKev,
			irradiationPosition: row.irradiationPosition,
			irradiationType: row.irradiationType,
			sourceRowId: row.id,
			useSpecialCorrection: true
		};
	}
	return {
		isotopeKey,
		factor: LANTHANUM_SPECIAL_CONSTANT.factor,
		uncertainty: LANTHANUM_SPECIAL_CONSTANT.uncertainty,
		mode: 'manual',
		fissileNuclide: LANTHANUM_SPECIAL_CONSTANT.fissileNuclide,
		useSpecialCorrection: true
	};
}

/** True when two La-140 special choices resolve to the same constant and source. */
export function sameLanthanumSpecialChoice(a: FissionChoice, b: FissionChoice): boolean {
	return (
		a.mode === b.mode &&
		a.factor === b.factor &&
		a.uncertainty === b.uncertainty &&
		a.fissileNuclide === b.fissileNuclide &&
		(a.sourceRowId ?? null) === (b.sourceRowId ?? null) &&
		a.useSpecialCorrection === true
	);
}

/** One-line summary of a saved choice, for the warning-box status column. */
export function describeFissionChoice(choice: FissionChoice): string {
	if (choice.mode === 'none') {
		return 'No fission interference (0)';
	}
	const unc = choice.uncertainty ? ` ± ${choice.uncertainty}` : '';
	if (choice.useSpecialCorrection === true) {
		const from = choice.sourceRowId ? 'from the catalog' : 'built-in';
		return `Special correction — constant ${choice.factor}${unc} (${choice.fissileNuclide ?? 'U-235'}, thermal, ${from})`;
	}
	if (choice.mode === 'table') {
		const builtin = choice.sourceRowId?.startsWith(BUILTIN_FISSION_ROW_PREFIX)
			? 'Landsberger 1989'
			: '';
		const from = [choice.fissileNuclide, choice.irradiationType, builtin]
			.filter(Boolean)
			.join(', ');
		return `Factor ${choice.factor}${unc}${from ? ` (${from})` : ''}`;
	}
	return `Factor ${choice.factor}${unc} (custom)`;
}

export function findFissionChoice(
	choices: FissionChoice[],
	isotope: IsotopeIdentity
): FissionChoice | null {
	const key = fissionIsotopeKey(isotope);
	return choices.find((choice) => choice.isotopeKey === key) ?? null;
}

/** Add or replace the choice for one isotope; a `null` choice removes it. */
export function upsertFissionChoice(
	choices: FissionChoice[],
	isotopeKey: string,
	choice: FissionChoice | null
): FissionChoice[] {
	const rest = choices.filter((existing) => existing.isotopeKey !== isotopeKey);
	return choice ? [...rest, choice] : rest;
}

/** Common fissile parents offered for a hand-entered factor. */
export const FISSILE_NUCLIDES = ['U-235', 'U-238', 'Pu-239', 'Pu-241', 'Th-232'] as const;

/**
 * Element symbol of a fissile nuclide string ("U-235" → "U", "Uranium" → "U").
 * Returns "" when unrecognized.
 */
export function fissileParentSymbol(nuclide: string | null | undefined): string {
	const raw = (nuclide ?? '').trim();
	if (!raw) {
		return '';
	}
	const parsed = parseIsotopeName(raw);
	return parsed ? normalizeElementSymbol(parsed.shortName) : lookupElementSymbol(raw);
}

/** True when an analysis isotope belongs to the given element symbol. */
export function isotopeIsElement(isotope: IsotopeIdentity, symbol: string): boolean {
	const target = normalizeElementSymbol(symbol);
	if (!target) {
		return false;
	}
	return lookupElementSymbol(isotope.elementName ?? '') === target;
}

/** Drop choices whose isotope is no longer in the analysis. */
export function pruneFissionChoices(
	choices: FissionChoice[],
	isotopes: IsotopeIdentity[]
): FissionChoice[] {
	const live = new Set(isotopes.map((iso) => fissionIsotopeKey(iso)));
	return choices.filter((choice) => live.has(choice.isotopeKey));
}
