/**
 * Publish wizard data to the shared catalog via the write endpoints
 * (`POST /api/isotopes`, `POST /api/reference-datasheets`,
 * `POST /api/reference-materials`). SWA enforces the `isotope_writer` role.
 */
import type { HalfLife, IsotopeInfo, ReferenceMaterial } from '$lib/types.js';
import {
	lookupElementName,
	lookupElementSymbol,
	normalizeElementSymbol
} from '$lib/utils/elementNames.js';

export const WRITER_ROLE = 'isotope_writer';

export class CatalogWriteError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'CatalogWriteError';
		this.status = status;
	}
}

export type ParsedIsotopeName = {
	shortName: string;
	massNumber: number;
	/** Isomer / variant marker, e.g. "m", "m2", "B". Part of the catalog identity. */
	suffix: string;
};

/**
 * "Au-198" / "Au198" / "Cd-115B" / "Ag-110m" / "Hf-178m2" -> parts.
 * The trailing marker (metastable "m", isomer "m2", variant letter) is kept as
 * the suffix — the catalog keys isotope identity on (shortName, massNumber,
 * suffix), so Ag-110m is a distinct nuclide from Ag-110. Returns null when
 * unparseable.
 */
export function parseIsotopeName(name: string): ParsedIsotopeName | null {
	const match = (name ?? '')
		.trim()
		.match(/^([A-Za-z]{1,3})[-\s]?(\d{1,3})\s*([A-Za-z][A-Za-z0-9]{0,4})?$/);
	if (!match) {
		return null;
	}
	const massNumber = Number.parseInt(match[2], 10);
	if (!Number.isInteger(massNumber) || massNumber <= 0) {
		return null;
	}
	return { shortName: match[1], massNumber, suffix: (match[3] ?? '').trim() };
}

/** Stable identity key for comparing two parsed isotope names. */
export function isotopeIdentityKey(parsed: ParsedIsotopeName): string {
	return `${parsed.shortName.toLowerCase()}|${parsed.massNumber}|${parsed.suffix.toLowerCase()}`;
}

/** Human-readable summary of a parsed isotope name, for a confirm-before-save line. */
export function describeIsotope(parsed: ParsedIsotopeName, elementName: string): string {
	const canonical = `${parsed.shortName}-${parsed.massNumber}${parsed.suffix}`;
	const parts = [`${elementName || parsed.shortName}, mass ${parsed.massNumber}`];
	if (/^m\d*$/i.test(parsed.suffix)) {
		parts.push(`metastable state “${parsed.suffix}”`);
	} else if (parsed.suffix) {
		parts.push(`variant “${parsed.suffix}”`);
	}
	return `${canonical} — ${parts.join(', ')}`;
}

/**
 * When an isotope's name implies a different element than its label — e.g. name
 * "Np-239" on an entry labelled "Uranium" — that's the tell-tale sign of a proxy
 * measurement (you detect Np-239, you're quantifying uranium). Returns the two
 * element names so the UI can offer to record the relationship. Null otherwise.
 */
export function isotopeElementMismatch(
	isotope: IsotopeInfo
): { nameElement: string; labelElement: string } | null {
	const parsed = parseIsotopeName(isotope.isotopeName);
	if (!parsed) {
		return null;
	}
	const nameElement = lookupElementName(parsed.shortName);
	const labelElement = (isotope.elementName ?? '').trim();
	if (!nameElement || !labelElement) {
		return null;
	}
	if (nameElement.toLowerCase() === labelElement.toLowerCase()) {
		return null;
	}
	return { nameElement, labelElement };
}

/**
 * Nuclides that in practice are almost always detected as a delayed stand-in for
 * another element — you count the daughter but you're quantifying the parent's
 * element. Keyed by `isotopeIdentityKey`.
 */
const KNOWN_PROXY_ISOTOPES: Record<string, { targetElement: string; note: string }> = {
	'np|239|': { targetElement: 'Uranium', note: 'U-238 captures a neutron → U-239 → Np-239' },
	'pa|233|': { targetElement: 'Thorium', note: 'Th-232 captures a neutron → Th-233 → Pa-233' }
};

