/**
 * Publish wizard data to the shared catalog via the write endpoints
 * (`POST /api/isotopes`, `POST /api/reference-datasheets`,
 * `POST /api/reference-materials`). SWA enforces the `isotope_writer` role.
 */
import type { HalfLife, IsotopeInfo, ReferenceMaterial } from '$lib/types.js';
import { lookupElementName } from '$lib/utils/elementNames.js';

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

export async function saveIsotopeToCatalog(isotope: IsotopeInfo): Promise<IsotopeWriteResult> {
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

	const payload = {
		elementName,
		shortName: parsed.shortName,
		massNumber: parsed.massNumber,
		suffix: parsed.suffix,
		energies: [isotope.energy],
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

// --- Reference materials -----------------------------------------------

export type ReferenceMaterialWriteResult = {
	created: boolean;
	appendedCountings: number;
	totalCountings: number;
};

export function referenceMaterialSaveBlockers(
	reference: ReferenceMaterial,
	coveredIsotopes: IsotopeInfo[]
): string[] {
	const blockers: string[] = [];
	if (!reference.NETL_code?.trim() && !reference.sampleName?.trim()) {
		blockers.push('Give the reference material a NETL code or sample name.');
	}
	const uncatalogued = coveredIsotopes.filter((iso) => !iso.id?.trim());
	if (uncatalogued.length > 0) {
		const names = uncatalogued.map((iso) => iso.isotopeName || iso.elementName || '?').join(', ');
		blockers.push(`Save these isotopes to the shared catalog first: ${names}.`);
	}
	return blockers;
}

export async function saveReferenceMaterialToCatalog(args: {
	reference: ReferenceMaterial;
	coveredIsotopes: IsotopeInfo[];
	referenceDatasheetId: string;
	countingLabel: string;
	notes: string;
	/** When saving as a distinct new entry: overrides the identifying name(s). */
	identityOverride?: { netlCode?: string; sampleName?: string };
}): Promise<ReferenceMaterialWriteResult> {
	const {
		reference,
		coveredIsotopes,
		referenceDatasheetId,
		countingLabel,
		notes,
		identityOverride
	} = args;

	const isotopes = coveredIsotopes.map((iso) => ({
		isotopeId: (iso.id ?? '').trim(),
		energy: iso.energy
	}));
	if (isotopes.some((entry) => entry.isotopeId.length === 0)) {
		throw new CatalogWriteError('Every covered isotope must be a catalog isotope.', 400);
	}

	const referenceMaterial: ReferenceMaterial = { ...reference, referenceDatasheetId };
	if (identityOverride?.netlCode?.trim()) {
		referenceMaterial.NETL_code = identityOverride.netlCode.trim();
	}
	if (identityOverride?.sampleName?.trim()) {
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
		]
	});

	return {
		created: Boolean(body.created),
		appendedCountings: Number(body.appendedCountings ?? 0),
		totalCountings: Number(body.totalCountings ?? 0)
	};
}
