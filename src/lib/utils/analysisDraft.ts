/**
 * Persistent draft of the Analyze wizard.
 *
 * The whole wizard is autosaved to localStorage on every change so a sign-in
 * redirect, a refresh, or an accidental tab close never costs re-entry. The
 * draft is only cleared explicitly ("Start new analysis").
 */
import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '$lib/types.js';
import {
	DEFAULT_FISSION_BARIUM_HALF_LIFE,
	type FissionBariumHalfLife,
	type FissionChoice,
	type FissionManualEntry
} from '$lib/utils/fissionInterference.js';

export const DRAFT_KEY = 'naa-analysis-draft';
export const DRAFT_VERSION = 3;

/** Legacy sign-in snapshot key (v2, sessionStorage). Migrated once, then dropped. */
const LEGACY_KEY = 'naa-auth-redirect-state';
const LEGACY_VERSION = 2;

/**
 * A proxy-measurement relationship the user has recorded this session ("measured
 * isotope is used to quantify target isotope"). Kept with the draft so it
 * survives reload / sign-in; feeds the wizard's catalog-matching immediately and
 * can be published to the shared catalog later.
 */
export type LocalIsotopeLink = {
	id: string;
	notes: string;
	published: boolean;
	measured: IsotopeInfo;
	target: IsotopeInfo;
};

export type AnalysisDraft = {
	version: number;
	step: number;
	title: string;
	isotopeInfo: IsotopeInfo[];
	materials: {
		reference: ReferenceMaterial[];
		unknown: UnknownMaterial[];
	};
	referenceIsotopeSelections: string[][];
	isotopeReferenceMap: number[];
	referenceCatalogItemIds: (string | null)[];
	expandedIsotopes: number[];
	expandedReferences: number[];
	expandedUnknowns: number[];
	localIsotopeLinks: LocalIsotopeLink[];
	/** Per-isotope fission-interference correction choices (7.2 WIP). */
	fissionChoices: FissionChoice[];
	/** Hand-entered fissile concentrations, when the fissile element isn't analysed. */
	fissionManualFissile: FissionManualEntry[];
	/** Hand-entered Ba-140 half-life for the La-140 fission correction. */
	fissionBariumHalfLife: FissionBariumHalfLife;
};

const HALF_LIFE_UNITS: FissionBariumHalfLife['unit'][] = [
	'seconds',
	'minutes',
	'hours',
	'days',
	'weeks',
	'years'
];

function parseBariumHalfLife(value: unknown): FissionBariumHalfLife {
	if (value && typeof value === 'object') {
		const raw = value as Partial<FissionBariumHalfLife>;
		const num = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;
		const unit = HALF_LIFE_UNITS.includes(raw.unit as FissionBariumHalfLife['unit'])
			? (raw.unit as FissionBariumHalfLife['unit'])
			: DEFAULT_FISSION_BARIUM_HALF_LIFE.unit;
		return { value: num, unit };
	}
	return { ...DEFAULT_FISSION_BARIUM_HALF_LIFE };
}

function hasLocalStorage(): boolean {
	try {
		return typeof window !== 'undefined' && !!window.localStorage;
	} catch {
		return false;
	}
}

export function saveDraft(draft: AnalysisDraft): void {
	if (!hasLocalStorage()) {
		return;
	}
	try {
		window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, version: DRAFT_VERSION }));
	} catch {
		// Quota errors / private mode — the draft just won't persist this time.
	}
}

export function clearDraft(): void {
	if (!hasLocalStorage()) {
		return;
	}
	try {
		window.localStorage.removeItem(DRAFT_KEY);
	} catch {
		// ignore
	}
}

function parseDraft(raw: string | null, expectedVersion: number): AnalysisDraft | null {
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<AnalysisDraft>;
		if (parsed?.version !== expectedVersion) {
			return null;
		}
		return {
			version: DRAFT_VERSION,
			step: typeof parsed.step === 'number' ? parsed.step : 0,
			title: typeof parsed.title === 'string' ? parsed.title : 'NAA Analysis',
			isotopeInfo: Array.isArray(parsed.isotopeInfo) ? parsed.isotopeInfo : [],
			materials: {
				reference: Array.isArray(parsed.materials?.reference) ? parsed.materials!.reference : [],
				unknown: Array.isArray(parsed.materials?.unknown) ? parsed.materials!.unknown : []
			},
			referenceIsotopeSelections: Array.isArray(parsed.referenceIsotopeSelections)
				? parsed.referenceIsotopeSelections
				: [],
			isotopeReferenceMap: Array.isArray(parsed.isotopeReferenceMap)
				? parsed.isotopeReferenceMap
				: [],
			referenceCatalogItemIds: Array.isArray(parsed.referenceCatalogItemIds)
				? parsed.referenceCatalogItemIds
				: [],
			expandedIsotopes: Array.isArray(parsed.expandedIsotopes) ? parsed.expandedIsotopes : [],
			expandedReferences: Array.isArray(parsed.expandedReferences) ? parsed.expandedReferences : [],
			expandedUnknowns: Array.isArray(parsed.expandedUnknowns) ? parsed.expandedUnknowns : [],
			localIsotopeLinks: Array.isArray(parsed.localIsotopeLinks) ? parsed.localIsotopeLinks : [],
			fissionChoices: Array.isArray(parsed.fissionChoices) ? parsed.fissionChoices : [],
			fissionManualFissile: Array.isArray(parsed.fissionManualFissile)
				? parsed.fissionManualFissile
				: [],
			fissionBariumHalfLife: parseBariumHalfLife(parsed.fissionBariumHalfLife)
		};
	} catch {
		return null;
	}
}

/**
 * Load the persisted draft. Falls back to (and consumes) the legacy v2 sign-in
 * snapshot from sessionStorage so users mid-redirect during the upgrade don't
 * lose data.
 */
export function loadDraft(): AnalysisDraft | null {
	if (!hasLocalStorage()) {
		return null;
	}

	const current = parseDraft(window.localStorage.getItem(DRAFT_KEY), DRAFT_VERSION);
	if (current) {
		return current;
	}

	try {
		const legacyRaw = window.sessionStorage.getItem(LEGACY_KEY);
		if (legacyRaw) {
			window.sessionStorage.removeItem(LEGACY_KEY);
			return parseDraft(legacyRaw, LEGACY_VERSION);
		}
	} catch {
		// ignore
	}

	return null;
}