/**
 * When `isotope`'s name is a well-known proxy nuclide (Np-239, Pa-233…), returns
 * the element it's normally used to measure so the wizard can check the user
 * isn't reporting the proxy element by mistake. Returns null when it isn't one,
 * or when the entry is already labelled as the target element (in which case
 * `isotopeElementMismatch` handles it).
 */
export function knownProxyHint(
	isotope: IsotopeInfo
): { proxyElement: string; targetElement: string; note: string } | null {
	const parsed = parseIsotopeName(isotope.isotopeName);
	if (!parsed) {
		return null;
	}
	const known = KNOWN_PROXY_ISOTOPES[isotopeIdentityKey(parsed)];
	if (!known) {
		return null;
	}
	const label = (isotope.elementName ?? '').trim();
	if (label.toLowerCase() === known.targetElement.toLowerCase()) {
		return null;
	}
	return {
		proxyElement: lookupElementName(parsed.shortName) || parsed.shortName,
		targetElement: known.targetElement,
		note: known.note
	};
}

/** Best-effort GET; returns null on any error (the caller degrades gracefully). */
async function getJson<T>(url: string): Promise<T | null> {
	try {
		const response = await fetch(url, { headers: { accept: 'application/json' } });
		if (!response.ok) {
			return null;
		}
		return (await response.json()) as T;
	} catch {
		return null;
	}
}

// --- Duplicate lookups (pre-flight, before an upload) --------------------

export type CatalogIsotopeMatch = {
	id: string;
	elementName: string;
	shortName: string;
	massNumber: number;
	suffix: string;
	energies: number[];
	halfLife: { number: number; unit: string };
};

/** Whether an isotope with this exact identity already exists in the catalog. */
export async function findCatalogIsotope(
	parsed: ParsedIsotopeName
): Promise<CatalogIsotopeMatch | null> {
	const body = await getJson<{ items?: CatalogIsotopeMatch[] }>(
		`/api/isotopes?q=${encodeURIComponent(parsed.shortName)}&limit=100`
	);
	if (!body?.items) {
		return null;
	}
	const wantKey = isotopeIdentityKey(parsed);
	return (
		body.items.find(
			(item) =>
				isotopeIdentityKey({
					shortName: item.shortName ?? '',
					massNumber: item.massNumber ?? 0,
					suffix: item.suffix ?? ''
				}) === wantKey
		) ?? null
	);
}

export type CatalogReferenceMatch = {
	itemId: string;
	netlCode: string;
	sampleName: string;
	countingCount: number;
};

/** Whether a reference material with this NETL code / sample name already exists. */
export async function findCatalogReferenceMaterial(identity: {
	netlCode?: string;
	sampleName?: string;
}): Promise<CatalogReferenceMatch | null> {
	const netl = (identity.netlCode ?? '').trim();
	const sample = (identity.sampleName ?? '').trim();
	const query = netl || sample;
	if (!query) {
		return null;
	}
	type Row = {
		id: string;
		countingCount?: number;
		countings?: Array<{ referenceMaterial?: { NETL_code?: string; sampleName?: string } }>;
	};
	const body = await getJson<{ items?: Row[] }>(
		`/api/reference-materials?q=${encodeURIComponent(query)}&limit=50`
	);
	if (!body?.items) {
		return null;
	}
	const netlLc = netl.toLowerCase();
	const sampleLc = sample.toLowerCase();
	for (const item of body.items) {
		for (const counting of item.countings ?? []) {
			const rm = counting.referenceMaterial ?? {};
			const cNetl = String(rm.NETL_code ?? '')
				.trim()
				.toLowerCase();
			const cSample = String(rm.sampleName ?? '')
				.trim()
				.toLowerCase();
			if ((netlLc && cNetl === netlLc) || (sampleLc && cSample === sampleLc)) {
				return {
					itemId: item.id,
					netlCode: String(rm.NETL_code ?? ''),
					sampleName: String(rm.sampleName ?? ''),
					countingCount: Number(item.countingCount ?? 0)
				};
			}
		}
	}
	return null;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		throw new CatalogWriteError('Network error while contacting the catalog.', 0);
	}

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const message =
			(payload && typeof payload.error === 'string' && payload.error) ||
			`Request failed with status ${response.status}`;
		throw new CatalogWriteError(message, response.status);
	}
	return payload as T;
}

