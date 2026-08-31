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
	suffix: string;
};

/** "Au-198" / "Au198" / "Cd-115B" -> parts. Returns null when unparseable. */
export function parseIsotopeName(name: string): ParsedIsotopeName | null {
	const match = (name ?? '').trim().match(/^([A-Za-z]+)-?(\d+)([A-Za-z]*)$/);
	if (!match) {
		return null;
	}
	const massNumber = Number.parseInt(match[2], 10);
	if (!Number.isInteger(massNumber) || massNumber <= 0) {
		return null;
	}
	return { shortName: match[1], massNumber, suffix: match[3] ?? '' };
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
		blockers.push('Isotope name must look like "Au-198".');
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
		throw new CatalogWriteError('Isotope name must look like "Au-198".', 400);
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
}): Promise<ReferenceMaterialWriteResult> {
	const { reference, coveredIsotopes, referenceDatasheetId, countingLabel, notes } = args;

	const isotopes = coveredIsotopes.map((iso) => ({
		isotopeId: (iso.id ?? '').trim(),
		energy: iso.energy
	}));
	if (isotopes.some((entry) => entry.isotopeId.length === 0)) {
		throw new CatalogWriteError('Every covered isotope must be a catalog isotope.', 400);
	}

	const referenceKey = [reference.NETL_code?.trim(), reference.sampleName?.trim()]
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
				referenceMaterial: { ...reference, referenceDatasheetId }
			}
		]
	});

	return {
		created: Boolean(body.created),
		appendedCountings: Number(body.appendedCountings ?? 0),
		totalCountings: Number(body.totalCountings ?? 0)
	};
}
