/**
 * Client for the fission-correction table (`GET`/`POST /api/fission-corrections`).
 *
 * This backs a temporary data-entry screen at `/admin/fission-corrections`.
 * `GET` is public; `POST` needs the `isotope_writer` role (enforced by SWA and
 * re-checked in the function). Once the table is populated this whole feature —
 * route, module and endpoint — is meant to be removed.
 */

export const IRRADIATION_TYPES = ['thermal', 'epithermal', 'fast'] as const;
export type IrradiationType = (typeof IRRADIATION_TYPES)[number];

export type FissionCorrectionInput = {
	fissileNuclide: string;
	interferingIsotope: string;
	gammaEnergyKev: number | null;
	irradiationPosition: string;
	irradiationType: IrradiationType;
	correctionFactor: number;
	uncertainty: number;
	notes: string;
};

export type FissionCorrectionRecord = FissionCorrectionInput & {
	id: string;
	docType: 'fission-correction';
	createdAt?: string;
	createdBy?: string;
	updatedAt?: string;
	updatedBy?: string;
};

export class FissionCorrectionError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'FissionCorrectionError';
		this.status = status;
	}
}

export async function listFissionCorrections(): Promise<FissionCorrectionRecord[]> {
	let response: Response;
	try {
		response = await fetch('/api/fission-corrections', {
			headers: { accept: 'application/json' }
		});
	} catch {
		throw new FissionCorrectionError('Network error while contacting the server.', 0);
	}
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		throw new FissionCorrectionError(
			(payload && typeof payload.error === 'string' && payload.error) ||
				`Request failed with status ${response.status}`,
			response.status
		);
	}
	const items = (payload as { items?: unknown })?.items;
	return Array.isArray(items) ? (items as FissionCorrectionRecord[]) : [];
}

export type SaveResult = { created: boolean; item: FissionCorrectionRecord };

export async function saveFissionCorrection(input: FissionCorrectionInput): Promise<SaveResult> {
	let response: Response;
	try {
		response = await fetch('/api/fission-corrections', {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(input)
		});
	} catch {
		throw new FissionCorrectionError('Network error while contacting the server.', 0);
	}
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		throw new FissionCorrectionError(
			(payload && typeof payload.error === 'string' && payload.error) ||
				`Request failed with status ${response.status}`,
			response.status
		);
	}
	const body = payload as { created?: boolean; item?: FissionCorrectionRecord };
	if (!body?.item) {
		throw new FissionCorrectionError('The server did not return the saved record.', 500);
	}
	return { created: Boolean(body.created), item: body.item };
}