// --- Isotopes -------------------------------------------------------------

export type IsotopeWriteResult = {
	created: boolean;
	item: { id?: string; [key: string]: unknown } | null;
};

export function isotopeSaveBlockers(isotope: IsotopeInfo): string[] {
	const blockers: string[] = [];
	const parsed = parseIsotopeName(isotope.isotopeName);
	if (!parsed) {
		blockers.push(
			'Isotope name must look like "Au-198" — add a trailing "m" for a metastable state, e.g. "Ag-110m".'
		);
	} else if (!isotope.elementName.trim() && !lookupElementName(parsed.shortName)) {
		blockers.push(`Add an element name — "${parsed.shortName}" is not a recognized symbol.`);
	}
	if (!(isotope.energy > 0)) {
		blockers.push('Energy must be greater than 0.');
	}
	if (!(isotope.halfLife > 0)) {
		blockers.push('Half-life must be greater than 0.');
	}
	return blockers;
}

/** Clean, dedupe and sort a list of energy values. */
export function normalizeEnergyList(values: Array<number | string>): number[] {
	const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
	return [...new Set(nums)].sort((a, b) => a - b);
}

export async function saveIsotopeToCatalog(
	isotope: IsotopeInfo,
	options: { energies?: number[]; mode?: 'append' | 'replace' } = {}
): Promise<IsotopeWriteResult> {
	const parsed = parseIsotopeName(isotope.isotopeName);
	if (!parsed) {
		throw new CatalogWriteError(
			'Isotope name must look like "Au-198" — add a trailing "m" for a metastable state, e.g. "Ag-110m".',
			400
		);
	}
	const elementName = isotope.elementName.trim() || lookupElementName(parsed.shortName);
	if (!elementName) {
		throw new CatalogWriteError('Element name is required for an unrecognized symbol.', 400);
	}

	const energies = normalizeEnergyList([...(options.energies ?? []), isotope.energy]);
	if (energies.length === 0) {
		throw new CatalogWriteError('At least one energy line greater than 0 is required.', 400);
	}

	const payload = {
		mode: options.mode ?? 'append',
		elementName,
		shortName: parsed.shortName,
		massNumber: parsed.massNumber,
		suffix: parsed.suffix,
		energies,
		halfLife: {
			number: isotope.halfLife,
			unit: (isotope.unit || 'seconds') as HalfLife['unit']
		}
	};

	const body = await postJson<{ created?: boolean; item?: IsotopeWriteResult['item'] }>(
		'/api/isotopes',
		payload
	);
	return { created: Boolean(body.created), item: body.item ?? null };
}

// --- Reference datasheets -----------------------------------------------

export type DatasheetEntryInput = {
	label: string;
	concentration: number;
	uncertainty: number;
	unit: 'ppm' | 'percentage';
};

export type SavedDatasheet = {
	id: string;
	sampleName: string;
	entries: DatasheetEntryInput[];
	createdAt?: string | null;
};

export async function saveReferenceDatasheet(input: {
	sampleName: string;
	entries: DatasheetEntryInput[];
}): Promise<SavedDatasheet> {
	const body = await postJson<{ item?: SavedDatasheet }>('/api/reference-datasheets', {
		sampleName: input.sampleName.trim(),
		entries: input.entries
	});
	if (!body.item?.id) {
		throw new CatalogWriteError('The catalog did not return a datasheet id.', 500);
	}
	return body.item;
}

/** An element (+ optional mass number / isomer suffix) a label or isotope refers to. */
type NuclideRef = { symbol: string; mass: number | null; suffix: string };

/**
 * Parse one datasheet-row or isotope label into an element + optional mass.
 * Handles: "U-238", "U238", "U", "Uranium", "Uranium-238", "Uranium 238",
 * "Ag-110m", "gold". Returns null when the element can't be identified.
 */
function parseNuclideRef(value: string): NuclideRef | null {
	const trimmed = (value ?? '').trim();
	if (!trimmed) {
		return null;
	}

	// Symbol form, e.g. "U-238", "Ag-110m", "Au"
	const parsed = parseIsotopeName(trimmed);
	if (parsed) {
		const symbol = lookupElementName(parsed.shortName)
			? normalizeElementSymbol(parsed.shortName)
			: '';
		if (symbol) {
			return { symbol, mass: parsed.massNumber, suffix: parsed.suffix.toLowerCase() };
		}
	}

	// Bare element symbol, e.g. "U", "Au"
	const bareSymbol = lookupElementSymbol(trimmed);
	if (bareSymbol && /^[A-Za-z]{1,3}$/.test(trimmed)) {
		return { symbol: bareSymbol, mass: null, suffix: '' };
	}

	// Element name, optionally with a mass number, e.g. "Uranium", "Uranium-238"
	const nameMatch = trimmed.match(/^([A-Za-z]+)(?:[-\s]?(\d{1,3})\s*([A-Za-z]?\d*))?$/);
	if (nameMatch) {
		const symbol = lookupElementSymbol(nameMatch[1]);
		if (symbol) {
			return {
				symbol,
				mass: nameMatch[2] ? Number.parseInt(nameMatch[2], 10) : null,
				suffix: (nameMatch[3] ?? '').toLowerCase()
			};
		}
	}

	return null;
}

/** Every element/nuclide an analysis isotope could be referred to as. */
function isotopeNuclideRefs(isotope: IsotopeInfo): NuclideRef[] {
	const refs: NuclideRef[] = [];
	const fromName = parseNuclideRef(isotope.isotopeName ?? '');
	if (fromName) {
		refs.push(fromName);
	}
	const elementSymbol = lookupElementSymbol(isotope.elementName ?? '');
	if (elementSymbol && !refs.some((r) => r.symbol === elementSymbol)) {
		refs.push({ symbol: elementSymbol, mass: null, suffix: '' });
	}
	return refs;
}

/**
 * How well a datasheet row matches an isotope: 2 = exact nuclide (element + mass
 * [+ isomer]), 1 = element-level (one side has no mass), 0 = no match. Lets the
 * caller prefer a specific "U-238" row over a generic "Uranium" row.
 */
function datasheetEntryMatchScore(entry: DatasheetEntryInput, isotope: IsotopeInfo): number {
	const label = parseNuclideRef(entry.label);
	if (!label) {
		return 0;
	}
	let best = 0;
	for (const ref of isotopeNuclideRefs(isotope)) {
		if (ref.symbol !== label.symbol) {
			continue;
		}
		if (ref.mass !== null && label.mass !== null) {
			if (ref.mass === label.mass && ref.suffix === label.suffix) {
				best = Math.max(best, 2);
			}
		} else {
			best = Math.max(best, 1);
		}
	}
	return best;
}

/**
 * Find a datasheet row for a given element symbol (e.g. "U" for uranium),
 * regardless of whether the row is a bare element ("Uranium", "U") or a
 * specific isotope's ("U-238") — prefers an element-level row when both exist.
 * Used to pick up a fissile element's certified concentration for the fission
 * correction even when it isn't one of the analysed isotopes.
 */
export function findDatasheetEntryForElement(
	datasheet: SavedDatasheet,
	symbol: string
): DatasheetEntryInput | null {
	const target = normalizeElementSymbol(symbol);
	if (!target) {
		return null;
	}
	let best: DatasheetEntryInput | null = null;
	let bestScore = -1;
	for (const row of datasheet.entries) {
		const ref = parseNuclideRef(row.label);
		if (!ref || ref.symbol !== target) {
			continue;
		}
		const score = ref.mass === null ? 1 : 0;
		if (score > bestScore) {
			bestScore = score;
			best = row;
		}
	}
	return best;
}

/**
 * Fill a reference material's known-concentration fields from an existing
 * datasheet, matching rows to isotopes by element/isotope name — the reverse of
 * `datasheetEntriesFromReference`. Isotopes with no matching row are left as-is.
 */
export function applyDatasheetToReference(
	reference: ReferenceMaterial,
	isotopes: IsotopeInfo[],
	datasheet: SavedDatasheet
): { reference: ReferenceMaterial; matchedCount: number } {
	const knownConcentration = [...(reference.knownConcentration ?? [])];
	const knownUncertainty = [...(reference.knownUncertainty ?? [])];
	const concentrationUnits = [...(reference.concentrationUnits ?? [])];
	let matchedCount = 0;

	isotopes.forEach((isotope, index) => {
		// Prefer the most specific row: an exact "U-238" beats a generic "Uranium".
		let entry: DatasheetEntryInput | undefined;
		let bestScore = 0;
		for (const row of datasheet.entries) {
			const score = datasheetEntryMatchScore(row, isotope);
			if (score > bestScore) {
				bestScore = score;
				entry = row;
			}
		}
		if (!entry) {
			return;
		}
		knownConcentration[index] = entry.concentration;
		knownUncertainty[index] = entry.uncertainty;
		concentrationUnits[index] = entry.unit;
		matchedCount++;
	});

	return {
		reference: {
			...reference,
			knownConcentration,
			knownUncertainty,
			concentrationUnits,
			referenceDatasheetId: datasheet.id
		},
		matchedCount
	};
}

// --- Reference materials -----------------------------------------------

export type ReferenceMaterialWriteResult = {
	created: boolean;
	appendedCountings: number;
	totalCountings: number;
	replacedCounting: boolean;
};

/** Build datasheet rows from the concentrations already entered on a material. */
/** An isotope this reference material covers, with its position in the analysis's isotope list. */
export type CoveredIsotope = { isotope: IsotopeInfo; index: number };

export function datasheetEntriesFromReference(
	reference: ReferenceMaterial,
	covered: CoveredIsotope[]
): DatasheetEntryInput[] {
	const entries: DatasheetEntryInput[] = [];
	covered.forEach(({ isotope, index }) => {
		const concentration = Number(reference.knownConcentration?.[index]);
		if (!Number.isFinite(concentration) || concentration <= 0) {
			return;
		}
		const uncertainty = Number(reference.knownUncertainty?.[index]);
		const unit = reference.concentrationUnits?.[index];
		entries.push({
			label: isotopeLabel(isotope),
			concentration,
			uncertainty: Number.isFinite(uncertainty) && uncertainty >= 0 ? uncertainty : 0,
			unit: unit === 'percentage' ? 'percentage' : 'ppm'
		});
	});
	return entries;
}

/** Hard blockers only — things the wizard cannot resolve automatically. */
export function referenceMaterialSaveBlockers(reference: ReferenceMaterial): string[] {
	const blockers: string[] = [];
	if (!reference.NETL_code?.trim() && !reference.sampleName?.trim()) {
		blockers.push('Give the reference material a NETL code or sample name.');
	}
	return blockers;
}

/** Covered isotopes not yet in the catalog — the publish flow adds these first. */
export function uncataloguedIsotopes(isotopes: IsotopeInfo[]): IsotopeInfo[] {
	return isotopes.filter((iso) => !iso.id?.trim());
}

/** Display label for an isotope in confirm-summary text. */
export function isotopeLabel(iso: IsotopeInfo): string {
	return iso.isotopeName?.trim() || iso.elementName?.trim() || 'isotope';
}

export async function saveReferenceMaterialToCatalog(args: {
	reference: ReferenceMaterial;
	/** Only the isotopes this irradiation actually measured — its counts/known values are sliced to match. */
	covered: CoveredIsotope[];
	referenceDatasheetId: string;
	countingLabel: string;
	notes: string;
	/** 'append' upserts by identity; 'new' forces a distinct entry; 'replace-counting' targets `target`. */
	mode?: 'append' | 'new' | 'replace-counting';
	/** When saving as a distinct new entry: overrides the identifying name(s). */
	identityOverride?: { netlCode?: string; sampleName?: string };
	/** For 'replace-counting': the catalog doc + counting to overwrite in place. */
	target?: { itemId: string; countingId: string };
}): Promise<ReferenceMaterialWriteResult> {
	const {
		reference,
		covered,
		referenceDatasheetId,
		countingLabel,
		notes,
		mode = 'append',
		identityOverride,
		target
	} = args;

	if (covered.length === 0) {
		throw new CatalogWriteError(
			'This reference material does not cover any analysis isotope.',
			400
		);
	}

	const isotopes = covered.map(({ isotope }) => ({
		isotopeId: (isotope.id ?? '').trim(),
		energy: isotope.energy
	}));
	if (isotopes.some((entry) => entry.isotopeId.length === 0)) {
		throw new CatalogWriteError('Every covered isotope must be a catalog isotope.', 400);
	}

	const blankCount = () => ({
		grossCounts: 0,
		netCounts: 0,
		uncertainty: 0,
		grossCountsPositionalCorrectionFactor: 1,
		netCountsPositionalCorrectionFactor: 1,
		uncertaintyPositionalCorrectionFactor: 1
	});

	// The wizard's per-isotope arrays span every analysis isotope; the catalog
	// counting must contain exactly the covered rows, in the same order as `isotopes`.
	const referenceMaterial: ReferenceMaterial = {
		...reference,
		referenceDatasheetId,
		countingMode: reference.countingMode === 'compton' ? 'compton' : 'normal',
		counts: covered.map(({ index }) => reference.counts?.[index] ?? blankCount()),
		knownConcentration: covered.map(
			({ index }) => Number(reference.knownConcentration?.[index]) || 0
		),
		knownUncertainty: covered.map(({ index }) => Number(reference.knownUncertainty?.[index]) || 0),
		concentrationUnits: covered.map(({ index }) => reference.concentrationUnits?.[index])
	};
	if (mode === 'new' && identityOverride?.netlCode?.trim()) {
		referenceMaterial.NETL_code = identityOverride.netlCode.trim();
	}
	if (mode === 'new' && identityOverride?.sampleName?.trim()) {
		referenceMaterial.sampleName = identityOverride.sampleName.trim();
	}

	const referenceKey = [referenceMaterial.NETL_code?.trim(), referenceMaterial.sampleName?.trim()]
		.filter(Boolean)
		.join('::');

	const body = await postJson<Partial<ReferenceMaterialWriteResult>>('/api/reference-materials', {
		referenceKey,
		notes: notes.trim(),
		referenceDatasheetId,
		isotopes,
		countings: [
			{
				countingLabel: countingLabel.trim() || 'Counting 1',
				referenceMaterial
			}
		],
		...(mode === 'replace-counting' && target
			? {
					mode: 'replace-counting',
					targetItemId: target.itemId,
					targetCountingId: target.countingId
				}
			: {})
	});

	return {
		created: Boolean(body.created),
		appendedCountings: Number(body.appendedCountings ?? 0),
		totalCountings: Number(body.totalCountings ?? 0),
		replacedCounting: Boolean(body.replacedCounting)
	};
}

// --- Isotope-measurement relationships ("A measures B") -----------------

/** Whether a link for this exact (measured, target) pair already exists. Best-effort. */
export async function findIsotopeMeasurementLink(
	measuredIsotopeId: string,
	targetIsotopeId: string
): Promise<boolean> {
	const measured = measuredIsotopeId.trim();
	const target = targetIsotopeId.trim();
	if (!measured || !target) {
		return false;
	}
	type Row = {
		measuredIsotope?: { isotopeId?: string; id?: string };
		targetIsotope?: { isotopeId?: string; id?: string };
	};
	const body = await getJson<{ items?: Row[] }>('/api/isotope-measurements');
	if (!body?.items) {
		return false;
	}
	return body.items.some((row) => {
		const m = (row.measuredIsotope?.isotopeId ?? row.measuredIsotope?.id ?? '').trim();
		const t = (row.targetIsotope?.isotopeId ?? row.targetIsotope?.id ?? '').trim();
		return m === measured && t === target;
	});
}

/** Record that `measuredIsotopeId` is used to quantify `targetIsotopeId`. */
export async function saveIsotopeMeasurementLink(args: {
	measuredIsotopeId: string;
	targetIsotopeId: string;
	notes: string;
}): Promise<{ created: boolean }> {
	const measured = args.measuredIsotopeId.trim();
	const target = args.targetIsotopeId.trim();
	if (!measured || !target) {
		throw new CatalogWriteError('Both isotopes must be catalog isotopes.', 400);
	}
	if (measured === target) {
		throw new CatalogWriteError('The measured and target isotope must be different.', 400);
	}
	const body = await postJson<{ created?: boolean }>('/api/isotope-measurements', {
		measuredIsotope: { isotopeId: measured },
		targetIsotope: { isotopeId: target },
		notes: args.notes.trim()
	});
	return { created: Boolean(body.created) };
}
