<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate, pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { tick, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import IsotopeInfo from '$lib/components/isotopeInfo.svelte';
	import MaterialInfo from '$lib/components/materialInfo.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';
	import CollapsibleCard from '$lib/components/CollapsibleCard.svelte';
	import ComputedDisplay from '$lib/components/ComputedDisplay.svelte';
	import ProgressIndicator from '$lib/components/ProgressIndicator.svelte';
	import IsotopeViewer from '$lib/components/IsotopeViewer.svelte';
	import ReferenceMaterialViewer from '$lib/components/ReferenceMaterialViewer.svelte';

	import { getAll as isoGA } from '../lib/NAAMath/isotopeMath.ts';
	import { getAll as matGA } from '../lib/NAAMath/MaterialMath.ts';
	import { getAll as matIsoGA } from '../lib/NAAMath/MaterialIsotopeMath.ts';
	import { getAll as MMGA } from '../lib/NAAMath/MultiMaterialMath.ts';
	import { getAll as EGA } from '../lib/NAAMath/everythingMath.ts';

	import type {
		ConcUnitType,
		CountData as CountDataType,
		IsotopeCatalogItem,
		IsotopeInfo as IsotopeInfoType,
		ReferenceMaterialCatalogCounting,
		ReferenceMaterialCatalogItem,
		ReferenceMaterial,
		UnknownMaterial
	} from '$lib/types.js';
	import {
		createIsotopeInfo,
		createReferenceMaterial,
		createUnknownMaterial,
		findRoiIndices,
		roundResult,
		roundToMatch
	} from '$lib/utils/naaUtils.js';
	import {
		getBaseMaterialErrors,
		getIsotopeErrors,
		getReferenceMaterialErrors
	} from '$lib/utils/materialValidation.js';
	import {
		loadDraft,
		saveDraft,
		clearDraft,
		type AnalysisDraft,
		type LocalIsotopeLink
	} from '$lib/utils/analysisDraft.js';
	import {
		listFissionCorrections,
		type FissionCorrectionRecord
	} from '$lib/utils/fissionCorrections.js';
	import {
		describeFissionChoice,
		describeFissionRow,
		findFissionChoice,
		fissionIsotopeKey,
		isBarium140,
		isKnownFissionProduct,
		isLanthanum140,
		isotopeIsElement,
		matchingFissionRows,
		pruneFissionChoices,
		pruneManualFissile,
		upsertFissionChoice,
		upsertManualFissile,
		DEFAULT_FISSION_BARIUM_HALF_LIFE,
		type FissionBariumHalfLife,
		type FissionChoice,
		type FissionManualEntry
	} from '$lib/utils/fissionInterference.js';
	import { computeFissionResults } from '$lib/utils/fissionResults.js';
	import { swaAuth, redirectToSignIn } from '$lib/utils/swaAuth.svelte.js';
	import { catalogStatus } from '$lib/utils/catalogStatus.svelte.js';
	import { analysisMeta } from '$lib/utils/analysisMeta.svelte.js';
	import {
		WRITER_ROLE,
		CatalogWriteError,
		isotopeSaveBlockers,
		saveIsotopeToCatalog,
		referenceMaterialSaveBlockers,
		uncataloguedIsotopes,
		isotopeLabel,
		type CoveredIsotope,
		saveReferenceMaterialToCatalog,
		saveReferenceDatasheet,
		parseIsotopeName,
		isotopeIdentityKey,
		describeIsotope,
		normalizeEnergyList,
		datasheetEntriesFromReference,
		findCatalogIsotope,
		findCatalogReferenceMaterial,
		isotopeElementMismatch,
		knownProxyHint,
		findIsotopeMeasurementLink,
		saveIsotopeMeasurementLink,
		applyDatasheetToReference,
		type CatalogIsotopeMatch,
		type CatalogReferenceMatch,
		type SavedDatasheet
	} from '$lib/utils/catalogWrite.js';
	import ReferenceDatasheetForm from '$lib/components/ReferenceDatasheetForm.svelte';
	import IsotopeRelationshipForm from '$lib/components/IsotopeRelationshipForm.svelte';
	import {
		resolveProxyMeasured,
		applyProxyMeasured,
		describeProxyMeasured
	} from '$lib/utils/proxyMeasurement.js';
	import {
		APP_VERSION,
		REVIEW_STEP,
		STEP,
		StepType,
		getBackButtonText,
		getNextButtonText,
		getProgressPercentage,
		getStepTitle,
		getStepType
	} from '$lib/utils/stepUtils.js';

	type IsotopeMeasurementLink = {
		id: string;
		measuredIsotope: {
			isotopeId?: string;
			id?: string;
		};
		targetIsotope: {
			isotopeId?: string;
			id?: string;
		};
	};

	async function detectCatalogAvailability(): Promise<boolean> {
		// Can this environment reach the read-only isotope catalog API?
		const apiUrl = import.meta.env.PUBLIC_ISOTOPE_API_URL?.trim() || '/api/isotopes';
		return fetch(apiUrl, {
			headers: {
				accept: 'application/json'
			}
		})
			.then((response) => {
				if (response.status === 401 || response.status === 403) {
					return false;
				}
				return response.ok;
			})
			.catch(() => false);
	}

	function resizeReferenceMaterial(
		reference: ReferenceMaterial,
		newIsotopeCount: number
	): ReferenceMaterial {
		const baseReference = createReferenceMaterial(newIsotopeCount);
		const updatedReference: ReferenceMaterial = {
			...baseReference,
			...reference
		};

		const existingRefCounts = reference.counts || [];
		updatedReference.counts = Array.from({ length: newIsotopeCount }, (_, i) =>
			i < existingRefCounts.length
				? existingRefCounts[i]
				: {
						grossCounts: 0,
						netCounts: 0,
						uncertainty: 0,
						grossCountsPositionalCorrectionFactor: 1,
						netCountsPositionalCorrectionFactor: 1,
						uncertaintyPositionalCorrectionFactor: 1
					}
		);

		const existingKnownConcentration = Array.isArray(reference.knownConcentration)
			? reference.knownConcentration
			: [];
		const existingKnownUncertainty = Array.isArray(reference.knownUncertainty)
			? reference.knownUncertainty
			: [];
		const existingUnits = Array.isArray(reference.concentrationUnits)
			? reference.concentrationUnits
			: [];

		updatedReference.knownConcentration = Array.from({ length: newIsotopeCount }, (_, i) =>
			existingKnownConcentration[i] !== undefined
				? existingKnownConcentration[i]
				: baseReference.knownConcentration[i]
		);

		updatedReference.knownUncertainty = Array.from({ length: newIsotopeCount }, (_, i) =>
			existingKnownUncertainty[i] !== undefined
				? existingKnownUncertainty[i]
				: baseReference.knownUncertainty[i]
		);

		updatedReference.concentrationUnits = Array.from({ length: newIsotopeCount }, (_, i) =>
			existingUnits[i] !== undefined ? existingUnits[i] : baseReference.concentrationUnits[i]
		);

		return updatedReference;
	}

	function resizeUnknownMaterial(
		unknown: UnknownMaterial,
		newIsotopeCount: number
	): UnknownMaterial {
		const existingCounts = unknown.counts || [];
		return {
			...unknown,
			counts: Array.from({ length: newIsotopeCount }, (_, i) =>
				i < existingCounts.length
					? existingCounts[i]
					: {
							grossCounts: 0,
							netCounts: 0,
							uncertainty: 0,
							grossCountsPositionalCorrectionFactor: 1,
							netCountsPositionalCorrectionFactor: 1,
							uncertaintyPositionalCorrectionFactor: 1
						}
			)
		};
	}

	function updateIsotopeReferenceMap(newIsotopeCount: number, newReferenceCount: number) {
		const nextMap = Array.from({ length: newIsotopeCount }, (_, i) => {
			const linkedReference = isotopeInfo[i]?.linkedReference;
			if (
				linkedReference !== undefined &&
				linkedReference >= 0 &&
				linkedReference < newReferenceCount
			) {
				return linkedReference;
			}

			const autoIndex = materials.reference.findIndex(
				(ref) => (ref.knownConcentration?.[i] ?? 0) > 0
			);
			return autoIndex >= 0 ? autoIndex : 0;
		});

		isotopeReferenceMap = nextMap;

		const needsIsotopeSync = nextMap.some(
			(linkedReference, index) => isotopeInfo[index]?.linkedReference !== linkedReference
		);
		if (needsIsotopeSync) {
			isotopeInfo = isotopeInfo.map((iso, index) => ({
				...iso,
				linkedReference: nextMap[index] ?? 0
			}));
		}
	}

	/**
	 * Rebuild the per-isotope arrays on every material after the isotope list changes
	 * length at its tail (catalog add, "Add custom isotope"). Middle removals go through
	 * `removeIsotope`, which splices each array itself.
	 */
	function reconcileIsotopeDependentState() {
		const isotopeLength = isotopeInfo.length;
		const needsResize =
			materials.reference.some((ref) => (ref.counts?.length ?? 0) !== isotopeLength) ||
			materials.unknown.some((unk) => (unk.counts?.length ?? 0) !== isotopeLength);

		if (!needsResize) {
			return;
		}

		materials = {
			reference: materials.reference.map((ref) => resizeReferenceMaterial(ref, isotopeLength)),
			unknown: materials.unknown.map((unk) => resizeUnknownMaterial(unk, isotopeLength))
		};

		updateIsotopeReferenceMap(isotopeLength, materials.reference.length);
	}

	function toggleExpanded(set: SvelteSet<number>, value: number) {
		if (set.has(value)) {
			set.delete(value);
		} else {
			set.add(value);
		}
	}

	function remapExpandedAfterRemoval(set: SvelteSet<number>, removedIndex: number) {
		const kept = [...set]
			.filter((value) => value !== removedIndex)
			.map((value) => (value > removedIndex ? value - 1 : value));
		set.clear();
		for (const value of kept) {
			set.add(value);
		}
	}

	function currentDraft(): AnalysisDraft {
		return {
			version: 3,
			step,
			title,
			isotopeInfo,
			materials,
			referenceIsotopeSelections: referenceIsotopeSelections.map((selection) =>
				Array.from(selection ?? [])
			),
			isotopeReferenceMap,
			referenceCatalogItemIds,
			expandedIsotopes: Array.from(expandedIsotopes),
			expandedReferences: Array.from(expandedReferences),
			expandedUnknowns: Array.from(expandedUnknowns),
			localIsotopeLinks,
			fissionChoices,
			fissionManualFissile,
			fissionBariumHalfLife
		};
	}

	let draftSaveTimer: ReturnType<typeof setTimeout> | undefined;

	/** Write the draft immediately (before a navigation away from the page). */
	function flushDraft() {
		if (!browser) {
			return;
		}
		if (draftSaveTimer !== undefined) {
			clearTimeout(draftSaveTimer);
			draftSaveTimer = undefined;
		}
		saveDraft(currentDraft());
	}

	/** Debounced autosave, called from the state-tracking $effect. */
	function scheduleDraftSave() {
		if (!browser) {
			return;
		}
		if (draftSaveTimer !== undefined) {
			clearTimeout(draftSaveTimer);
		}
		draftSaveTimer = setTimeout(() => {
			draftSaveTimer = undefined;
			saveDraft(currentDraft());
		}, 300);
	}

	function hydrateExpandedSet(set: SvelteSet<number>, values: number[]) {
		set.clear();
		for (const value of values) {
			if (Number.isInteger(value)) {
				set.add(value);
			}
		}
	}

	function restoreDraft() {
		if (!browser) {
			return;
		}

		const saved = loadDraft();
		if (!saved) {
			return;
		}

		step = Math.min(Math.max(saved.step ?? 0, 0), REVIEW_STEP);
		title = saved.title ?? 'NAA Analysis';
		isotopeInfo = Array.isArray(saved.isotopeInfo) ? saved.isotopeInfo : [];

		materials = {
			reference: Array.isArray(saved.materials?.reference) ? saved.materials.reference : [],
			unknown: Array.isArray(saved.materials?.unknown) ? saved.materials.unknown : []
		};

		referenceIsotopeSelections = materials.reference.map((_, index) => {
			const selection = saved.referenceIsotopeSelections?.[index];
			return new Set<string>(Array.isArray(selection) ? selection : []);
		});
		referenceCatalogItemIds = materials.reference.map(
			(_, index) => saved.referenceCatalogItemIds?.[index] ?? null
		);
		isotopeReferenceMap = Array.isArray(saved.isotopeReferenceMap) ? saved.isotopeReferenceMap : [];
		localIsotopeLinks = Array.isArray(saved.localIsotopeLinks) ? saved.localIsotopeLinks : [];
		fissionChoices = Array.isArray(saved.fissionChoices) ? saved.fissionChoices : [];
		fissionManualFissile = Array.isArray(saved.fissionManualFissile)
			? saved.fissionManualFissile
			: [];
		fissionBariumHalfLife = saved.fissionBariumHalfLife
			? { ...saved.fissionBariumHalfLife }
			: { ...DEFAULT_FISSION_BARIUM_HALF_LIFE };

		hydrateExpandedSet(expandedIsotopes, saved.expandedIsotopes ?? []);
		hydrateExpandedSet(expandedReferences, saved.expandedReferences ?? []);
		hydrateExpandedSet(expandedUnknowns, saved.expandedUnknowns ?? []);

		isoRef = Array.from({ length: isotopeInfo.length }, () => undefined);
		matRefs = {
			reference: Array.from({ length: materials.reference.length }, () => undefined),
			unknown: Array.from({ length: materials.unknown.length }, () => undefined)
		};
		reconcileIsotopeDependentState();
	}

	function startNewAnalysis() {
		if (browser && !window.confirm('Clear all entered data and start a new analysis?')) {
			return;
		}
		clearDraft();
		goToStep(0, { replace: true });
		title = 'NAA Analysis';
		isotopeInfo = [];
		isoRef = [];
		materials = { reference: [], unknown: [] };
		matRefs = { reference: [], unknown: [] };
		referenceIsotopeSelections = [];
		referenceCatalogItemIds = [];
		catalogReferenceSources.clear();
		isotopeReferenceMap = [];
		validationErrors = [];
		referenceCatalogMessage = '';
		referenceCatalogError = '';
		referenceCatalogWarning = '';
		customReferenceNotice = '';
		isotopeWriteFeedback = {};
		referenceWriteFeedback = {};
		isotopeUploadMode = {};
		referenceUploadMode = {};
		newReferenceName = {};
		isotopeEnergyOverride = {};
		isotopeDup = {};
		referenceDup = {};
		localIsotopeLinks = [];
		fissionChoices = [];
		fissionManualFissile = [];
		fissionBariumHalfLife = { ...DEFAULT_FISSION_BARIUM_HALF_LIFE };
		fissionDraftFactor = {};
		fissionDraftUncertainty = {};
		fissionDraftParent = {};
		fissionDraftUseSpecial = {};
		fissionReviewEditing = {};
		relationshipFeedback = '';
		relationshipConfirm = null;
		relationshipPanelOpen = false;
		isotopePublishConfirm = null;
		referencePublishConfirm = null;
		uploadAllConfirm = null;
		uploadAllResult = '';
		selectedLoadDatasheetId = {};
		datasheetLoadFeedback = {};
		for (const k of Object.keys(isotopeDupKey)) delete isotopeDupKey[Number(k)];
		for (const k of Object.keys(referenceDupKey)) delete referenceDupKey[Number(k)];
		expandedIsotopes.clear();
		expandedReferences.clear();
		expandedUnknowns.clear();
		datasheetLoaderOpen.clear();
	}

	async function handleSignIn() {
		if (!browser) {
			return;
		}
		flushDraft();
		redirectToSignIn();
	}

	// ---- Publish to the shared catalog -----------------------------------

	type WriteFeedback = { ok: boolean; text: string };

	let isotopeWriteBusy = $state<number | null>(null);
	let isotopeWriteFeedback = $state<Record<number, WriteFeedback>>({});

	let referenceWriteBusy = $state<number | null>(null);
	let referenceWriteFeedback = $state<Record<number, WriteFeedback>>({});
	const publishPanelOpen = new SvelteSet<number>();
	const newDatasheetOpen = new SvelteSet<number>();

	let datasheets = $state<SavedDatasheet[]>([]);
	let datasheetsLoading = $state(false);
	let datasheetsError = $state('');
	let datasheetsRequested = false;

	let selectedDatasheetId = $state<Record<number, string>>({});
	let countingLabelByRef = $state<Record<number, string>>({});
	let notesByRef = $state<Record<number, string>>({});
	let datasheetSavingByRef = $state<Record<number, boolean>>({});
	const datasheetFormRefs: Record<number, ReferenceDatasheetForm | undefined> = {};

	// "Load known concentrations from an existing datasheet" — while building a
	// reference material, not just when publishing.
	const datasheetLoaderOpen = new SvelteSet<number>();
	let selectedLoadDatasheetId = $state<Record<number, string>>({});
	let datasheetLoadFeedback = $state<Record<number, string>>({});

	// For entries pulled from the catalog: "update" the existing record or save "new".
	let isotopeUploadMode = $state<Record<number, 'update' | 'new'>>({});
	let referenceUploadMode = $state<Record<number, 'update' | 'new'>>({});
	let newReferenceName = $state<Record<number, string>>({});
	// Editable "energy lines saved to the catalog" list, per isotope card.
	let isotopeEnergyOverride = $state<Record<number, number[]>>({});

	// Pre-flight duplicate lookups, per card.
	type DupState<T> = { checking: boolean; checked: boolean; match: T | null };
	let isotopeDup = $state<Record<number, DupState<CatalogIsotopeMatch>>>({});
	let referenceDup = $state<Record<number, DupState<CatalogReferenceMatch>>>({});
	const isotopeDupKey: Record<number, string> = {};
	const referenceDupKey: Record<number, string> = {};

	// Proxy-measurement relationships ("A measures B") recorded this session.
	let localIsotopeLinks = $state<LocalIsotopeLink[]>([]);
	let relationshipPanelOpen = $state(false);
	let relationshipFeedback = $state('');
	let relationshipForm = $state<IsotopeRelationshipForm>();
	let relationshipBusy = $state(false);

	// Fission-interference correction (7.2 WIP): per-isotope choice of a
	// correction factor (from the `fission-corrections` catalog table or entered
	// by hand), or an explicit 0 for "no fission interference". The subtraction
	// math is not wired up yet — this only records the decision.
	let fissionChoices = $state<FissionChoice[]>([]);
	// Hand-entered fissile concentrations, when the fissile element isn't analysed.
	let fissionManualFissile = $state<FissionManualEntry[]>([]);
	// Hand-entered Ba-140 half-life for the La-140 fission correction (used when it
	// can't be resolved from an analysed Ba-140 isotope or the catalog).
	let fissionBariumHalfLife = $state<FissionBariumHalfLife>({
		...DEFAULT_FISSION_BARIUM_HALF_LIFE
	});
	let fissionRows = $state<FissionCorrectionRecord[]>([]);
	let hasRequestedFissionRows = $state(false);
	// Draft form values for the inline "set correction" control, keyed by isotope
	// index. `bind:value` on a number input yields `number | null`.
	let fissionDraftFactor = $state<Record<number, number | null>>({});
	let fissionDraftUncertainty = $state<Record<number, number | null>>({});
	let fissionDraftParent = $state<Record<number, string>>({});
	// For La-140 only: whether to use the special Ba-140 in-growth correction
	// (true, the default) or a plain flat factor like every other isotope.
	let fissionDraftUseSpecial = $state<Record<number, boolean>>({});
	// Whether the per-isotope fission panel is reopened for editing after being
	// reviewed (it otherwise collapses to a settled, non-warning summary once a
	// choice is recorded — see the "reviewed" derivation below).
	let fissionReviewEditing = $state<Record<number, boolean>>({});
	// Search term for the Step 1 isotope catalog browser — bound so the "find
	// uranium" button in the fission-interference warning can drive it.
	let isotopeCatalogSearch = $state('');
	/** Uranium is the only fissile parent the fission correction is applied for. */
	const URANIUM_NUCLIDES = ['U-235', 'U-238'] as const;
	const HALF_LIFE_UNITS = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'years'] as const;
	function isHalfLifeUnit(unit: string): unit is (typeof HALF_LIFE_UNITS)[number] {
		return (HALF_LIFE_UNITS as readonly string[]).includes(unit);
	}

	/**
	 * A pending upload the user must confirm first. `steps` are shown verbatim;
	 * `run` does the work (dependency publishes + the main POST).
	 */
	type PendingConfirm = {
		kind: 'isotope' | 'reference' | 'relationship' | 'all';
		key: string | number;
		steps: string[];
		run: () => Promise<void>;
	};
	let isotopePublishConfirm = $state<PendingConfirm | null>(null);
	let referencePublishConfirm = $state<PendingConfirm | null>(null);
	let relationshipConfirm = $state<PendingConfirm | null>(null);
	let uploadAllConfirm = $state<PendingConfirm | null>(null);
	let uploadAllBusy = $state(false);
	let uploadAllResult = $state('');

	function cancelConfirm(pending: PendingConfirm) {
		if (pending.kind === 'isotope') isotopePublishConfirm = null;
		else if (pending.kind === 'reference') referencePublishConfirm = null;
		else if (pending.kind === 'relationship') relationshipConfirm = null;
		else uploadAllConfirm = null;
	}

	let writerAccess = $derived(swaAuth.hasRole(WRITER_ROLE));

	async function runIsotopeDupCheck(index: number, parsed: ReturnType<typeof parseIsotopeName>) {
		if (!parsed) {
			return;
		}
		isotopeDup = { ...isotopeDup, [index]: { checking: true, checked: false, match: null } };
		const match = await findCatalogIsotope(parsed);
		isotopeDup = { ...isotopeDup, [index]: { checking: false, checked: true, match } };
	}

	async function runReferenceDupCheck(index: number, identity: { netlCode?: string }) {
		referenceDup = { ...referenceDup, [index]: { checking: true, checked: false, match: null } };
		const match = await findCatalogReferenceMaterial(identity);
		referenceDup = { ...referenceDup, [index]: { checking: false, checked: true, match } };
	}

	/** Energy list to write for isotope `index`: user's edited list, else seeded from the catalog record + current line. */
	function isotopeEnergyList(index: number): number[] {
		const override = isotopeEnergyOverride[index];
		if (override) {
			return override;
		}
		const isotope = isotopeInfo[index];
		if (!isotope) {
			return [];
		}
		const catalogEnergies = isotope.id ? (isotopeCatalogById[isotope.id]?.energies ?? []) : [];
		return normalizeEnergyList([...catalogEnergies, isotope.energy]);
	}

	function setIsotopeEnergiesFromText(index: number, text: string) {
		isotopeEnergyOverride = {
			...isotopeEnergyOverride,
			[index]: normalizeEnergyList(text.split(/[\s,]+/))
		};
	}

	function isotopeCatalogOriginalKey(isotope: IsotopeInfoType): string | null {
		const id = isotope.id?.trim();
		if (!id) {
			return null;
		}
		const item = isotopeCatalogById[id];
		if (!item) {
			return null;
		}
		return `${item.shortName.toLowerCase()}|${item.massNumber}|${(item.suffix ?? '').toLowerCase()}`;
	}

	/** True when the user renamed a catalog isotope so it no longer matches its source record. */
	function isotopeIdentityChanged(isotope: IsotopeInfoType): boolean {
		const originalKey = isotopeCatalogOriginalKey(isotope);
		if (originalKey === null) {
			return false;
		}
		const parsed = parseIsotopeName(isotope.isotopeName);
		return parsed ? isotopeIdentityKey(parsed) !== originalKey : false;
	}

	/** Effective upload mode for isotope `index`, honouring forced-"new" when renamed. */
	function isotopeModeFor(index: number): 'update' | 'new' {
		const isotope = isotopeInfo[index];
		if (!isotope?.id) {
			return 'new';
		}
		if (isotopeIdentityChanged(isotope)) {
			return 'new';
		}
		return isotopeUploadMode[index] ?? 'update';
	}

	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	/** The catalog doc + counting a reference was loaded from, if it can be updated in place. */
	function referenceReplaceTarget(index: number): { itemId: string; countingId: string } | null {
		const value = referenceCatalogItemIds[index];
		if (typeof value !== 'string') {
			return null;
		}
		const parts = value.split('::');
		if (parts.length !== 2 || !parts[0] || !UUID_RE.test(parts[1])) {
			return null;
		}
		return { itemId: parts[0], countingId: parts[1] };
	}

	function referenceModeFor(index: number): 'update' | 'new' {
		if (!referenceReplaceTarget(index)) {
			return 'new';
		}
		return referenceUploadMode[index] ?? 'update';
	}

	/** Selected datasheet id for reference `index`: user's choice, else the material's own (if loaded). */
	function datasheetValueFor(index: number): string {
		const chosen = selectedDatasheetId[index];
		if (chosen !== undefined) {
			return chosen;
		}
		const fromMaterial = materials.reference[index]?.referenceDatasheetId;
		if (fromMaterial && datasheets.some((sheet) => sheet.id === fromMaterial)) {
			return fromMaterial;
		}
		return '';
	}

	/** Reasons the pending isotope upload would be a duplicate / no-op. */
	function isotopeDupBlockers(index: number): string[] {
		const state = isotopeDup[index];
		const isotope = isotopeInfo[index];
		if (!isotope || !state?.checked || !state.match) {
			return [];
		}
		const match = state.match;
		if (isotopeIdentityChanged(isotope)) {
			return [
				`"${isotope.isotopeName}" already exists in the catalog. Use a unique name, or clear the rename to update the original entry.`
			];
		}
		if (isotopeModeFor(index) === 'new') {
			return [
				`"${isotope.isotopeName}" is already in the catalog — choose "Update the existing catalog entry" instead of creating a duplicate.`
			];
		}
		const sameHalfLife =
			Math.abs((match.halfLife?.number ?? NaN) - isotope.halfLife) < 1e-9 &&
			(match.halfLife?.unit ?? '') === (isotope.unit ?? '');
		const want = isotopeEnergyList(index);
		const have = match.energies ?? [];
		const sameEnergies =
			want.length === have.length && want.every((e, i) => Math.abs(e - have[i]) < 1e-6);
		if (sameHalfLife && sameEnergies) {
			return ['This isotope is already in the catalog with identical data — nothing to upload.'];
		}
		return [];
	}

	/** Reasons the pending "save as new" reference upload would collide with an existing entry. */
	function referenceDupBlockers(index: number): string[] {
		const state = referenceDup[index];
		if (!state?.checked || !state.match || referenceModeFor(index) === 'update') {
			return [];
		}
		const match = state.match;
		const countings = `${match.countingCount} counting${match.countingCount === 1 ? '' : 's'}`;
		return [
			`A reference material "${match.netlCode || match.sampleName}" is already in the catalog (${countings}). Use a different NETL code, or load it from the catalog and choose "Update the existing catalog entry".`
		];
	}

	async function loadDatasheets(force = false) {
		if (!browser || (datasheetsRequested && !force)) {
			return;
		}
		datasheetsRequested = true;
		datasheetsLoading = true;
		datasheetsError = '';
		try {
			const response = await fetch('/api/reference-datasheets', {
				headers: { accept: 'application/json' }
			});
			const body = await response.json().catch(() => null);
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					void swaAuth.refresh(true);
				}
				throw new Error(body?.error || `Request failed with status ${response.status}`);
			}
			datasheets = Array.isArray(body?.items)
				? body.items.map((item: SavedDatasheet) => ({
						id: item.id,
						sampleName: item.sampleName,
						entries: Array.isArray(item.entries) ? item.entries : []
					}))
				: [];
		} catch (error) {
			datasheetsError = error instanceof Error ? error.message : 'Unable to load datasheets.';
		} finally {
			datasheetsLoading = false;
		}
	}

	function coveredIsotopesForReference(referenceIndex: number): CoveredIsotope[] {
		return isotopeInfo
			.map((isotope, index) => ({ isotope, index }))
			.filter(({ index }) => referenceCoversIsotope(referenceIndex, index));
	}

	/** Publish an analysis isotope if it isn't in the catalog yet; adopt its id. Returns the id. */
	async function ensureIsotopeInCatalog(isotope: IsotopeInfoType): Promise<string> {
		const existing = isotope.id?.trim();
		if (existing) {
			return existing;
		}
		const result = await saveIsotopeToCatalog(isotope, {
			energies: [isotope.energy],
			mode: 'append'
		});
		const id = result.item?.id;
		if (typeof id !== 'string' || !id) {
			throw new CatalogWriteError(`Could not add ${isotopeLabel(isotope)} to the catalog.`, 500);
		}
		const idx = isotopeInfo.indexOf(isotope);
		if (idx >= 0) {
			isotopeInfo = isotopeInfo.map((iso, i) => (i === idx ? { ...iso, id } : iso));
		}
		return id;
	}

	function isotopePublishBlockers(index: number): string[] {
		const isotope = isotopeInfo[index];
		if (!isotope) {
			return ['Isotope not found.'];
		}
		return [
			...isotopeSaveBlockers(isotope),
			...(isotopeEnergyList(index).length === 0 ? ['Add at least one energy line.'] : []),
			...isotopeDupBlockers(index)
		];
	}

	function isotopePublishSteps(index: number): string[] {
		const isotope = isotopeInfo[index];
		if (!isotope) {
			return [];
		}
		const energies = isotopeEnergyList(index).join(', ');
		const label = isotopeLabel(isotope);
		const writeMode = isotope.id && isotopeModeFor(index) === 'update' ? 'replace' : 'append';
		if (writeMode === 'replace') {
			return [
				`Overwrite the catalog entry for ${label} (half-life, element, and the full energy list: ${energies} keV).`
			];
		}
		return isotope.id
			? [`Add energy lines to the catalog entry for ${label} (${energies} keV).`]
			: [`Add ${label} to the shared catalog (energies ${energies} keV).`];
	}

	/** Execute the isotope publish (caller has already checked auth). Returns success. */
	async function runIsotopePublish(index: number): Promise<boolean> {
		const isotope = isotopeInfo[index];
		if (!isotope) {
			return false;
		}
		const blockers = isotopePublishBlockers(index);
		if (blockers.length > 0) {
			isotopeWriteFeedback = {
				...isotopeWriteFeedback,
				[index]: { ok: false, text: blockers.join(' ') }
			};
			return false;
		}

		const uiMode = isotopeModeFor(index);
		const writeMode: 'append' | 'replace' =
			isotope.id && uiMode === 'update' ? 'replace' : 'append';
		const energies = isotopeEnergyList(index);

		isotopeWriteBusy = index;
		try {
			const result = await saveIsotopeToCatalog(isotope, { energies, mode: writeMode });
			const newId = result.item?.id;
			if (typeof newId === 'string' && newId) {
				isotopeInfo = isotopeInfo.map((iso, i) => (i === index ? { ...iso, id: newId } : iso));
				const savedItem = result.item as unknown as IsotopeCatalogItem | null;
				if (savedItem && Array.isArray(savedItem.energies)) {
					isotopeCatalogById = { ...isotopeCatalogById, [newId]: savedItem };
					isotopeEnergyOverride = { ...isotopeEnergyOverride, [index]: savedItem.energies };
				}
			}
			let text: string;
			if (result.created) {
				text = 'Saved as a new catalog isotope.';
			} else if (writeMode === 'replace') {
				text = 'Updated the catalog entry — half-life, element and energy list overwritten.';
			} else if (uiMode === 'new') {
				text = 'An isotope with this name already exists — your energy lines were merged into it.';
			} else {
				text = 'Updated the catalog entry — new energy lines were merged in.';
			}
			isotopeWriteFeedback = { ...isotopeWriteFeedback, [index]: { ok: true, text } };
			return true;
		} catch (error) {
			if (error instanceof CatalogWriteError && (error.status === 401 || error.status === 403)) {
				void swaAuth.refresh(true);
			}
			isotopeWriteFeedback = {
				...isotopeWriteFeedback,
				[index]: {
					ok: false,
					text: error instanceof Error ? error.message : 'Unable to save isotope.'
				}
			};
			return false;
		} finally {
			isotopeWriteBusy = null;
		}
	}

	async function publishIsotope(index: number) {
		const isotope = isotopeInfo[index];
		if (!isotope) {
			return;
		}
		if (!swaAuth.signedIn) {
			void handleSignIn();
			return;
		}
		if (!writerAccess) {
			isotopeWriteFeedback = {
				...isotopeWriteFeedback,
				[index]: { ok: false, text: `Your account lacks the '${WRITER_ROLE}' role.` }
			};
			return;
		}
		const blockers = isotopePublishBlockers(index);
		if (blockers.length > 0) {
			isotopeWriteFeedback = {
				...isotopeWriteFeedback,
				[index]: { ok: false, text: blockers.join(' ') }
			};
			return;
		}
		isotopePublishConfirm = {
			kind: 'isotope',
			key: index,
			steps: isotopePublishSteps(index),
			run: async () => {
				isotopePublishConfirm = null;
				await runIsotopePublish(index);
			}
		};
	}

	async function createDatasheet(referenceIndex: number) {
		const form = datasheetFormRefs[referenceIndex];
		const payload = form?.getPayload();
		if (!payload) {
			return;
		}
		datasheetSavingByRef = { ...datasheetSavingByRef, [referenceIndex]: true };
		try {
			const saved = await saveReferenceDatasheet(payload);
			datasheets = [saved, ...datasheets];
			selectedDatasheetId = { ...selectedDatasheetId, [referenceIndex]: saved.id };
			newDatasheetOpen.delete(referenceIndex);
			form?.reset();
			referenceWriteFeedback = {
				...referenceWriteFeedback,
				[referenceIndex]: { ok: true, text: `Datasheet "${saved.sampleName}" created.` }
			};
		} catch (error) {
			if (error instanceof CatalogWriteError && (error.status === 401 || error.status === 403)) {
				void swaAuth.refresh(true);
			}
			referenceWriteFeedback = {
				...referenceWriteFeedback,
				[referenceIndex]: {
					ok: false,
					text: error instanceof Error ? error.message : 'Unable to save datasheet.'
				}
			};
		} finally {
			datasheetSavingByRef = { ...datasheetSavingByRef, [referenceIndex]: false };
		}
	}

	function toggleDatasheetLoader(index: number) {
		if (datasheetLoaderOpen.has(index)) {
			datasheetLoaderOpen.delete(index);
		} else {
			datasheetLoaderOpen.add(index);
			void loadDatasheets();
		}
	}

	/** Fill this reference material's known concentrations from a picked datasheet. */
	function loadDatasheetIntoReference(index: number) {
		const reference = materials.reference[index];
		const sheet = datasheets.find((d) => d.id === selectedLoadDatasheetId[index]);
		if (!reference || !sheet) {
			datasheetLoadFeedback = {
				...datasheetLoadFeedback,
				[index]: 'Choose a datasheet first.'
			};
			return;
		}

		const { reference: updated, matchedCount } = applyDatasheetToReference(
			reference,
			isotopeInfo,
			sheet
		);
		materials = {
			...materials,
			reference: materials.reference.map((r, i) => (i === index ? updated : r))
		};
		// Also preselect it for publishing, so it doesn't need to be picked again there.
		selectedDatasheetId = { ...selectedDatasheetId, [index]: sheet.id };

		datasheetLoadFeedback = {
			...datasheetLoadFeedback,
			[index]:
				matchedCount > 0
					? `Loaded known concentrations for ${matchedCount} isotope${matchedCount === 1 ? '' : 's'} from "${sheet.sampleName}".`
					: `"${sheet.sampleName}" didn't match any of your isotopes by name — nothing was changed.`
		};
	}

	type ReferencePublishPlan = {
		writeMode: 'append' | 'new' | 'replace-counting';
		identityOverride?: { netlCode?: string };
		replaceTarget?: { itemId: string; countingId: string };
		needsCatalogIsotopes: IsotopeInfoType[];
		needsDatasheet: boolean;
		seedEntries: ReturnType<typeof datasheetEntriesFromReference>;
		blockers: string[];
		steps: string[];
	};

	function referencePublishPlan(index: number): ReferencePublishPlan {
		const reference = materials.reference[index];
		const covered = coveredIsotopesForReference(index);
		const blockers = [
			...(reference ? referenceMaterialSaveBlockers(reference) : ['Reference not found.']),
			...referenceDupBlockers(index)
		];

		const uiMode = referenceModeFor(index);
		const replaceTarget = referenceReplaceTarget(index) ?? undefined;
		const fromCatalog = typeof referenceCatalogItemIds[index] === 'string';

		let identityOverride: { netlCode?: string } | undefined;
		if (uiMode === 'new' && fromCatalog && reference) {
			const newName = (newReferenceName[index] ?? '').trim();
			if (!newName) {
				blockers.push('Enter a name for the new reference material.');
			} else if (newName === (reference.NETL_code ?? '').trim()) {
				blockers.push('The new NETL code must differ from the current one.');
			} else {
				identityOverride = { netlCode: newName };
			}
		}

		const needsCatalogIsotopes = uncataloguedIsotopes(covered.map((c) => c.isotope));
		const seedEntries = reference ? datasheetEntriesFromReference(reference, covered) : [];
		const needsDatasheet = !datasheetValueFor(index);
		if (needsDatasheet && seedEntries.length === 0) {
			blockers.push(
				'Enter the known concentrations on this material (or pick an existing datasheet) so a datasheet can be created.'
			);
		}

		const writeMode: ReferencePublishPlan['writeMode'] =
			uiMode === 'update' && replaceTarget ? 'replace-counting' : fromCatalog ? 'new' : 'append';

		const mainStep =
			writeMode === 'replace-counting'
				? 'Overwrite the counting on the existing catalog entry.'
				: writeMode === 'new'
					? `Save this reference material to the catalog as "${identityOverride?.netlCode ?? reference?.NETL_code ?? reference?.sampleName}".`
					: fromCatalog
						? 'Add this counting to the existing catalog entry.'
						: 'Save this reference material to the shared catalog.';
		const steps = [
			...needsCatalogIsotopes.map((iso) => `Add ${isotopeLabel(iso)} to the shared catalog.`),
			...(needsDatasheet
				? [
						`Create a reference datasheet ("${reference?.sampleName || reference?.NETL_code}") from this material's ${seedEntries.length} known concentration${seedEntries.length === 1 ? '' : 's'}.`
					]
				: []),
			mainStep
		];

		return {
			writeMode,
			identityOverride,
			replaceTarget,
			needsCatalogIsotopes,
			needsDatasheet,
			seedEntries,
			blockers,
			steps
		};
	}

	/** Execute the reference publish incl. auto-dependencies (caller has checked auth). */
	async function runReferencePublish(index: number): Promise<boolean> {
		const reference = materials.reference[index];
		if (!reference) {
			return false;
		}
		const plan = referencePublishPlan(index);
		if (plan.blockers.length > 0) {
			referenceWriteFeedback = {
				...referenceWriteFeedback,
				[index]: { ok: false, text: plan.blockers.join(' ') }
			};
			return false;
		}

		referenceWriteBusy = index;
		try {
			for (const iso of plan.needsCatalogIsotopes) {
				await ensureIsotopeInCatalog(iso);
			}
			let datasheetId = datasheetValueFor(index);
			if (plan.needsDatasheet) {
				const saved = await saveReferenceDatasheet({
					sampleName: reference.sampleName || reference.NETL_code || 'Reference datasheet',
					entries: plan.seedEntries
				});
				datasheets = [saved, ...datasheets];
				selectedDatasheetId = { ...selectedDatasheetId, [index]: saved.id };
				datasheetId = saved.id;
			}

			const result = await saveReferenceMaterialToCatalog({
				reference,
				covered: coveredIsotopesForReference(index),
				referenceDatasheetId: datasheetId,
				countingLabel: countingLabelByRef[index] ?? 'Counting 1',
				notes: notesByRef[index] ?? '',
				mode: plan.writeMode,
				identityOverride: plan.identityOverride,
				target: plan.replaceTarget
			});
			let text: string;
			if (plan.writeMode === 'replace-counting') {
				text = result.replacedCounting
					? 'Updated the catalog entry in place.'
					: 'The original counting was gone, so this was added to the catalog entry.';
			} else if (result.created) {
				text = 'Saved as a new reference material in the catalog.';
			} else {
				text = `Added a counting to the existing catalog entry (${result.totalCountings} total).`;
			}
			referenceWriteFeedback = { ...referenceWriteFeedback, [index]: { ok: true, text } };
			return true;
		} catch (error) {
			if (error instanceof CatalogWriteError && (error.status === 401 || error.status === 403)) {
				void swaAuth.refresh(true);
			}
			referenceWriteFeedback = {
				...referenceWriteFeedback,
				[index]: {
					ok: false,
					text: error instanceof Error ? error.message : 'Unable to publish reference material.'
				}
			};
			return false;
		} finally {
			referenceWriteBusy = null;
		}
	}

	async function publishReference(index: number) {
		if (!materials.reference[index]) {
			return;
		}
		if (!swaAuth.signedIn) {
			void handleSignIn();
			return;
		}
		if (!writerAccess) {
			referenceWriteFeedback = {
				...referenceWriteFeedback,
				[index]: { ok: false, text: `Your account lacks the '${WRITER_ROLE}' role.` }
			};
			return;
		}
		const plan = referencePublishPlan(index);
		if (plan.blockers.length > 0) {
			referenceWriteFeedback = {
				...referenceWriteFeedback,
				[index]: { ok: false, text: plan.blockers.join(' ') }
			};
			return;
		}
		referencePublishConfirm = {
			kind: 'reference',
			key: index,
			steps: plan.steps,
			run: async () => {
				referencePublishConfirm = null;
				await runReferencePublish(index);
			}
		};
	}

	function togglePublishPanel(referenceIndex: number) {
		if (publishPanelOpen.has(referenceIndex)) {
			publishPanelOpen.delete(referenceIndex);
		} else {
			publishPanelOpen.add(referenceIndex);
			void loadDatasheets();
		}
	}

	// ---- Fission-interference correction ----------------------------------

	function fissionAnchorId(index: number): string {
		return `fission-correction-${index}`;
	}

	/** Jump to an isotope's fission-correction control (from a summary/other step). */
	async function reviewFissionCorrection(index: number) {
		if (step !== STEP.SELECT_ISOTOPES) {
			goToStep(STEP.SELECT_ISOTOPES);
		}
		expandedIsotopes.add(index);
		await tick();
		if (browser) {
			requestAnimationFrame(() => {
				document
					.getElementById(fissionAnchorId(index))
					?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		}
	}

	/**
	 * Fill the Step 1 catalog search with "uranium" and scroll the browser into
	 * view, so the user can add a uranium isotope (the fission correction is only
	 * applied when uranium is part of the analysis).
	 */
	async function findUraniumInCatalog() {
		isotopeCatalogSearch = 'uranium';
		await tick();
		if (browser) {
			requestAnimationFrame(() => {
				document
					.getElementById('isotope-catalog-browser')
					?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}
	}

	function applyFissionRow(index: number, row: FissionCorrectionRecord) {
		const key = fissionIsotopeKey(isotopeInfo[index]);
		fissionChoices = upsertFissionChoice(fissionChoices, key, {
			isotopeKey: key,
			factor: row.correctionFactor,
			uncertainty: row.uncertainty ?? 0,
			mode: 'table',
			fissileNuclide: row.fissileNuclide,
			gammaEnergyKev: row.gammaEnergyKev,
			irradiationPosition: row.irradiationPosition,
			irradiationType: row.irradiationType,
			sourceRowId: row.id,
			...(isLanthanum140(isotopeInfo[index])
				? { useSpecialCorrection: fissionDraftUseSpecial[index] ?? true }
				: {})
		});
		// Reviewed — collapse the panel out of its "editing" / warning state.
		fissionReviewEditing[index] = false;
	}

	function dismissFissionCorrection(index: number) {
		const key = fissionIsotopeKey(isotopeInfo[index]);
		fissionChoices = upsertFissionChoice(fissionChoices, key, {
			isotopeKey: key,
			factor: 0,
			uncertainty: 0,
			mode: 'none'
		});
		fissionReviewEditing[index] = false;
	}

	function applyManualFissionFactor(index: number) {
		const factor = fissionDraftFactor[index];
		if (factor === null || factor === undefined || !Number.isFinite(factor)) {
			return;
		}
		const rawUnc = fissionDraftUncertainty[index];
		const uncertainty = rawUnc != null && Number.isFinite(rawUnc) && rawUnc >= 0 ? rawUnc : 0;
		const key = fissionIsotopeKey(isotopeInfo[index]);
		fissionChoices = upsertFissionChoice(fissionChoices, key, {
			isotopeKey: key,
			factor,
			uncertainty,
			mode: factor === 0 ? 'none' : 'manual',
			fissileNuclide: factor === 0 ? undefined : (fissionDraftParent[index] ?? URANIUM_NUCLIDES[0]),
			...(isLanthanum140(isotopeInfo[index])
				? { useSpecialCorrection: fissionDraftUseSpecial[index] ?? true }
				: {})
		});
		fissionReviewEditing[index] = false;
	}

	function clearFissionCorrection(index: number) {
		fissionChoices = upsertFissionChoice(
			fissionChoices,
			fissionIsotopeKey(isotopeInfo[index]),
			null
		);
		delete fissionDraftFactor[index];
		delete fissionDraftUncertainty[index];
		delete fissionDraftParent[index];
		delete fissionDraftUseSpecial[index];
		delete fissionReviewEditing[index];
		fissionManualFissile = fissionManualFissile.filter(
			(entry) => entry.isotopeKey !== fissionIsotopeKey(isotopeInfo[index])
		);
	}

	/** The hand-entered fissile-concentration record for a target isotope, if any. */
	function fissionManualEntryFor(isotopeIndex: number): FissionManualEntry | undefined {
		const key = fissionIsotopeKey(isotopeInfo[isotopeIndex]);
		return fissionManualFissile.find((entry) => entry.isotopeKey === key);
	}

	// ---- Proxy-measurement relationships ("A measures B") ------------------

	async function openRelationshipPanel(measuredAnalysisIndex?: number) {
		relationshipPanelOpen = true;
		await tick();
		if (measuredAnalysisIndex !== undefined) {
			relationshipForm?.preset('measured', measuredAnalysisIndex);
		}
		if (browser) {
			requestAnimationFrame(() => {
				document.getElementById('isotope-relationships')?.scrollIntoView({
					behavior: 'smooth',
					block: 'start'
				});
			});
		}
	}

	/** Keep the live entry for an analysis pick (so its id can be adopted later); copy a custom one. */
	function isotopeForLink(iso: IsotopeInfoType): IsotopeInfoType {
		return isotopeInfo.includes(iso) ? iso : ($state.snapshot(iso) as IsotopeInfoType);
	}

	/** Display name of the analysis isotope a local link is currently driving, or null. */
	function analysisIsotopeNameForLink(link: LocalIsotopeLink): string | null {
		const targetId = link.target.id?.trim();
		const targetParsed = parseIsotopeName(link.target.isotopeName ?? '');
		const index = isotopeInfo.findIndex((iso) => {
			const isoId = iso.id?.trim();
			if (targetId && isoId) {
				return targetId === isoId;
			}
			const isoParsed = parseIsotopeName(iso.isotopeName ?? '');
			return Boolean(
				targetParsed &&
				isoParsed &&
				isotopeIdentityKey(targetParsed) === isotopeIdentityKey(isoParsed)
			);
		});
		return index >= 0 ? getIsotopeDisplayName(isotopeInfo[index], index) : null;
	}

	function addRelationship() {
		const selection = relationshipForm?.getSelection();
		if (!selection) {
			return;
		}
		relationshipFeedback = '';
		const link: LocalIsotopeLink = {
			id: browser ? crypto.randomUUID() : `${Date.now()}-${localIsotopeLinks.length}`,
			notes: selection.notes.trim(),
			published: false,
			measured: isotopeForLink(selection.measured.isotope),
			target: isotopeForLink(selection.target.isotope)
		};
		// Skip an exact local duplicate.
		const dup = localIsotopeLinks.some(
			(l) =>
				isotopeLabel(l.measured) === isotopeLabel(link.measured) &&
				isotopeLabel(l.target) === isotopeLabel(link.target)
		);
		if (dup) {
			relationshipFeedback = 'That relationship is already in your list.';
			return;
		}
		localIsotopeLinks = [...localIsotopeLinks, link];
		relationshipForm?.reset();
	}

	function removeRelationship(id: string) {
		localIsotopeLinks = localIsotopeLinks.filter((l) => l.id !== id);
		if (relationshipConfirm?.key === id) {
			relationshipConfirm = null;
		}
	}

	function relationshipPublishSteps(link: LocalIsotopeLink): string[] {
		const m = isotopeLabel(link.measured);
		const t = isotopeLabel(link.target);
		return [
			...(link.measured.id?.trim() ? [] : [`Add ${m} to the shared catalog.`]),
			...(link.target.id?.trim() ? [] : [`Add ${t} to the shared catalog.`]),
			`Record the relationship: ${m} measures ${t}.`
		];
	}

	/** Execute a relationship publish incl. auto-dependencies (caller has checked auth). */
	async function runRelationshipPublish(id: string): Promise<boolean> {
		const link = localIsotopeLinks.find((l) => l.id === id);
		if (!link) {
			return false;
		}
		const m = isotopeLabel(link.measured);
		const t = isotopeLabel(link.target);
		relationshipBusy = true;
		try {
			const measuredId = await ensureIsotopeInCatalog(link.measured);
			const targetId = await ensureIsotopeInCatalog(link.target);
			localIsotopeLinks = localIsotopeLinks.map((l) =>
				l.id === id
					? {
							...l,
							measured: { ...l.measured, id: measuredId },
							target: { ...l.target, id: targetId }
						}
					: l
			);

			if (await findIsotopeMeasurementLink(measuredId, targetId)) {
				localIsotopeLinks = localIsotopeLinks.map((l) =>
					l.id === id ? { ...l, published: true } : l
				);
				relationshipFeedback = `${m} → ${t} is already recorded in the catalog.`;
				return true;
			}

			await saveIsotopeMeasurementLink({
				measuredIsotopeId: measuredId,
				targetIsotopeId: targetId,
				notes: link.notes
			});
			localIsotopeLinks = localIsotopeLinks.map((l) =>
				l.id === id ? { ...l, published: true } : l
			);
			relationshipFeedback = `Recorded: ${m} measures ${t}.`;
			void loadIsotopeMeasurementLinks();
			return true;
		} catch (error) {
			if (error instanceof CatalogWriteError && (error.status === 401 || error.status === 403)) {
				void swaAuth.refresh(true);
			}
			relationshipFeedback =
				error instanceof Error ? error.message : 'Unable to record the relationship.';
			return false;
		} finally {
			relationshipBusy = false;
		}
	}

	async function publishRelationship(id: string) {
		const link = localIsotopeLinks.find((l) => l.id === id);
		if (!link) {
			return;
		}
		if (!swaAuth.signedIn) {
			void handleSignIn();
			return;
		}
		if (!writerAccess) {
			relationshipFeedback = `Your account lacks the '${WRITER_ROLE}' role.`;
			return;
		}
		relationshipFeedback = '';
		relationshipConfirm = {
			kind: 'relationship',
			key: id,
			steps: relationshipPublishSteps(link),
			run: async () => {
				relationshipConfirm = null;
				await runRelationshipPublish(id);
			}
		};
	}

	// ---- "Upload all" (the `pending*` deriveds live further down, after state) --

	function uploadAllSteps(): string[] {
		const isotopeAdds: string[] = [];
		const addIso = (label: string) => {
			if (!isotopeAdds.includes(label)) isotopeAdds.push(label);
		};
		for (const i of pendingIsotopeIndices) {
			addIso(isotopeLabel(isotopeInfo[i]));
		}
		for (const i of pendingReferenceIndices) {
			for (const iso of referencePublishPlan(i).needsCatalogIsotopes) {
				addIso(isotopeLabel(iso));
			}
		}
		for (const l of pendingRelationships) {
			if (!l.measured.id?.trim()) addIso(isotopeLabel(l.measured));
			if (!l.target.id?.trim()) addIso(isotopeLabel(l.target));
		}
		const steps: string[] = [];
		if (isotopeAdds.length > 0) {
			steps.push(`Add ${isotopeAdds.join(', ')} to the shared catalog.`);
		}
		for (const i of pendingReferenceIndices) {
			const ref = materials.reference[i];
			steps.push(
				`Publish the reference material "${ref.NETL_code || ref.sampleName || `Reference ${i + 1}`}" (creating its datasheet if needed).`
			);
		}
		for (const l of pendingRelationships) {
			steps.push(`Record: ${isotopeLabel(l.measured)} measures ${isotopeLabel(l.target)}.`);
		}
		return steps;
	}

	async function uploadAll() {
		if (!swaAuth.signedIn) {
			void handleSignIn();
			return;
		}
		if (!writerAccess) {
			uploadAllResult = `Your account lacks the '${WRITER_ROLE}' role.`;
			return;
		}
		const isoIdx = [...pendingIsotopeIndices];
		const refIdx = [...pendingReferenceIndices];
		const linkIds = pendingRelationships.map((l) => l.id);
		if (isoIdx.length + refIdx.length + linkIds.length === 0) {
			uploadAllResult = 'Nothing new to upload.';
			return;
		}
		uploadAllResult = '';
		uploadAllConfirm = {
			kind: 'all',
			key: 'all',
			steps: uploadAllSteps(),
			run: async () => {
				uploadAllConfirm = null;
				uploadAllBusy = true;
				let ok = 0;
				let fail = 0;
				try {
					for (const i of isoIdx) {
						if (await runIsotopePublish(i)) ok++;
						else fail++;
					}
					for (const i of refIdx) {
						if (await runReferencePublish(i)) ok++;
						else fail++;
					}
					for (const id of linkIds) {
						if (await runRelationshipPublish(id)) ok++;
						else fail++;
					}
				} finally {
					uploadAllBusy = false;
				}
				uploadAllResult =
					fail === 0
						? `Uploaded ${ok} item${ok === 1 ? '' : 's'} to the shared catalog.`
						: `Uploaded ${ok}; ${fail} failed — check the message on each item.`;
			}
		};
	}

	let step = $state(0);

	// Shallow-routing (pushState/replaceState) can only be used once SvelteKit's
	// router is initialized. afterNavigate fires during hydration *just before*
	// the router flips its internal `started` flag, so defer to a microtask.
	let routerReady = false;
	let draftHydrated = false;

	// Seed the current history entry with the current step so browser back/forward
	// has a target. Only meaningful once the router is ready and the draft has
	// been restored, and only if we haven't already stamped this entry.
	function seedStepHistory() {
		if (browser && routerReady && draftHydrated && page.state.wizardStep === undefined) {
			replaceState('', { ...page.state, wizardStep: step });
		}
	}

	afterNavigate(() => {
		queueMicrotask(() => {
			routerReady = true;
			seedStepHistory();
		});
	});

	let title = $state('NAA Analysis');

	// array of isotope information
	let isotopeInfo: IsotopeInfoType[] = $state([]);
	// holds the reference to each isotope info component (only set while a pane is open)
	let isoRef: (IsotopeInfo | undefined)[] = $state([]);

	let materials = $state<{ reference: ReferenceMaterial[]; unknown: UnknownMaterial[] }>({
		reference: [],
		unknown: []
	});
	let matRefs = $state({
		reference: [] as (RefMatInfo | undefined)[],
		unknown: [] as (MaterialInfo | undefined)[]
	});
	let referenceIsotopeSelections = $state<Set<string>[]>([]);
	let referenceCatalogItemIds = $state<(string | null)[]>([]);
	/**
	 * The catalog item + counting each catalog-sourced reference was built from,
	 * keyed by its `referenceCatalogItemIds` selection id. Kept so coverage can be
	 * recomputed when a proxy relationship is recorded *after* the reference was
	 * added (see `reconcileCatalogReferenceCoverage`). Not persisted — after a
	 * reload the reference's data is already materialised; a re-pick is only needed
	 * to pick up a newly-recorded relationship on an old draft.
	 */
	const catalogReferenceSources = new SvelteMap<
		string,
		{ item: ReferenceMaterialCatalogItem; counting: ReferenceMaterialCatalogCounting }
	>();
	let referenceCatalogMessage = $state('');
	let referenceCatalogError = $state('');
	let referenceCatalogWarning = $state('');
	let customReferenceNotice = $state('');
	let referenceListEl = $state<HTMLDivElement>();
	let isotopeMeasurementLinks = $state<IsotopeMeasurementLink[]>([]);

	/** API-loaded proxy links plus the ones recorded locally this session. */
	let allMeasurementLinks = $derived<IsotopeMeasurementLink[]>([
		...isotopeMeasurementLinks,
		...localIsotopeLinks.map((link) => ({
			id: link.id,
			measuredIsotope: { isotopeId: link.measured.id ?? '' },
			targetIsotope: { isotopeId: link.target.id ?? '' }
		}))
	]);

	// New items "Upload all" would publish (blocker-free, not yet in the catalog).
	let pendingIsotopeIndices = $derived(
		isotopeInfo
			.map((_, i) => i)
			.filter((i) => !isotopeInfo[i].id?.trim() && isotopePublishBlockers(i).length === 0)
	);
	let pendingReferenceIndices = $derived(
		materials.reference
			.map((_, i) => i)
			.filter(
				(i) => referenceCatalogItemIds[i] === null && referencePublishPlan(i).blockers.length === 0
			)
	);
	let pendingRelationships = $derived(localIsotopeLinks.filter((l) => !l.published));
	let pendingUploadCount = $derived(
		pendingIsotopeIndices.length + pendingReferenceIndices.length + pendingRelationships.length
	);

	let isotopeCatalogById = $state<Record<string, IsotopeCatalogItem>>({});
	let hasRequestedIsotopeCatalog = $state(false);
	let hasRequestedIsotopeMeasurementLinks = $state(false);
	let isotopeReferenceMap = $state<number[]>([]);

	let catalogAvailable = $state(false);

	const expandedIsotopes = new SvelteSet<number>();
	const expandedReferences = new SvelteSet<number>();
	const expandedUnknowns = new SvelteSet<number>();

	// isotope / material counts are derived from the working lists
	let isotopeCount = $derived(isotopeInfo.length);
	let referenceCount = $derived(materials.reference.length);
	// Proxy measurements ("A measures B"): for each analysis isotope B, the
	// measured isotope A (from a local or catalog relationship) whose half-life /
	// gamma line the computation should use. `mathIsotopeInfo` is `isotopeInfo`
	// with A's nuclear data substituted in for proxy rows — the result is still
	// reported for B. Kept index-aligned with `isotopeInfo`.
	let proxyByIsotope = $derived(
		isotopeInfo.map((iso) =>
			resolveProxyMeasured(iso, {
				localLinks: localIsotopeLinks,
				catalogLinks: isotopeMeasurementLinks,
				catalogById: isotopeCatalogById
			})
		)
	);
	let mathIsotopeInfo = $derived(
		isotopeInfo.map((iso, i) => applyProxyMeasured(iso, proxyByIsotope[i]))
	);

	/**
	 * Per-isotope "you may have made a mistake" prompts (name/label element
	 * mismatch, or a well-known proxy nuclide reporting its own element), surfaced
	 * as a summary at the top of Step 1 rather than buried under each card.
	 */
	let isotopeWarnings = $derived(
		isotopeInfo
			.map((isotope, index) => {
				const mismatch = isotopeElementMismatch(isotope);
				if (mismatch) {
					return {
						index,
						text: `${isotope.isotopeName || `Isotope ${index + 1}`} looks like a ${mismatch.nameElement} isotope but is labelled ${mismatch.labelElement}. If it stands in for measuring a ${mismatch.labelElement} isotope, record that.`
					};
				}
				const hint = proxyByIsotope[index] ? null : knownProxyHint(isotope);
				if (hint) {
					return {
						index,
						text: `${isotope.isotopeName} is usually detected to measure ${hint.targetElement} (${hint.note}). This entry will report a ${hint.proxyElement} concentration — if you meant ${hint.targetElement}, record that.`
					};
				}
				return null;
			})
			.filter((w): w is { index: number; text: string } => w !== null)
	);

	/**
	 * Selected isotopes that can carry a fission-interference contribution —
	 * either the `fission-corrections` catalog has a matching row, or the isotope
	 * is a well-known fission product. Each carries the matching catalog rows and
	 * the user's current choice (if any).
	 */
	let fissionCandidates = $derived(
		isotopeInfo
			.map((isotope, index) => {
				const rows = matchingFissionRows(isotope, fissionRows);
				if (rows.length === 0 && !isKnownFissionProduct(isotope)) {
					return null;
				}
				return {
					index,
					isotope,
					rows,
					choice: findFissionChoice(fissionChoices, isotope)
				};
			})
			.filter(
				(
					c
				): c is {
					index: number;
					isotope: IsotopeInfoType;
					rows: FissionCorrectionRecord[];
					choice: FissionChoice | null;
				} => c !== null
			)
	);
	/**
	 * Whether uranium is one of the analysed isotopes — its fissile concentration
	 * then comes from the normal comparator computation. When it isn't, the same
	 * correction still applies as long as its concentration is typed in by hand
	 * on the reference material and unknowns (see `fissionFissileInputGroups`).
	 */
	let hasUraniumAnalyzed = $derived(isotopeInfo.some((iso) => isotopeIsElement(iso, 'U')));
	let unreviewedFissionCount = $derived(
		fissionCandidates.filter((c) => !isFissionCandidateReviewed(c)).length
	);
	/** Fission candidates not yet fully reviewed (picked a factor or dismissed — see {@link isFissionCandidateReviewed}). */
	let unresolvedFissionCandidates = $derived(
		fissionCandidates.filter((c) => !isFissionCandidateReviewed(c))
	);
	let fissionCandidateByIndex = $derived(new Map(fissionCandidates.map((c) => [c.index, c])));

	function halfLifeSecondsOrNull(halfLife: number, unit: string): number | null {
		if (!(halfLife > 0)) {
			return null;
		}
		try {
			const seconds = isoGA({ halfLife, unit } as IsotopeInfoType).halfLifeSeconds;
			return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
		} catch {
			return null;
		}
	}

	/**
	 * Ba-140 half-life auto-resolved from an analysed Ba-140 isotope, else the
	 * isotope catalog — the two "database" sources for the La-140 precursor
	 * in-growth term. `null` when neither has it.
	 */
	let resolvedBariumHalfLife = $derived.by<{
		value: number;
		unit: (typeof HALF_LIFE_UNITS)[number];
		source: 'isotope' | 'catalog';
	} | null>(() => {
		const isoBa = isotopeInfo.find((iso) => isBarium140(iso) && iso.halfLife > 0);
		if (isoBa && isHalfLifeUnit(isoBa.unit)) {
			return { value: isoBa.halfLife, unit: isoBa.unit, source: 'isotope' };
		}
		const catBa = Object.values(isotopeCatalogById).find(
			(item) =>
				item?.shortName?.toLowerCase() === 'ba' &&
				Number(item?.massNumber) === 140 &&
				!(item?.suffix ?? '').trim()
		);
		if (catBa?.halfLife && catBa.halfLife.number > 0) {
			return { value: catBa.halfLife.number, unit: catBa.halfLife.unit, source: 'catalog' };
		}
		return null;
	});

	/** True while the Ba-140 half-life field still holds the auto-resolved value (not hand-overridden). */
	let fissionBariumHalfLifeIsAuto = $derived(
		resolvedBariumHalfLife !== null &&
			fissionBariumHalfLife.value === resolvedBariumHalfLife.value &&
			fissionBariumHalfLife.unit === resolvedBariumHalfLife.unit
	);

	// Pre-fill the Ba-140 half-life field as soon as it can be resolved, so the
	// user sees the actual number the correction will use rather than a blank,
	// seemingly-required field. Only fires while the field is still empty, so a
	// hand-entered override is never clobbered.
	$effect(() => {
		if (resolvedBariumHalfLife && fissionBariumHalfLife.value == null) {
			fissionBariumHalfLife = {
				value: resolvedBariumHalfLife.value,
				unit: resolvedBariumHalfLife.unit
			};
		}
	});

	/**
	 * Ba-140 decay constant (per second) for the La-140 precursor in-growth:
	 * the (possibly auto-filled) half-life field, else the resolved isotope /
	 * catalog value directly. `null` when neither is available.
	 */
	let bariumDecayConstant = $derived.by<number | null>(() => {
		let seconds: number | null = null;

		if (fissionBariumHalfLife.value && fissionBariumHalfLife.value > 0) {
			seconds = halfLifeSecondsOrNull(fissionBariumHalfLife.value, fissionBariumHalfLife.unit);
		}

		if (seconds == null && resolvedBariumHalfLife) {
			seconds = halfLifeSecondsOrNull(resolvedBariumHalfLife.value, resolvedBariumHalfLife.unit);
		}

		return seconds != null && seconds > 0 ? Math.LN2 / seconds : null;
	});

	/** Reset the Ba-140 half-life field to the auto-resolved value (clears a hand override). */
	function resetBariumHalfLifeToDetected() {
		fissionBariumHalfLife = { value: null, unit: fissionBariumHalfLife.unit };
	}

	/**
	 * A fission-interference choice only "counts" as reviewed once it's actually
	 * complete: dismissed, or a plain factor — or, for the La-140 special
	 * correction, once the Ba-140 half-life is resolved too. The correction can't
	 * run without it, so the warning has to stay up until then.
	 */
	function isFissionCandidateReviewed(candidate: {
		isotope: IsotopeInfoType;
		choice: FissionChoice | null;
	}): boolean {
		const choice = candidate.choice;
		if (!choice) {
			return false;
		}
		if (choice.mode === 'none') {
			return true;
		}
		if (isLanthanum140(candidate.isotope) && choice.useSpecialCorrection !== false) {
			return bariumDecayConstant !== null;
		}
		return true;
	}

	// computed isotope information
	let isoComp = $derived(mathIsotopeInfo.map(isoGA));

	let matComp = $derived({
		reference: materials.reference.map((ref) => matGA(ref)),
		unknown: materials.unknown.map((unk) => matGA(unk))
	});
	let matIsoComp = $derived(
		mathIsotopeInfo.map((iso, index) => ({
			reference: materials.reference.map((ref) => matIsoGA(ref, iso, index)),
			unknown: materials.unknown.map((unk) => matIsoGA(unk, iso, index))
		}))
	);
	let multiMatComp = $derived(
		materials.reference.map((ref) => materials.unknown.map((unk) => MMGA(ref, unk)))
	);

	const ENERGY_MATCH_TOLERANCE_KEV = 0.5;

	function getFiniteEnergy(value: number | null | undefined): number | null {
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function energiesMatch(targetEnergy: number | null, catalogEnergy: number | null): boolean {
		if (targetEnergy === null || catalogEnergy === null) {
			return false;
		}

		return Math.abs(targetEnergy - catalogEnergy) <= ENERGY_MATCH_TOLERANCE_KEV;
	}

	function getIsotopeSelectionKey(index: number): string {
		return `isotope:${index}`;
	}

	function extractMeasurementLinkId(
		link: IsotopeMeasurementLink,
		side: 'measured' | 'target'
	): string {
		const entry = side === 'measured' ? link.measuredIsotope : link.targetIsotope;
		return (entry.isotopeId ?? entry.id ?? '').trim();
	}

	function getCatalogMatchCandidateIds(targetId: string): string[] {
		const candidateIds = [targetId];

		for (const link of allMeasurementLinks) {
			const measuredId = extractMeasurementLinkId(link, 'measured');
			const linkedTargetId = extractMeasurementLinkId(link, 'target');

			if (
				linkedTargetId === targetId &&
				measuredId.length > 0 &&
				!candidateIds.includes(measuredId)
			) {
				candidateIds.push(measuredId);
			}
		}

		return candidateIds;
	}

	function getCatalogIsotopeDisplayName(isotopeId: string): string {
		const catalogItem = isotopeCatalogById[isotopeId];
		if (!catalogItem) {
			return isotopeId;
		}

		return `${catalogItem.shortName}-${catalogItem.massNumber}${catalogItem.suffix}`;
	}

	let selectableReferenceCatalogIsotopeIds = $derived.by(() => {
		const isotopeIds: string[] = [];

		for (const isotope of isotopeInfo) {
			const targetId = isotope.id?.trim();
			if (!targetId) {
				continue;
			}

			for (const candidateId of getCatalogMatchCandidateIds(targetId)) {
				if (!isotopeIds.includes(candidateId)) {
					isotopeIds.push(candidateId);
				}
			}
		}

		return isotopeIds;
	});

	function getLinkedReferenceIndex(index: number): number {
		const linkedReference = isotopeInfo[index]?.linkedReference;
		if (linkedReference !== undefined && linkedReference >= 0 && linkedReference < referenceCount) {
			return linkedReference;
		}
		return 0;
	}

	/**
	 * Does reference `referenceIndex` provide data for isotope `isotopeIndex`?
	 * A catalog reference covers exactly the isotope rows it was matched against.
	 * A custom reference with no explicit isotope selection covers every isotope
	 * (this mirrors `refMatInfo.svelte`'s "empty selection = all enabled").
	 */
	function referenceCoversIsotope(referenceIndex: number, isotopeIndex: number): boolean {
		const selection = referenceIsotopeSelections[referenceIndex];
		if (selection instanceof Set && selection.has(getIsotopeSelectionKey(isotopeIndex))) {
			return true;
		}
		return (
			referenceCatalogItemIds[referenceIndex] === null &&
			(!(selection instanceof Set) || selection.size === 0)
		);
	}

	$effect(() => {
		const currentMap = isotopeReferenceMap ?? [];
		const nextMap = Array.from({ length: isotopeCount }, (_, index) => {
			const coveringRefs = materials.reference
				.map((_, refIndex) => (referenceCoversIsotope(refIndex, index) ? refIndex : -1))
				.filter((refIndex) => refIndex >= 0 && refIndex < referenceCount);

			const linkedReference = isotopeInfo[index]?.linkedReference;
			if (
				typeof linkedReference === 'number' &&
				coveringRefs.includes(linkedReference) &&
				linkedReference >= 0 &&
				linkedReference < referenceCount
			) {
				return linkedReference;
			}

			const currentReference = currentMap[index];
			if (
				typeof currentReference === 'number' &&
				coveringRefs.includes(currentReference) &&
				currentReference >= 0 &&
				currentReference < referenceCount
			) {
				return currentReference;
			}

			if (coveringRefs.length > 0) {
				return coveringRefs[0];
			}

			const fallback = isotopeInfo[index]?.linkedReference ?? 0;
			return fallback >= 0 && fallback < referenceCount ? fallback : 0;
		});

		const changed =
			nextMap.length !== currentMap.length ||
			nextMap.some((value, index) => value !== currentMap[index]);

		if (changed) {
			isotopeReferenceMap = nextMap;
		}

		const needsIsotopeSync = nextMap.some(
			(linkedReference, index) => isotopeInfo[index]?.linkedReference !== linkedReference
		);
		if (needsIsotopeSync) {
			isotopeInfo = isotopeInfo.map((iso, index) => ({
				...iso,
				linkedReference: nextMap[index] ?? 0
			}));
		}
	});

	let everythingComp = $derived(
		materials.reference.length === 0
			? isotopeInfo.map(() => [] as ReturnType<typeof EGA>[])
			: mathIsotopeInfo.map((iso, index) => {
					const referenceIndex = getLinkedReferenceIndex(index);
					const reference = materials.reference[referenceIndex] ?? materials.reference[0];
					return materials.unknown.map((unk) => EGA(reference, unk, iso, index));
				})
	);

	/**
	 * Fission-interference correction per (interfering isotope, unknown), keyed
	 * `"<isotopeIndex>:<unknownIndex>"`. Built from the Step 1 `fissionChoices`
	 * plus the computed results — no separate approval state. `applied: false`
	 * with a `note` means the inputs to the formula could not be resolved.
	 */
	let fissionResults = $derived(
		computeFissionResults({
			// Uranium's concentration comes from an analysed isotope when there is
			// one, else from the hand-entered value on the reference material /
			// unknowns (`manualFissile` below) — computeFissionResults tries both.
			candidates: fissionCandidates.map((c) => ({ index: c.index, choice: c.choice })),
			isotopeInfo,
			references: materials.reference,
			unknowns: materials.unknown,
			everythingComp,
			linkedReferenceIndex: getLinkedReferenceIndex,
			manualFissile: fissionManualFissile,
			bariumDecayConstant
		})
	);

	let appliedFissionResults = $derived(
		[...fissionResults.values()].filter((result) => result.applied)
	);
	let blockedFissionResults = $derived(
		[...fissionResults.values()].filter((result) => !result.applied && result.note !== '')
	);
	/** True when a La-140 correction is blocked purely on the missing Ba-140 half-life. */
	let fissionNeedsBariumHalfLife = $derived(
		[...fissionResults.values()].some((result) => result.needsBariumHalfLife)
	);
	/** Blocked results grouped by target isotope, for the "enter concentrations" prompt. */
	let fissionFissileInputGroups = $derived.by(() => {
		const groups = new Map<
			number,
			{ isotopeIndex: number; unit: ConcUnitType; fissileElementLabel: string; note: string }
		>();
		for (const result of fissionResults.values()) {
			if (result.needsFissileInput && !groups.has(result.isotopeIndex)) {
				groups.set(result.isotopeIndex, {
					isotopeIndex: result.isotopeIndex,
					unit: result.unit,
					fissileElementLabel: result.fissileElementLabel,
					note: result.note
				});
			}
		}
		return [...groups.values()];
	});

	/**
	 * Fission candidates with an active correction (a factor chosen, not
	 * dismissed) whose uranium concentration needs typing in on the reference
	 * material and unknowns, because uranium isn't analysed. Unlike
	 * `fissionFissileInputGroups` this doesn't wait for the target isotope's own
	 * comparator result to be computable — the input fields show up as soon as a
	 * correction is picked, so there's always somewhere to enter the value
	 * rather than the fields only appearing once everything else is filled in.
	 */
	let fissionUraniumEntryTargets = $derived(
		hasUraniumAnalyzed ? [] : fissionCandidates.filter((c) => c.choice && c.choice.factor > 0)
	);

	/** The unit the target isotope's own concentration is reported in (from its linked reference). */
	function fissionTargetUnit(isotopeIndex: number): ConcUnitType {
		const refIndex = getLinkedReferenceIndex(isotopeIndex);
		return materials.reference[refIndex]?.concentrationUnits?.[isotopeIndex];
	}

	/** (unknown, linked-reference) pairs counted in different modes — surfaced on the Review step. */
	let countingModeMismatches = $derived.by(() => {
		const modeOf = (m?: { countingMode?: string }) =>
			m?.countingMode === 'compton' ? 'compton' : 'normal';
		const seen: string[] = [];
		const out: {
			unknownLabel: string;
			referenceLabel: string;
			unknownMode: string;
			referenceMode: string;
		}[] = [];
		materials.unknown.forEach((unk, uIndex) => {
			isotopeInfo.forEach((_, iIndex) => {
				const rIndex = getLinkedReferenceIndex(iIndex);
				const ref = materials.reference[rIndex];
				if (!ref) {
					return;
				}
				const key = `${uIndex}::${rIndex}`;
				if (seen.includes(key)) {
					return;
				}
				seen.push(key);
				if (modeOf(unk) !== modeOf(ref)) {
					out.push({
						unknownLabel: unk.NETL_code || unk.sampleName || `Unknown ${uIndex + 1}`,
						referenceLabel: ref.NETL_code || ref.sampleName || `Reference ${rIndex + 1}`,
						unknownMode: modeOf(unk),
						referenceMode: modeOf(ref)
					});
				}
			});
		});
		return out;
	});

	let nextButtonText = $derived(getNextButtonText(step));
	let backButtonText = $derived(getBackButtonText(step));
	let stepTitle = $derived(getStepTitle(step));
	let stepType = $derived(getStepType(step));
	let progressPercentage = $derived(getProgressPercentage(step));
	const totalSteps = REVIEW_STEP;
	let showProgress = $derived(step > 0);

	// Memoized function to prevent recreation on every render
	let getRoiIndexFn = $derived((roiData: { centroid: number }[]) =>
		findRoiIndices(mathIsotopeInfo, roiData)
	);

	// Validation state
	let validationErrors: string[] = $state([]);

	$effect(() => {
		if (!browser) {
			return;
		}

		// One-time hydration — never let the reads inside restoreDraft() make this
		// effect reactive (it would re-hydrate on every edit).
		untrack(() => {
			restoreDraft();
			draftHydrated = true;
			seedStepHistory();
			analysisMeta.registerWelcomeHandler(() => {
				goToStep(0);
			});
		});
		void swaAuth.refresh();

		let cancelled = false;

		void detectCatalogAvailability().then((available) => {
			if (!cancelled) {
				catalogAvailable = available;
			}
		});

		// Belt-and-braces: flush the debounced draft if the tab is hidden/closed.
		const flushOnHide = () => flushDraft();
		window.addEventListener('pagehide', flushOnHide);
		window.addEventListener('visibilitychange', flushOnHide);

		return () => {
			cancelled = true;
			window.removeEventListener('pagehide', flushOnHide);
			window.removeEventListener('visibilitychange', flushOnHide);
		};
	});

	// Surface the experiment title in the layout header.
	$effect(() => {
		analysisMeta.title = title;
	});

	// Follow the browser back/forward buttons: SvelteKit restores page.state for
	// the history entry being navigated to, so mirror its wizardStep back onto
	// `step`. Our own goToStep() pushes matching state, so this is a no-op then.
	$effect(() => {
		const historyStep = page.state.wizardStep;
		if (!browser || typeof historyStep !== 'number') {
			return;
		}
		untrack(() => {
			const clamped = Math.min(Math.max(Math.trunc(historyStep), 0), totalSteps);
			if (clamped !== step) {
				step = clamped;
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}
		});
	});

	// Continuously autosave the whole wizard to localStorage. Only "Start new
	// analysis" clears it, so a sign-in redirect / refresh / tab close is safe.
	$effect(() => {
		// Deep-read every persisted field so this effect re-runs on any change.
		const serialized = JSON.stringify(currentDraft());
		if (!draftHydrated) {
			return;
		}
		void serialized;
		scheduleDraftSave();
	});

	// Pre-flight duplicate lookups: as identities change, ask the catalog whether
	// the isotope / reference already exists so the panels can warn before upload.
	// Read-only (GET /api/*?q=), so it runs whenever the catalog is reachable —
	// no sign-in required.
	$effect(() => {
		if (!browser || !catalogAvailable) {
			return;
		}

		for (let i = 0; i < isotopeInfo.length; i++) {
			const parsed = isotopeInfo[i] ? parseIsotopeName(isotopeInfo[i].isotopeName) : null;
			const key = parsed ? isotopeIdentityKey(parsed) : '';
			if (key && isotopeDupKey[i] !== key) {
				isotopeDupKey[i] = key;
				void runIsotopeDupCheck(i, parsed);
			}
		}

		for (let i = 0; i < materials.reference.length; i++) {
			if (!publishPanelOpen.has(i)) {
				continue;
			}
			const ref = materials.reference[i];
			const name =
				referenceModeFor(i) === 'new' && typeof referenceCatalogItemIds[i] === 'string'
					? (newReferenceName[i] ?? '').trim()
					: (ref?.NETL_code ?? '').trim() || (ref?.sampleName ?? '').trim();
			const key = `${referenceModeFor(i)}|${name}`;
			if (name && referenceDupKey[i] !== key) {
				referenceDupKey[i] = key;
				void runReferenceDupCheck(i, { netlCode: name });
			}
		}
	});

	// Keep the per-isotope arrays on every material aligned with the isotope list.
	$effect(() => {
		void isotopeInfo.length;
		untrack(reconcileIsotopeDependentState);
	});

	// Drop fission-interference choices / manual inputs whose isotope is gone.
	$effect(() => {
		const identities = isotopeInfo.map((iso) => `${iso.elementName}|${iso.isotopeName}`).join(',');
		void identities;
		untrack(() => {
			const pruned = pruneFissionChoices(fissionChoices, isotopeInfo);
			if (pruned.length !== fissionChoices.length) {
				fissionChoices = pruned;
			}
			const prunedManual = pruneManualFissile(fissionManualFissile, isotopeInfo);
			if (prunedManual.length !== fissionManualFissile.length) {
				fissionManualFissile = prunedManual;
			}
		});
	});

	// Create a backing manual-input entry for every target isotope that needs one.
	$effect(() => {
		const needed = fissionUraniumEntryTargets.map((candidate) => ({
			index: candidate.index,
			unit: fissionTargetUnit(candidate.index)
		}));
		const unknownCount = materials.unknown.length;
		untrack(() => {
			for (const { index, unit } of needed) {
				const key = fissionIsotopeKey(isotopeInfo[index]);
				const existing = fissionManualFissile.find((entry) => entry.isotopeKey === key);
				if (!existing) {
					fissionManualFissile = upsertManualFissile(fissionManualFissile, {
						isotopeKey: key,
						unit,
						inStandard: null,
						inUnknown: Array.from({ length: unknownCount }, () => ({
							value: null,
							uncertainty: null
						}))
					});
				} else {
					if (existing.inUnknown.length < unknownCount) {
						existing.inUnknown = [
							...existing.inUnknown,
							...Array.from({ length: unknownCount - existing.inUnknown.length }, () => ({
								value: null,
								uncertainty: null
							}))
						];
					}
					// The entry can be created before a reference material exists (and
					// so before its unit is knowable) — keep it in sync once it is.
					if (unit && existing.unit !== unit) {
						existing.unit = unit;
					}
				}
			}
		});
	});

	// Give the inline "fissile parent" select (and, for La-140, the special vs
	// standard correction-type choice) a concrete starting value.
	$effect(() => {
		const indices = fissionCandidates.map((candidate) => candidate.index);
		untrack(() => {
			for (const index of indices) {
				const existing = fissionChoices.find(
					(c) => c.isotopeKey === fissionIsotopeKey(isotopeInfo[index])
				);
				fissionDraftParent[index] ??= existing?.fissileNuclide ?? URANIUM_NUCLIDES[0];
				fissionDraftUseSpecial[index] ??= existing?.useSpecialCorrection ?? true;
			}
		});
	});

	$effect(() => {
		if (!browser || !catalogAvailable) {
			return;
		}

		if (!hasRequestedIsotopeCatalog) {
			hasRequestedIsotopeCatalog = true;
			void loadIsotopeCatalog();
		}

		if (!hasRequestedIsotopeMeasurementLinks) {
			hasRequestedIsotopeMeasurementLinks = true;
			void loadIsotopeMeasurementLinks();
		}

		if (!hasRequestedFissionRows) {
			hasRequestedFissionRows = true;
			void loadFissionRows();
		}
	});

	function getUsedIsotopeLabels(referenceIndex: number): Set<string> {
		const used = new Set<string>();
		for (let i = 0; i < referenceIsotopeSelections.length; i++) {
			if (i === referenceIndex) {
				continue;
			}
			const selection = referenceIsotopeSelections[i];
			if (!selection) continue;
			for (const label of selection) {
				used.add(label);
			}
		}
		return used;
	}

	function findCatalogIsotopeMatch(
		targetIsotope: IsotopeInfoType,
		catalogItem: ReferenceMaterialCatalogItem,
		usedIndices: Set<number>
	): { sourceIndex: number; matchedIsotopeId: string | null } {
		const isotopes = Array.isArray(catalogItem.isotopes) ? catalogItem.isotopes : [];
		const targetId = targetIsotope.id?.trim();
		const targetEnergy = getFiniteEnergy(targetIsotope.energy);

		if (!targetId) {
			return { sourceIndex: -1, matchedIsotopeId: null };
		}

		const candidateIds = getCatalogMatchCandidateIds(targetId);
		const idMatches: Array<{ index: number; isotopeId: string }> = [];

		for (const candidateId of candidateIds) {
			for (let index = 0; index < isotopes.length; index++) {
				if (!usedIndices.has(index) && isotopes[index]?.isotopeId === candidateId) {
					idMatches.push({ index, isotopeId: candidateId });
				}
			}
		}

		if (idMatches.length === 0) {
			return { sourceIndex: -1, matchedIsotopeId: null };
		}

		if (targetEnergy === null) {
			return { sourceIndex: idMatches[0].index, matchedIsotopeId: idMatches[0].isotopeId };
		}

		for (const match of idMatches) {
			const catalogEnergy = getFiniteEnergy(isotopes[match.index]?.energy);
			if (energiesMatch(targetEnergy, catalogEnergy)) {
				return { sourceIndex: match.index, matchedIsotopeId: match.isotopeId };
			}
		}

		// Backward-compatible fallback for legacy catalog entries that don't carry energy.
		if (idMatches.length === 1 && getFiniteEnergy(isotopes[idMatches[0].index]?.energy) === null) {
			return { sourceIndex: idMatches[0].index, matchedIsotopeId: idMatches[0].isotopeId };
		}

		return { sourceIndex: -1, matchedIsotopeId: null };
	}

	async function loadIsotopeCatalog() {
		const apiUrl = import.meta.env.PUBLIC_ISOTOPE_API_URL?.trim() || '/api/isotopes';

		try {
			// Page through the whole catalog (needed for reference/proxy matching).
			const all: IsotopeCatalogItem[] = [];
			let continuation: string | null = null;
			for (let guard = 0; guard < 50; guard++) {
				const url = new URL(apiUrl, window.location.origin);
				url.searchParams.set('limit', '200');
				if (continuation) {
					url.searchParams.set('continuation', continuation);
				}
				const response = await fetch(url, { headers: { accept: 'application/json' } });
				const body = await response.json().catch(() => null);
				if (!response.ok) {
					return;
				}
				catalogStatus.noteResponse(body);
				if (Array.isArray(body?.items)) {
					all.push(...(body.items as IsotopeCatalogItem[]));
				}
				continuation = typeof body?.continuation === 'string' ? body.continuation : null;
				if (!continuation) {
					break;
				}
			}

			isotopeCatalogById = Object.fromEntries(
				all
					.filter((item) => typeof item?.id === 'string' && item.id.trim().length > 0)
					.map((item) => [item.id, item])
			);
		} catch {
			// Best effort only. Direct isotope matching still works without the catalog.
		}
	}

	async function loadIsotopeMeasurementLinks() {
		try {
			const response = await fetch('/api/isotope-measurements', {
				headers: {
					accept: 'application/json'
				}
			});

			const body = await response.json().catch(() => null);
			if (!response.ok) {
				return;
			}

			isotopeMeasurementLinks = Array.isArray(body?.items) ? body.items : [];
		} catch {
			// Best effort only. Direct isotope matching still works without proxy links.
		}
	}

	async function loadFissionRows() {
		try {
			fissionRows = await listFissionCorrections();
		} catch {
			// Best effort only — the known-fission-product list still raises the
			// prompt, and the user can enter a factor by hand.
			fissionRows = [];
		}
	}

	function getCatalogSelectionId(
		itemId: string,
		counting: ReferenceMaterialCatalogCounting | null | undefined
	): string {
		const countingId = counting?.countingId?.trim();
		if (countingId) {
			return `${itemId}::${countingId}`;
		}

		const material = counting?.referenceMaterial;
		const countingLabel = counting?.countingLabel?.trim() ?? 'counting';
		const createdAt = counting?.createdAt?.trim() ?? '';
		const measurementStart = material?.measurementStartTime?.trim?.() ?? '';
		const irradiationEnd = material?.irradiationEnd?.trim?.() ?? '';
		const irradiationType = material?.irradiationType?.trim?.() ?? '';
		const countingMode = material?.countingMode?.trim?.() ?? '';

		return `${itemId}::${countingLabel}::${createdAt}::${measurementStart}::${irradiationEnd}::${irradiationType}::${countingMode}`;
	}

	function applyReferenceMaterialCatalogItem(
		item: ReferenceMaterialCatalogItem,
		selectedCounting?: ReferenceMaterialCatalogCounting
	) {
		referenceCatalogMessage = '';
		referenceCatalogError = '';
		referenceCatalogWarning = '';
		customReferenceNotice = '';

		const sourceCounting = selectedCounting ?? item.latestCounting ?? undefined;
		const selectionId = getCatalogSelectionId(item.id, sourceCounting);

		if (referenceCatalogItemIds.includes(selectionId)) {
			referenceCatalogError = 'This reference irradiation is already selected.';
			return;
		}

		const sourceMaterial = sourceCounting?.referenceMaterial;
		if (!sourceCounting || !sourceMaterial) {
			referenceCatalogError = 'Selected catalog entry does not contain a saved counting.';
			return;
		}

		const nextReference = createReferenceMaterial(isotopeCount);
		nextReference.NETL_code = sourceMaterial.NETL_code;
		nextReference.sampleName = sourceMaterial.sampleName;
		nextReference.mass = sourceMaterial.mass;
		nextReference.reactorPower = sourceMaterial.reactorPower ?? 0;
		nextReference.irradiationTime = sourceMaterial.irradiationTime;
		nextReference.irradiationEnd = sourceMaterial.irradiationEnd;
		nextReference.measurementStartTime = sourceMaterial.measurementStartTime;
		nextReference.decayTime = sourceMaterial.decayTime;
		nextReference.liveTime = sourceMaterial.liveTime;
		nextReference.realTime = sourceMaterial.realTime;
		nextReference.fluence = sourceMaterial.fluence;
		nextReference.irradiationType = sourceMaterial.irradiationType;
		nextReference.dtType = sourceMaterial.dtType;
		nextReference.countingMode = sourceMaterial.countingMode === 'compton' ? 'compton' : 'normal';
		nextReference.referenceDatasheetId = sourceMaterial.referenceDatasheetId;

		const { matched, proxyWarnings } = matchCatalogCounting(item, sourceMaterial);

		if (matched.length === 0) {
			referenceCatalogError =
				'This reference irradiation does not cover any currently selected isotopes.';
			return;
		}

		const matchedSelection = new SvelteSet<string>();
		for (const { index, data } of matched) {
			matchedSelection.add(getIsotopeSelectionKey(index));
			nextReference.counts[index] = data.count;
			nextReference.knownConcentration[index] = data.concentration;
			nextReference.knownUncertainty[index] = data.uncertainty;
			nextReference.concentrationUnits[index] = data.unit;
		}

		materials = {
			...materials,
			reference: [...materials.reference, nextReference]
		};
		referenceIsotopeSelections = [...referenceIsotopeSelections, matchedSelection];
		referenceCatalogItemIds = [...referenceCatalogItemIds, selectionId];
		catalogReferenceSources.set(selectionId, { item, counting: sourceCounting });
		matRefs.reference = [...matRefs.reference, undefined];
		updateIsotopeReferenceMap(isotopeCount, materials.reference.length);

		referenceCatalogMessage = `Added ${sourceMaterial.NETL_code} (${sourceMaterial.sampleName})${sourceMaterial.irradiationType ? ` [${sourceMaterial.irradiationType}]` : ''}. Covers ${matchedSelection.size} isotope row(s).`;
		referenceCatalogWarning = proxyWarnings.join(' ');
	}

	type CatalogCoverageData = {
		count: CountDataType;
		concentration: number;
		uncertainty: number;
		unit: ConcUnitType;
	};

	/**
	 * Match a catalog counting's isotopes against the current analysis isotopes
	 * (relationship-aware, via `findCatalogIsotopeMatch` →
	 * `getCatalogMatchCandidateIds`). Returns the per-analysis-isotope data to
	 * copy plus any "selected X but measured Y" proxy warnings.
	 */
	function matchCatalogCounting(
		item: ReferenceMaterialCatalogItem,
		sourceMaterial: ReferenceMaterial
	): { matched: Array<{ index: number; data: CatalogCoverageData }>; proxyWarnings: string[] } {
		const sourceCounts = Array.isArray(sourceMaterial.counts) ? sourceMaterial.counts : [];
		const sourceConcentrations = Array.isArray(sourceMaterial.knownConcentration)
			? sourceMaterial.knownConcentration
			: [];
		const sourceUncertainties = Array.isArray(sourceMaterial.knownUncertainty)
			? sourceMaterial.knownUncertainty
			: [];
		const sourceUnits = Array.isArray(sourceMaterial.concentrationUnits)
			? sourceMaterial.concentrationUnits
			: [];

		const usedIndices = new SvelteSet<number>();
		const matched: Array<{ index: number; data: CatalogCoverageData }> = [];
		const proxyWarnings: string[] = [];

		for (let index = 0; index < isotopeCount; index++) {
			const match = findCatalogIsotopeMatch(isotopeInfo[index], item, usedIndices);
			const sourceIndex = match.sourceIndex;
			if (sourceIndex < 0) {
				continue;
			}
			usedIndices.add(sourceIndex);

			const targetId = isotopeInfo[index]?.id?.trim();
			if (targetId && match.matchedIsotopeId && match.matchedIsotopeId !== targetId) {
				const warning = `${getIsotopeDisplayName(isotopeInfo[index], index)} is selected for analysis, but ${getCatalogIsotopeDisplayName(match.matchedIsotopeId)} is measured in this reference irradiation.`;
				if (!proxyWarnings.includes(warning)) {
					proxyWarnings.push(warning);
				}
			}

			matched.push({
				index,
				data: {
					count: {
						grossCounts: sourceCounts[sourceIndex]?.grossCounts ?? 0,
						netCounts: sourceCounts[sourceIndex]?.netCounts ?? 0,
						uncertainty: sourceCounts[sourceIndex]?.uncertainty ?? 0,
						grossCountsPositionalCorrectionFactor:
							sourceCounts[sourceIndex]?.grossCountsPositionalCorrectionFactor ?? 1,
						netCountsPositionalCorrectionFactor:
							sourceCounts[sourceIndex]?.netCountsPositionalCorrectionFactor ?? 1,
						uncertaintyPositionalCorrectionFactor:
							sourceCounts[sourceIndex]?.uncertaintyPositionalCorrectionFactor ?? 1
					},
					concentration: sourceConcentrations[sourceIndex] ?? 0,
					uncertainty: sourceUncertainties[sourceIndex] ?? 0,
					unit: sourceUnits[sourceIndex]
				}
			});
		}

		return { matched, proxyWarnings };
	}

	/**
	 * Re-match every catalog-sourced reference against its stored counting and
	 * fold in any isotope rows that are *newly* covered — e.g. after the user
	 * records an "A measures B" relationship that lets a reference which counted A
	 * cover the analysis's B. Only ever adds coverage (and copies data for the
	 * added rows); existing rows, including any the user edited, are left alone.
	 */
	function reconcileCatalogReferenceCoverage() {
		if (catalogReferenceSources.size === 0) {
			return;
		}
		const nextReferences = [...materials.reference];
		const nextSelections = [...referenceIsotopeSelections];
		let mutated = false;

		for (let i = 0; i < nextReferences.length; i++) {
			const selectionId = referenceCatalogItemIds[i];
			if (typeof selectionId !== 'string') {
				continue;
			}
			const source = catalogReferenceSources.get(selectionId);
			const sourceMaterial = source?.counting?.referenceMaterial;
			if (!source || !sourceMaterial) {
				continue;
			}

			const current = nextSelections[i] ?? new SvelteSet<string>();
			const { matched } = matchCatalogCounting(source.item, sourceMaterial);
			const added = matched.filter(({ index }) => !current.has(getIsotopeSelectionKey(index)));
			if (added.length === 0) {
				continue;
			}

			const ref = nextReferences[i];
			const updated: ReferenceMaterial = {
				...ref,
				counts: [...ref.counts],
				knownConcentration: [...ref.knownConcentration],
				knownUncertainty: [...ref.knownUncertainty],
				concentrationUnits: [...ref.concentrationUnits]
			};
			const nextSelection = new SvelteSet(current);
			for (const { index, data } of added) {
				updated.counts[index] = data.count;
				updated.knownConcentration[index] = data.concentration;
				updated.knownUncertainty[index] = data.uncertainty;
				updated.concentrationUnits[index] = data.unit;
				nextSelection.add(getIsotopeSelectionKey(index));
			}
			nextReferences[i] = updated;
			nextSelections[i] = nextSelection;
			mutated = true;
		}

		if (mutated) {
			materials = { ...materials, reference: nextReferences };
			referenceIsotopeSelections = nextSelections;
			updateIsotopeReferenceMap(isotopeCount, nextReferences.length);
		}
	}

	$effect(() => {
		void allMeasurementLinks;
		void isotopeInfo.length;
		void isotopeCatalogById;
		untrack(() => reconcileCatalogReferenceCoverage());
	});

	function addCustomIsotope(overrides: Partial<IsotopeInfoType> = {}) {
		isotopeInfo = [...isotopeInfo, { ...createIsotopeInfo(), ...overrides }];
		isoRef = [...isoRef, undefined];
		expandedIsotopes.add(isotopeInfo.length - 1);
	}

	/**
	 * Add a custom isotope pre-filled as uranium ("Uranium" / "U-") for the user
	 * to finish, and scroll its card into view. Used from the fission-interference
	 * warning when uranium isn't part of the analysis yet.
	 */
	async function addCustomUraniumIsotope() {
		addCustomIsotope({ elementName: 'Uranium', isotopeName: 'U-' });
		const newIndex = isotopeInfo.length - 1;
		await tick();
		if (browser) {
			requestAnimationFrame(() => {
				document
					.getElementById(`isotope-card-${newIndex}`)
					?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		}
	}

	function removeIsotope(isotopeIndex: number) {
		if (isotopeIndex < 0 || isotopeIndex >= isotopeInfo.length) {
			return;
		}

		const dropAt = <T,>(arr: T[]): T[] => arr.filter((_, index) => index !== isotopeIndex);

		isotopeInfo = dropAt(isotopeInfo).map((iso) => ({ ...iso }));
		isoRef = dropAt(isoRef);

		materials = {
			reference: materials.reference.map((ref) => ({
				...ref,
				counts: dropAt(ref.counts ?? []),
				knownConcentration: dropAt(ref.knownConcentration ?? []),
				knownUncertainty: dropAt(ref.knownUncertainty ?? []),
				concentrationUnits: dropAt(ref.concentrationUnits ?? [])
			})),
			unknown: materials.unknown.map((unk) => ({
				...unk,
				counts: dropAt(unk.counts ?? [])
			}))
		};

		referenceIsotopeSelections = referenceIsotopeSelections.map((selection) => {
			const next = new Set<string>();
			if (selection instanceof Set) {
				for (const key of selection) {
					const index = Number(key.slice('isotope:'.length));
					if (Number.isNaN(index)) {
						continue;
					}
					if (index < isotopeIndex) {
						next.add(key);
					} else if (index > isotopeIndex) {
						next.add(getIsotopeSelectionKey(index - 1));
					}
				}
			}
			return next;
		});

		remapExpandedAfterRemoval(expandedIsotopes, isotopeIndex);
		updateIsotopeReferenceMap(isotopeInfo.length, materials.reference.length);
	}

	async function addCustomReference() {
		referenceCatalogMessage = '';
		referenceCatalogError = '';
		referenceCatalogWarning = '';

		materials = {
			...materials,
			reference: [...materials.reference, createReferenceMaterial(isotopeCount)]
		};
		referenceIsotopeSelections = [...referenceIsotopeSelections, new Set<string>()];
		referenceCatalogItemIds = [...referenceCatalogItemIds, null];
		matRefs.reference = [...matRefs.reference, undefined];
		expandedReferences.add(materials.reference.length - 1);
		updateIsotopeReferenceMap(isotopeCount, materials.reference.length);

		customReferenceNotice = `Added Reference ${materials.reference.length}. Fill in its details in "Library entries" below.`;
		await tick();
		scrollNewCardIntoView();
	}

	/** Scroll the last card in the library list to just below the sticky header. */
	function scrollNewCardIntoView() {
		if (!browser) {
			return;
		}
		requestAnimationFrame(() => {
			const card = referenceListEl?.lastElementChild as HTMLElement | null;
			if (!card) {
				return;
			}
			const STICKY_NAV_OFFSET = 88;
			const top = card.getBoundingClientRect().top + window.scrollY - STICKY_NAV_OFFSET;
			window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
		});
	}

	function removeReference(referenceIndex: number) {
		if (referenceIndex < 0 || referenceIndex >= materials.reference.length) {
			return;
		}

		referenceCatalogMessage = '';
		referenceCatalogError = '';
		referenceCatalogWarning = '';
		customReferenceNotice = '';

		const removedSelectionId = referenceCatalogItemIds[referenceIndex];
		if (typeof removedSelectionId === 'string') {
			catalogReferenceSources.delete(removedSelectionId);
		}

		materials = {
			...materials,
			reference: materials.reference.filter((_, index) => index !== referenceIndex)
		};
		referenceIsotopeSelections = referenceIsotopeSelections.filter(
			(_, index) => index !== referenceIndex
		);
		referenceCatalogItemIds = referenceCatalogItemIds.filter(
			(_, index) => index !== referenceIndex
		);
		matRefs.reference = matRefs.reference.filter((_, index) => index !== referenceIndex);
		remapExpandedAfterRemoval(expandedReferences, referenceIndex);

		updateIsotopeReferenceMap(isotopeCount, materials.reference.length);
	}

	function addUnknown() {
		materials = {
			...materials,
			unknown: [...materials.unknown, createUnknownMaterial(isotopeCount)]
		};
		matRefs.unknown = [...matRefs.unknown, undefined];
		expandedUnknowns.add(materials.unknown.length - 1);
	}

	function removeUnknown(unknownIndex: number) {
		if (unknownIndex < 0 || unknownIndex >= materials.unknown.length) {
			return;
		}

		materials = {
			...materials,
			unknown: materials.unknown.filter((_, index) => index !== unknownIndex)
		};
		matRefs.unknown = matRefs.unknown.filter((_, index) => index !== unknownIndex);
		remapExpandedAfterRemoval(expandedUnknowns, unknownIndex);
	}

	function getCoveringReferenceIndicesForIsotope(isotopeIndex: number): number[] {
		return materials.reference
			.map((_, referenceIndex) =>
				referenceCoversIsotope(referenceIndex, isotopeIndex) ? referenceIndex : -1
			)
			.filter((referenceIndex) => referenceIndex >= 0 && referenceIndex < referenceCount);
	}

	function setReferenceForIsotope(isotopeIndex: number, referenceIndex: number) {
		const coveringReferences = getCoveringReferenceIndicesForIsotope(isotopeIndex);
		if (!coveringReferences.includes(referenceIndex)) {
			return;
		}

		isotopeInfo = isotopeInfo.map((iso, index) =>
			index === isotopeIndex
				? {
						...iso,
						linkedReference: referenceIndex
					}
				: iso
		);
	}

	function enabledIsotopeIndicesForReference(referenceIndex: number): number[] {
		const selection = referenceIsotopeSelections[referenceIndex];
		const used = getUsedIsotopeLabels(referenceIndex);
		const indices: number[] = [];
		for (let i = 0; i < isotopeInfo.length; i++) {
			const key = getIsotopeSelectionKey(i);
			if (used.has(key)) {
				continue;
			}
			if (selection instanceof Set && selection.size > 0 && !selection.has(key)) {
				continue;
			}
			indices.push(i);
		}
		return indices;
	}

	function getIsotopeDisplayName(isotope: IsotopeInfoType | undefined, index: number): string {
		if (!isotope) {
			return `Isotope ${index + 1}`;
		}

		const energy = getFiniteEnergy(isotope.energy);
		// Plain number — no thousands separators.
		const energyLabel = energy !== null ? ` @ ${energy} keV` : '';
		const proxy = proxyByIsotope[index];
		const proxyLabel = proxy ? ` (via ${describeProxyMeasured(proxy)})` : '';

		if (isotope.elementName && isotope.isotopeName) {
			return `${isotope.elementName}-${isotope.isotopeName}${energyLabel}${proxyLabel}`;
		}

		return `Isotope ${index + 1}${energyLabel}${proxyLabel}`;
	}

	/**
	 * Column label for the results table / CSV. An element measured by a single
	 * isotope row is shown just as the element ("Uranium"); when the same element
	 * is analysed more than once — two isotopes, or two energies of one isotope —
	 * every row for it falls back to the full isotope/energy name so they can be
	 * told apart.
	 */
	function getResultColumnName(isotope: IsotopeInfoType | undefined, index: number): string {
		const element = isotope?.elementName?.trim();
		if (!element) {
			return getIsotopeDisplayName(isotope, index);
		}
		const sameElementCount = isotopeInfo.filter(
			(other) => other?.elementName?.trim() === element
		).length;
		return sameElementCount > 1 ? getIsotopeDisplayName(isotope, index) : element;
	}

	function expandIsotope(index: number) {
		expandedIsotopes.add(index);
	}

	function expandReference(index: number) {
		expandedReferences.add(index);
	}

	function expandUnknown(index: number) {
		expandedUnknowns.add(index);
	}

	function validateCurrentStep(): boolean {
		validationErrors = [];

		if (stepType === StepType.SELECT_ISOTOPES) {
			if (isotopeInfo.length < 1) {
				validationErrors = ['Add at least one isotope to analyze.'];
				return false;
			}

			const problems: string[] = [];
			isotopeInfo.forEach((iso, index) => {
				const errors = getIsotopeErrors(iso);
				if (errors.length > 0) {
					expandIsotope(index);
					const label = getIsotopeDisplayName(iso, index);
					problems.push(...errors.map((error) => `${label}: ${error}`));
				}
			});

			if (problems.length > 0) {
				validationErrors = problems;
				return false;
			}
		}

		if (stepType === StepType.BUILD_LIBRARY) {
			if (materials.reference.length === 0) {
				validationErrors = [
					catalogAvailable
						? 'Add at least one reference material — enter a custom one or load one from the catalog.'
						: 'Add at least one custom reference material.'
				];
				return false;
			}

			const problems: string[] = [];
			materials.reference.forEach((reference, index) => {
				const errors = getReferenceMaterialErrors(
					reference,
					enabledIsotopeIndicesForReference(index),
					(isotopeIndex) => getIsotopeDisplayName(isotopeInfo[isotopeIndex], isotopeIndex)
				);
				if (errors.length > 0) {
					expandReference(index);
					const label = getReferenceLabel(index);
					problems.push(...errors.map((error) => `${label}: ${error}`));
				}
			});

			if (problems.length > 0) {
				validationErrors = problems;
				return false;
			}

			const uncovered = isotopeInfo
				.map((iso, index) => ({ iso, index }))
				.filter(({ index }) => getCoveringReferenceIndicesForIsotope(index).length === 0)
				.map(({ iso, index }) => getIsotopeDisplayName(iso, index));

			if (uncovered.length > 0) {
				validationErrors = [
					`These isotopes are not covered by any reference material: ${uncovered.join(', ')}`
				];
				return false;
			}
		}

		if (stepType === StepType.UNKNOWN_MATERIALS) {
			if (materials.unknown.length < 1) {
				validationErrors = ['Add at least one unknown material.'];
				return false;
			}

			const problems: string[] = [];
			materials.unknown.forEach((unknown, index) => {
				const errors = getBaseMaterialErrors(unknown);
				if (errors.length > 0) {
					expandUnknown(index);
					const label = unknown.NETL_code || `Unknown ${index + 1}`;
					problems.push(...errors.map((error) => `${label}: ${error}`));
				}
			});

			if (problems.length > 0) {
				validationErrors = problems;
				return false;
			}
		}

		return true;
	}

	function getReferenceLabel(index: number): string {
		const ref = materials.reference[index];
		const labelBase = ref?.NETL_code || ref?.sampleName || `Reference ${index + 1}`;
		const details = [
			ref?.irradiationType ? ref.irradiationType : '',
			ref?.measurementStartTime ? new Date(ref.measurementStartTime).toLocaleString() : '',
			ref?.irradiationEnd ? new Date(ref.irradiationEnd).toLocaleString() : ''
		].filter(Boolean);

		return details.length > 0 ? `${labelBase} — ${details.join(' · ')}` : labelBase;
	}

	function getReferenceSourceLabel(index: number): string {
		return referenceCatalogItemIds[index] ? 'From catalog' : 'Custom (session only)';
	}

	function handleReferenceMaterialSelect(
		item: ReferenceMaterialCatalogItem,
		counting: ReferenceMaterialCatalogCounting
	) {
		applyReferenceMaterialCatalogItem(item, counting);
	}

	function revealInlineValidationErrors() {
		if (stepType === StepType.SELECT_ISOTOPES) {
			isoRef.forEach((ref) => ref?.showValidationErrors?.());
		} else if (stepType === StepType.BUILD_LIBRARY) {
			matRefs.reference.forEach((ref) => ref?.showValidationErrors?.());
		} else if (stepType === StepType.UNKNOWN_MATERIALS) {
			matRefs.unknown.forEach((ref) => ref?.showValidationErrors?.());
		}
	}

	/**
	 * Move the wizard to `target`, keeping the browser history in sync so the
	 * back/forward buttons walk through visited steps. `replace` swaps the current
	 * history entry instead of adding one (used for restore / reset, not for
	 * ordinary navigation).
	 */
	function goToStep(target: number, { replace = false }: { replace?: boolean } = {}) {
		const clamped = Math.min(Math.max(Math.trunc(target), 0), totalSteps);
		const leavingStep = step;
		step = clamped;
		if (!browser || !routerReady) {
			return;
		}
		if (replace) {
			replaceState('', { ...page.state, wizardStep: clamped });
			return;
		}
		if (clamped === leavingStep) {
			return;
		}
		// Every step change starts back at the top of the page.
		window.scrollTo({ top: 0, behavior: 'smooth' });
		// Make sure the entry we're leaving carries its own step, so pressing Back
		// from the new entry restores it rather than falling out of the app.
		if (page.state.wizardStep === undefined) {
			replaceState('', { ...page.state, wizardStep: leavingStep });
		}
		pushState('', { ...page.state, wizardStep: clamped });
	}

	const next = async () => {
		// Prevent navigating beyond the final review step
		if (step >= totalSteps) return;

		// Clear previous errors
		validationErrors = [];

		// Validate before proceeding (skip validation only for the welcome step).
		// Failures are surfaced in the validationErrors banner, by expanding the
		// offending cards, and by inline field errors once those cards mount.
		if (step > 0 && step < totalSteps) {
			if (!validateCurrentStep()) {
				await tick();
				revealInlineValidationErrors();
				if (browser) {
					window.scrollTo({ top: 0, behavior: 'smooth' });
				}
				return;
			}
		}

		goToStep(step + 1);
	};
	const prev = () => {
		if (step <= 0) return;
		goToStep(step - 1);
	};

	function downloadTableAsCSV() {
		// Helper function to escape CSV fields
		const escapeCSV = (value: any): string => {
			const str = String(value ?? '');
			// If the field contains comma, quote, or newline, wrap it in quotes and escape internal quotes
			if (str.includes(',') || str.includes('"') || str.includes('\n')) {
				return `"${str.replace(/"/g, '""')}"`;
			}
			// replace 'ppm' with 'µg/g' for better readability in CSV
			if (str === 'ppm') {
				return 'µg/g';
			}
			return str;
		};

		// Create CSV header row with concentration and uncertainty columns
		const headers = [
			'',
			...isotopeInfo.flatMap((iso, index) => {
				const name = getResultColumnName(iso, index);
				return [escapeCSV(name), escapeCSV(`${name} Uncertainty`)];
			})
		];
		const csvRows = [headers.join(',')];

		// Add units row
		const unitsRow = [
			'Units',
			...isotopeInfo.flatMap((_, index) => {
				const referenceIndex = getLinkedReferenceIndex(index);
				const reference = materials.reference[referenceIndex] ?? materials.reference[0];
				return [escapeCSV(reference?.concentrationUnits[index] || ''), '%'];
			})
		];
		csvRows.push(unitsRow.join(','));

		// Add data rows for each unknown material (fission-corrected where applied)
		materials.unknown.forEach((unk, uIndex) => {
			const unknownLabel = unk.NETL_code || `Unknown ${uIndex + 1}`;
			const row = [
				escapeCSV(unknownLabel),
				...isotopeInfo.flatMap((_, iIndex) => {
					const comp = everythingComp[iIndex][uIndex];
					const fission = fissionResults.get(`${iIndex}:${uIndex}`);
					const applied = Boolean(fission && fission.applied);
					const shown = applied ? fission!.corrected : comp.unknownConcentration;
					const shownUnc = applied
						? fission!.correctedUncertaintyAbsolute
						: comp.unknownConcentrationUncertaintyAbsolute;
					return [escapeCSV(roundResult(shown)), escapeCSV(roundToMatch(shownUnc, shown))];
				})
			];
			csvRows.push(row.join(','));

			const detectionLimitRow = [
				escapeCSV(`${unknownLabel} Conc Det Lim`),
				...isotopeInfo.flatMap((_, iIndex) => [
					escapeCSV(roundResult(everythingComp[iIndex][uIndex].concentrationDetectionLimit)),
					escapeCSV('')
				])
			];
			csvRows.push(detectionLimitRow.join(','));
		});

		// Fission-interference correction breakdown
		const appliedFission = [...fissionResults.values()].filter((r) => r.applied);
		if (appliedFission.length > 0) {
			csvRows.push('');
			csvRows.push('Fission interference corrections');
			csvRows.push(
				[
					'Isotope',
					'Unknown',
					'Fissile parent',
					'f',
					'k',
					'C_target^S',
					'C_fissile^S',
					'C_fissile^U',
					'Uncorrected',
					'Uncorrected uncertainty',
					'Corrected',
					'Corrected uncertainty'
				]
					.map(escapeCSV)
					.join(',')
			);
			for (const r of appliedFission) {
				csvRows.push(
					[
						getResultColumnName(isotopeInfo[r.isotopeIndex], r.isotopeIndex),
						materials.unknown[r.unknownIndex]?.NETL_code || `Unknown ${r.unknownIndex + 1}`,
						r.fissileElementLabel,
						r.f,
						r.k.toPrecision(4),
						roundResult(r.cTargetStandard),
						roundResult(r.cFissileStandard),
						roundResult(r.cFissileUnknown),
						roundResult(r.uncorrected),
						roundToMatch(r.uncorrectedUncertaintyAbsolute, r.uncorrected),
						roundResult(r.corrected),
						roundToMatch(r.correctedUncertaintyAbsolute, r.corrected)
					]
						.map(escapeCSV)
						.join(',')
				);
			}
		}

		// Create CSV string
		const csvContent = csvRows.join('\n');

		// Create blob and download link
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);

		link.setAttribute('href', url);
		link.setAttribute('download', `${title}.csv`);
		link.style.visibility = 'hidden';

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	const handleSubmit = () => {};

	// Keyboard navigation
	const handleKeyPress = (e: KeyboardEvent) => {
		if (e.ctrlKey || e.metaKey) {
			if (e.key === 'ArrowRight' && step < totalSteps) {
				e.preventDefault();
				next();
			} else if (e.key === 'ArrowLeft' && step > 0) {
				e.preventDefault();
				prev();
			}
		}
	};
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<svelte:window onkeydown={handleKeyPress} />

{#snippet confirmBox(pending: PendingConfirm | null, busy: boolean)}
	{#if pending}
		<div class="mt-2 space-y-2 rounded border-2 border-primary-500 preset-tonal-primary p-3">
			<p class="font-bold">Before uploading, confirm this will:</p>
			<ol class="ml-5 list-decimal space-y-1 text-sm">
				{#each pending.steps as stepText, i (i)}<li>{stepText}</li>{/each}
			</ol>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn preset-filled-primary-500"
					disabled={busy}
					onclick={() => pending.run()}
				>
					{busy ? 'Working…' : 'Confirm & upload'}
				</button>
				<button
					type="button"
					class="btn preset-tonal-surface"
					disabled={busy}
					onclick={() => cancelConfirm(pending)}
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}
{/snippet}

{#snippet unreviewedFissionNotice()}
	{#if unreviewedFissionCount > 0}
		<div
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-warning-500 preset-tonal-warning p-3 text-sm"
		>
			<span>
				⚠ {unreviewedFissionCount}
				{unreviewedFissionCount === 1 ? 'isotope has' : 'isotopes have'} unreviewed fission-interference
				potential. Set a correction factor (or 0) in Step 1.
			</span>
			<button
				type="button"
				class="btn shrink-0 preset-tonal-surface"
				onclick={() => goToStep(STEP.SELECT_ISOTOPES)}
			>
				Go to Select Isotopes
			</button>
		</div>
	{/if}
{/snippet}

{#snippet fissionModeBadge(isLanthanumFlag: boolean)}
	<span
		class="ml-1 inline-block rounded px-1.5 py-0.5 align-middle text-xs font-semibold {isLanthanumFlag
			? 'bg-primary-500/20 text-primary-700-300'
			: 'bg-surface-500/20 text-surface-700-300'}"
		title={isLanthanumFlag
			? 'La-140, thermal irradiation only: the factor is computed per sample from the Ba-140 → La-140 in-growth, not a flat number.'
			: 'A single flat factor, applied the same way to the standard and the unknown — recommended for epithermal/fast irradiation.'}
	>
		{isLanthanumFlag
			? 'Special correction — Ba-140 in-growth'
			: 'Standard correction — flat factor'}
	</span>
{/snippet}

{#snippet stepNavButtons()}
	<button type="button" class="btn preset-tonal-surface text-xl" onclick={prev}>
		{backButtonText}
	</button>
	{#if stepType !== StepType.REVIEW}
		<button type="button" class="btn preset-filled-primary-500 text-xl" onclick={next}>
			{nextButtonText}
		</button>
	{/if}
{/snippet}

<div style="padding: 5%">
	<h1 class="text-3xl font-bold">NAA Analysis Software - Version {APP_VERSION}</h1>
	<br />
	<h2 class="text-2xl font-bold">Current Experiment: {title}</h2>
	<br />

	{#if showProgress}
		<ProgressIndicator currentStep={step} {totalSteps} percentage={progressPercentage} />
	{/if}

	{#if validationErrors.length > 0}
		<div class="my-3 rounded border border-error-500 preset-tonal-error px-3 py-2 text-sm">
			<ul class="ml-4 list-outside list-disc">
				{#each validationErrors as validationError, errorIndex (errorIndex)}
					<li>{validationError}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		{#if stepType !== StepType.WELCOME}
			<div class="mb-6 flex flex-wrap gap-4">
				{@render stepNavButtons()}
			</div>
		{/if}

		{#if stepType === StepType.WELCOME}
			<p>Welcome to the NAA Analysis software!</p>
			<br />
			<label class="label">
				<span>To start, please enter an experiment title:</span>
				<input class="input w-50" type="text" bind:value={title} />
			</label>
			<br />
			<p>
				This version is a beta release. Some things may not be perfect, but you should expect good
				stability.
			</p>
			<br />
			<p>Here is what is included in this software:</p>
			<ul class="ml-6 list-outside list-disc">
				<li>
					Complete analysis for:
					<ul class="mt-1 ml-6 list-outside list-disc">
						<li>Any number of isotopes</li>
						<li>Any number of reference materials</li>
						<li>Any number of unknown materials</li>
						<li>Uploading from a Maestro .rpt file</li>
						<li>A table displaying concentrations and uncertainties with a CSV download link</li>
					</ul>
				</li>
				<li>
					Browse and load isotopes from the shared catalog when it is available, or enter your own.
				</li>
				<li>
					Build a reference library by combining catalog entries with your own one-time custom
					reference materials (custom data is never saved to the catalog).
				</li>
				<li>
					Automatic loading of more items whenever you scroll to the bottom of a catalog list.
				</li>
			</ul>
			<br />
			<p>Note: This software has NOT gone through formal validation or verification processes.</p>
			<br />
			<p>
				In this version (v{APP_VERSION}), the main focus is to implement fission correction and work
				on more minor bug fixes and UI changes.
			</p>
			<br />
			<h2 class="text-2xl font-bold">Next planned releases</h2>
			<ol class="ml-6 list-outside list-decimal">
				<li>Version 7.2: Fission Correction</li>
				<li>Version 8.0: Interference</li>
			</ol>
			<br />
			<h2 class="text-2xl font-bold">
				Future additions, not planned yet (note: can be implemented in any order):
			</h2>
			<ul class="list-inside list-disc">
				<li>Delete operations to the catalog through the UI.</li>
			</ul>
			<br />
			<div class="flex flex-wrap items-center gap-3">
				<button type="button" class="btn preset-filled-primary-500 text-xl" onclick={next}>
					Get Started
				</button>
				{#if isotopeInfo.length || materials.reference.length || materials.unknown.length}
					<button type="button" class="btn preset-tonal-surface" onclick={startNewAnalysis}>
						Start new analysis
					</button>
				{/if}
			</div>
			<p class="mt-3 text-sm">
				As you work, your entries are saved automatically in this browser and stay on this device —
				they are never uploaded. Use "Start new analysis" to clear them. Publishing an isotope or
				reference material to the shared catalog (when signed in) is the only action that sends data
				off your device.
			</p>
		{:else if stepType === StepType.SELECT_ISOTOPES}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Add the isotopes you want to analyze.</p>
			<br />

			{#if catalogAvailable}
				<div id="isotope-catalog-browser" class="scroll-mt-24">
					<IsotopeViewer
						bind:selectedIsotopes={isotopeInfo}
						bind:searchTerm={isotopeCatalogSearch}
						showSelectionList={false}
					/>
				</div>
				<br />
			{/if}

			<h3 class="text-xl font-bold">Isotopes to analyze ({isotopeInfo.length})</h3>

			{#if isotopeWarnings.length > 0}
				<div class="mt-2 space-y-2 rounded border border-warning-500 preset-tonal-warning p-3">
					<p class="font-bold">⚠ Check these isotopes</p>
					<ul class="space-y-2">
						{#each isotopeWarnings as warning (warning.index)}
							<li class="flex flex-wrap items-center justify-between gap-2 text-sm">
								<span>{warning.text}</span>
								<button
									type="button"
									class="btn shrink-0 preset-tonal-surface"
									onclick={() => openRelationshipPanel(warning.index)}
								>
									Record how this is measured
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if unresolvedFissionCandidates.length > 0}
				<div class="mt-2 space-y-2 rounded border border-warning-500 preset-tonal-warning p-3">
					<p class="font-bold">⚠ Possible fission interference</p>
					<p class="text-sm">
						{unresolvedFissionCandidates.length}
						{unresolvedFissionCandidates.length === 1 ? 'isotope is' : 'isotopes are'} also produced by
						the in-pile fission of uranium. Part of their counts comes from the fission of the uranium
						in your sample and must be subtracted. Pick a correction factor for each, or set it to 0 if
						fission interference does not apply — its uranium concentration can come from an analysed
						uranium isotope, or you'll be able to type it in directly on the reference material and unknowns.
						This warning goes away once every isotope below has been reviewed.
					</p>
					<ul class="space-y-2">
						{#each unresolvedFissionCandidates as candidate (candidate.index)}
							<li class="flex flex-wrap items-center justify-between gap-2 text-sm">
								<span>
									<strong>{getIsotopeDisplayName(candidate.isotope, candidate.index)}</strong>
									{@render fissionModeBadge(isLanthanum140(candidate.isotope))}
									— <span class="text-warning-700-300">not reviewed</span>
								</span>
								<button
									type="button"
									class="btn shrink-0 preset-tonal-surface"
									onclick={() => reviewFissionCorrection(candidate.index)}
								>
									Set correction
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if isotopeInfo.length === 0}
				<p>
					No isotopes yet. {catalogAvailable
						? 'Add one from the catalog above or create a custom isotope.'
						: 'Create a custom isotope to get started.'}
				</p>
			{/if}
			<div class="mt-2 space-y-2">
				{#each isotopeInfo as isotope, index (index)}
					<CollapsibleCard
						id="isotope-card-{index}"
						title={getIsotopeDisplayName(isotope, index)}
						subtitle={isotope.id ? 'From catalog' : 'Custom'}
						open={expandedIsotopes.has(index)}
						onToggle={() => toggleExpanded(expandedIsotopes, index)}
						onRemove={() => removeIsotope(index)}
					>
						<IsotopeInfo bind:this={isoRef[index]} bind:isotopeInfo={isotopeInfo[index]} />

						{#if swaAuth.signInAvailable}
							{@const parsed = parseIsotopeName(isotope.isotopeName)}
							{@const isoMode = isotopeModeFor(index)}
							{@const renamed = isotopeIdentityChanged(isotope)}
							{@const energies = isotopeEnergyList(index)}
							{@const dupState = isotopeDup[index]}
							{@const blockers = [
								...isotopeSaveBlockers(isotope),
								...(energies.length === 0 ? ['Add at least one energy line.'] : []),
								...isotopeDupBlockers(index)
							]}
							<div
								class="mt-3 space-y-2 rounded border border-primary-500 preset-tonal-primary p-3"
							>
								<p class="font-bold">
									{isotope.id ? 'Save your changes to the catalog' : 'Share this isotope'}
								</p>

								{#if parsed}
									<p class="text-sm">
										Saves as <strong>{describeIsotope(parsed, isotope.elementName)}</strong>.
									</p>
								{/if}

								{#if parsed}
									{#if dupState?.checking}
										<p class="text-sm">Checking the catalog for a match…</p>
									{:else if dupState?.match}
										<p class="text-sm text-warning-600-400">
											⚠ Already in the catalog — half-life {dupState.match.halfLife?.number}
											{dupState.match.halfLife?.unit}, energies {(
												dupState.match.energies ?? []
											).join(', ')} keV.
										</p>
									{:else if dupState?.checked}
										<p class="text-sm text-success-600-400">
											Not in the catalog yet — this will create a new entry.
										</p>
									{/if}
								{/if}

								{#if isotope.id}
									<fieldset class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
										<label class="inline-flex items-center gap-1">
											<input
												type="radio"
												name="iso-mode-{index}"
												checked={isoMode === 'update'}
												disabled={renamed}
												onchange={() =>
													(isotopeUploadMode = { ...isotopeUploadMode, [index]: 'update' })}
											/>
											Update the existing catalog entry
										</label>
										<label class="inline-flex items-center gap-1">
											<input
												type="radio"
												name="iso-mode-{index}"
												checked={isoMode === 'new'}
												onchange={() =>
													(isotopeUploadMode = { ...isotopeUploadMode, [index]: 'new' })}
											/>
											Save as a new isotope
										</label>
									</fieldset>
									{#if renamed}
										<p class="text-sm text-warning-600-400">
											You changed the isotope name, so this can only be saved as a new entry.
										</p>
									{:else if isoMode === 'update'}
										<p class="text-sm">
											Overwrites the shared record's half-life, element name and the full energy
											list below.
										</p>
									{/if}
								{/if}

								<label class="label text-sm">
									<span>Energy lines saved to the catalog (keV, comma-separated)</span>
									<input
										class="input"
										type="text"
										value={energies.join(', ')}
										onchange={(e) => setIsotopeEnergiesFromText(index, e.currentTarget.value)}
									/>
								</label>

								{#if blockers.length > 0}
									<ul class="ml-4 list-disc text-sm text-warning-600-400">
										{#each blockers as blocker (blocker)}<li>{blocker}</li>{/each}
									</ul>
								{/if}
								{#if isotopeWriteFeedback[index]}
									<p
										class="text-sm {isotopeWriteFeedback[index].ok
											? 'text-success-600-400'
											: 'text-error-500'}"
									>
										{isotopeWriteFeedback[index].text}
									</p>
								{/if}

								{@render confirmBox(
									isotopePublishConfirm?.key === index ? isotopePublishConfirm : null,
									isotopeWriteBusy === index
								)}

								<button
									type="button"
									class="btn preset-filled-primary-500"
									disabled={isotopeWriteBusy === index ||
										blockers.length > 0 ||
										isotopePublishConfirm?.key === index ||
										(swaAuth.signedIn && !writerAccess)}
									onclick={() => publishIsotope(index)}
								>
									{#if isotopeWriteBusy === index}
										Saving…
									{:else if !swaAuth.signedIn}
										Sign in to save to catalog
									{:else if isotope.id && isoMode === 'update'}
										Update catalog entry
									{:else if isotope.id}
										Save as new isotope
									{:else}
										Save to shared catalog
									{/if}
								</button>
							</div>
						{/if}

						{#if fissionCandidateByIndex.has(index)}
							{@const candidate = fissionCandidateByIndex.get(index)!}
							{@const lanthanum = isLanthanum140(isotope)}
							{@const effectiveSpecial =
								lanthanum &&
								(candidate.choice
									? candidate.choice.useSpecialCorrection !== false
									: (fissionDraftUseSpecial[index] ?? true))}
							{@const reviewed = isFissionCandidateReviewed(candidate)}
							{@const editing = fissionReviewEditing[index] ?? false}
							<div
								id={fissionAnchorId(index)}
								class="mt-3 scroll-mt-24 space-y-2 rounded border p-3 {reviewed && !editing
									? 'border-surface-300-700'
									: 'border-warning-500 preset-tonal-warning'}"
							>
								{#if reviewed && !editing}
									<!-- Reviewed: settled, no warning styling — this is the "auto-dismiss" state. -->
									<p class="text-sm">
										<strong>Fission correction</strong>
										{@render fissionModeBadge(effectiveSpecial)}
										— {describeFissionChoice(candidate.choice!)}
										<button
											type="button"
											class="ml-2 btn preset-tonal-surface"
											onclick={() => (fissionReviewEditing[index] = true)}
										>
											Change
										</button>
									</p>
								{:else}
									{@const useSpecial = fissionDraftUseSpecial[index] ?? true}
									<p class="font-bold">
										⚠ Possible fission interference
										{@render fissionModeBadge(effectiveSpecial)}
										{#if editing}
											<button
												type="button"
												class="ml-2 btn preset-tonal-surface"
												onclick={() => (fissionReviewEditing[index] = false)}
											>
												Cancel
											</button>
										{/if}
									</p>
									<p class="text-sm">
										{getIsotopeDisplayName(isotope, index)} is also produced by the in-pile fission of
										uranium. Part of its signal comes from fission of the uranium in your sample and must
										be subtracted. Choose a correction factor, or set it to 0 if this does not apply.
									</p>

									{#if !hasUraniumAnalyzed}
										<p class="text-xs">
											Uranium isn't one of your analysed isotopes — its concentration for this
											correction can be typed in directly on your reference material and unknowns
											(Steps 2 &amp; 3), or you can
											<button type="button" class="underline" onclick={addCustomUraniumIsotope}>
												add it as a custom isotope
											</button>
											{#if catalogAvailable}
												or
												<button type="button" class="underline" onclick={findUraniumInCatalog}>
													choose it from the catalog
												</button>
											{/if}
											to measure it directly instead.
										</p>
									{/if}

									{#if lanthanum}
										<fieldset class="space-y-1 text-sm">
											<legend class="font-semibold">Correction type</legend>
											<label class="flex items-start gap-2">
												<input
													type="radio"
													name="fission-mode-{index}"
													class="mt-1"
													checked={useSpecial}
													onchange={() => (fissionDraftUseSpecial[index] = true)}
												/>
												<span>
													<strong>Special — Ba-140 in-growth.</strong> Thermal irradiation only — the
													0.00233 constant this correction uses was derived for thermal-neutron fission.
													La-140 grows in from its precursor Ba-140, so the factor is computed per sample
													rather than used as a flat number — needs the Ba-140 half-life below.
												</span>
											</label>
											<label class="flex items-start gap-2">
												<input
													type="radio"
													name="fission-mode-{index}"
													class="mt-1"
													checked={!useSpecial}
													onchange={() => (fissionDraftUseSpecial[index] = false)}
												/>
												<span>
													<strong>Standard — flat factor.</strong> Recommended for epithermal (or fast)
													irradiation, where the Ba-140 in-growth constant doesn't apply — use a factor
													from an epithermal row in the catalog table, or your own value.
												</span>
											</label>
										</fieldset>
									{/if}

									{#if candidate.choice}
										<p class="text-sm">
											Current: <strong>{describeFissionChoice(candidate.choice)}</strong>
											<button
												type="button"
												class="ml-2 btn preset-tonal-surface"
												onclick={() => clearFissionCorrection(index)}
											>
												Clear
											</button>
										</p>
									{/if}

									{#if candidate.rows.length > 0}
										<p class="text-sm font-semibold">From the catalog table:</p>
										<ul class="space-y-1">
											{#each candidate.rows as row (row.id)}
												<li class="flex flex-wrap items-center justify-between gap-2 text-sm">
													<span>{describeFissionRow(row)}</span>
													<button
														type="button"
														class="btn shrink-0 preset-tonal-surface"
														onclick={() => applyFissionRow(index, row)}
													>
														Use this
													</button>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="text-sm">
											No matching row in the fission-correction table{catalogAvailable
												? ''
												: ' (sign in to a deployment with the shared catalog to load it)'}. Enter a
											factor by hand.
										</p>
									{/if}

									<div class="flex flex-wrap items-end gap-2">
										<label class="label text-sm">
											<span class="block font-semibold">Fissile parent</span>
											<select class="select input" bind:value={fissionDraftParent[index]}>
												{#each URANIUM_NUCLIDES as nuclide (nuclide)}
													<option value={nuclide}>{nuclide}</option>
												{/each}
											</select>
										</label>
										<label class="label text-sm">
											<span class="block font-semibold">Correction factor</span>
											<input
												class="input"
												type="number"
												step="any"
												placeholder="e.g. 0.0123"
												bind:value={fissionDraftFactor[index]}
											/>
										</label>
										<label class="label text-sm">
											<span class="block font-semibold">Uncertainty</span>
											<input
												class="input"
												type="number"
												step="any"
												min="0"
												placeholder="optional"
												bind:value={fissionDraftUncertainty[index]}
											/>
										</label>
										<button
											type="button"
											class="btn preset-tonal-surface"
											onclick={() => applyManualFissionFactor(index)}
										>
											Apply factor
										</button>
										<button
											type="button"
											class="btn preset-tonal-surface"
											onclick={() => dismissFissionCorrection(index)}
										>
											No fission interference (0)
										</button>
									</div>

									{#if lanthanum && useSpecial}
										<div class="mt-2 space-y-1 rounded border border-surface-300-700 p-2">
											<p class="text-sm font-semibold">Ba-140 half-life (La-140 precursor)</p>
											<p class="text-xs">
												La-140 from fission grows in from Ba-140, so its correction factor is worked
												out per sample from the Ba-140 → La-140 in-growth (m = half the irradiation
												time, t = the decay time), using this special correction instead of a flat
												factor.
												{#if resolvedBariumHalfLife}
													<strong
														>Pre-filled below with {resolvedBariumHalfLife.value}
														{resolvedBariumHalfLife.unit}</strong
													>, {resolvedBariumHalfLife.source === 'isotope'
														? 'from your Ba-140 isotope'
														: 'from the catalog'} — change it only to override that value.
												{:else}
													Not found in your isotopes or the catalog — enter it here, or add Ba-140
													as an isotope. It is required for the fission correction.
												{/if}
											</p>
											<div class="flex flex-wrap items-end gap-2">
												<label class="label text-sm">
													<span class="block font-semibold">Half-life</span>
													<input
														class="input"
														type="number"
														step="any"
														min="0"
														placeholder="e.g. 12.75"
														bind:value={fissionBariumHalfLife.value}
													/>
												</label>
												<label class="label text-sm">
													<span class="block font-semibold">Unit</span>
													<select class="select input" bind:value={fissionBariumHalfLife.unit}>
														{#each HALF_LIFE_UNITS as unitOption (unitOption)}
															<option value={unitOption}>{unitOption}</option>
														{/each}
													</select>
												</label>
												{#if resolvedBariumHalfLife && !fissionBariumHalfLifeIsAuto}
													<button
														type="button"
														class="btn preset-tonal-surface"
														onclick={resetBariumHalfLifeToDetected}
													>
														Use pre-filled value
													</button>
												{/if}
											</div>
										</div>
									{/if}
								{/if}
							</div>
						{/if}

						<details class="mt-3">
							<summary class="cursor-pointer text-sm">Debug information</summary>
							<ComputedDisplay
								title="Computed Isotope Information for Isotope {index + 1}"
								data={isoComp[index]}
							/>
						</details>
					</CollapsibleCard>

					{#if proxyByIsotope[index]}
						{@const proxy = proxyByIsotope[index]}
						<div class="space-y-1 rounded border border-primary-500 preset-tonal-primary p-3">
							<p class="text-sm">
								Measured via <strong>{describeProxyMeasured(proxy)}</strong>
								({proxy.source === 'catalog'
									? 'from the shared catalog'
									: 'from your relationship'}).
							</p>
							<p class="text-sm">
								Decay and dead-time corrections use its half-life; the concentration is reported for
								{isotope.elementName || isotope.isotopeName || `isotope ${index + 1}`}.
							</p>
						</div>
					{/if}
				{/each}
			</div>
			<br />
			<button
				type="button"
				id="add-custom-isotope"
				class="btn scroll-mt-24 preset-filled-primary-500"
				onclick={() => addCustomIsotope()}
			>
				Add custom isotope
			</button>

			<div id="isotope-relationships" class="mt-8 scroll-mt-24">
				<button
					type="button"
					class="btn preset-tonal-surface"
					onclick={() => (relationshipPanelOpen = !relationshipPanelOpen)}
				>
					{relationshipPanelOpen ? 'Hide' : 'Isotope relationships (proxy measurements)'}
					{#if localIsotopeLinks.length > 0}
						({localIsotopeLinks.length})
					{/if}
				</button>

				{#if relationshipPanelOpen}
					<div class="mt-2 space-y-3 rounded border border-surface-300-700 p-3">
						<p class="text-sm">
							Some analyses detect one isotope (the <em>measured</em> isotope) to quantify another
							(the <em>target</em>). Record that here — it's used for matching reference materials
							right away, and can be published to the shared catalog.
						</p>

						<IsotopeRelationshipForm
							bind:this={relationshipForm}
							analysisIsotopes={isotopeInfo}
							{catalogAvailable}
						/>
						<button type="button" class="btn preset-filled-primary-500" onclick={addRelationship}>
							Add relationship
						</button>

						{#if relationshipFeedback}
							<p class="text-sm">{relationshipFeedback}</p>
						{/if}

						{#if localIsotopeLinks.length > 0}
							<ul class="space-y-2">
								{#each localIsotopeLinks as link (link.id)}
									<li class="space-y-2 rounded border border-surface-300-700 p-2 text-sm">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<span>
												<strong>{isotopeLabel(link.measured)}</strong> measures
												<strong>{isotopeLabel(link.target)}</strong>
												{#if link.notes}<span> — {link.notes}</span>{/if}
												{#if analysisIsotopeNameForLink(link)}
													<span class="text-surface-600-400">
														· applied to {analysisIsotopeNameForLink(link)}</span
													>
												{/if}
											</span>
											<span class="flex flex-wrap gap-2">
												{#if link.published}
													<span class="text-success-600-400">✓ In the catalog</span>
												{:else if swaAuth.signInAvailable}
													<button
														type="button"
														class="btn preset-tonal-surface"
														disabled={relationshipBusy}
														onclick={() => publishRelationship(link.id)}
													>
														{swaAuth.signedIn ? 'Publish to catalog' : 'Sign in to publish'}
													</button>
												{/if}
												<button
													type="button"
													class="btn preset-tonal-surface"
													onclick={() => removeRelationship(link.id)}
												>
													Remove
												</button>
											</span>
										</div>
										{@render confirmBox(
											relationshipConfirm?.key === link.id ? relationshipConfirm : null,
											relationshipBusy
										)}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>
		{:else if stepType === StepType.BUILD_LIBRARY}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Add reference materials, then assign one to each isotope.</p>
			<br />

			{@render unreviewedFissionNotice()}

			<section class="rounded-lg border-2 border-primary-500 preset-tonal-primary p-5">
				<h3 class="text-2xl font-bold">Add your own reference material</h3>
				<p class="mt-2">
					Enter a reference material for this analysis only. Nothing you enter here is saved to the
					shared catalog.
				</p>
				<button
					type="button"
					class="mt-4 btn preset-filled-primary-500 text-xl"
					onclick={addCustomReference}
				>
					+ Add custom reference material
				</button>
				{#if customReferenceNotice}
					<p
						class="mt-4 rounded border border-success-500 preset-tonal-success px-3 py-2"
						role="status"
					>
						{customReferenceNotice}
					</p>
				{/if}
			</section>

			{#if catalogAvailable}
				<h3 class="mt-8 text-2xl font-bold">Or load from the shared catalog</h3>
				<p class="mt-2">Search saved irradiations and add them to this analysis.</p>
				<div class="mt-3">
					<ReferenceMaterialViewer
						isotopeIds={selectableReferenceCatalogIsotopeIds}
						selectedItemIds={referenceCatalogItemIds.filter(
							(id): id is string => typeof id === 'string'
						)}
						currentSelectionId={null}
						onSelectItem={handleReferenceMaterialSelect}
					/>
				</div>
			{/if}

			<h3 class="mt-8 text-xl font-bold">Library entries ({materials.reference.length})</h3>
			{#if materials.reference.length === 0}
				<p>
					No reference materials yet. Add a custom one above{catalogAvailable
						? ' or load one from the catalog'
						: ''}.
				</p>
			{/if}
			<div class="mt-2 space-y-2" bind:this={referenceListEl}>
				{#each materials.reference as reference, index (index)}
					<CollapsibleCard
						title={reference.NETL_code || reference.sampleName || `Reference ${index + 1}`}
						subtitle={getReferenceSourceLabel(index)}
						open={expandedReferences.has(index)}
						onToggle={() => toggleExpanded(expandedReferences, index)}
						onRemove={() => removeReference(index)}
					>
						{#if swaAuth.signInAvailable}
							<div class="mb-3 rounded border border-surface-300-700 p-2 text-sm">
								<button
									type="button"
									class="btn preset-tonal-surface"
									onclick={() => toggleDatasheetLoader(index)}
								>
									{datasheetLoaderOpen.has(index)
										? 'Hide'
										: 'Load known concentrations from a datasheet'}
								</button>
								{#if datasheetLoaderOpen.has(index)}
									<div class="mt-2 flex flex-wrap items-end gap-2">
										<label class="label grow">
											<span>Datasheet</span>
											{#if datasheetsLoading}
												<span class="text-sm">Loading…</span>
											{:else}
												<select class="select" bind:value={selectedLoadDatasheetId[index]}>
													<option value="">— Select a datasheet —</option>
													{#each datasheets as sheet (sheet.id)}
														<option value={sheet.id}>{sheet.sampleName}</option>
													{/each}
												</select>
											{/if}
										</label>
										<button
											type="button"
											class="btn preset-filled-primary-500"
											disabled={!selectedLoadDatasheetId[index]}
											onclick={() => loadDatasheetIntoReference(index)}
										>
											Load
										</button>
									</div>
									{#if datasheetsError}
										<p class="mt-1 text-error-500">{datasheetsError}</p>
									{/if}
									{#if datasheetLoadFeedback[index]}
										<p class="mt-1">{datasheetLoadFeedback[index]}</p>
									{/if}
								{/if}
							</div>
						{/if}
						<RefMatInfo
							{isotopeCount}
							{isotopeInfo}
							usedIsotopeLabels={getUsedIsotopeLabels(index)}
							getRoiIndex={getRoiIndexFn}
							bind:selected={referenceIsotopeSelections[index]}
							bind:refMatInfo={materials.reference[index]}
							bind:this={matRefs.reference[index]}
						/>
						{#if !hasUraniumAnalyzed}
							{#each fissionUraniumEntryTargets.filter((candidate) => getLinkedReferenceIndex(candidate.index) === index) as candidate (candidate.index)}
								{@const entry = fissionManualEntryFor(candidate.index)}
								{@const unit = fissionTargetUnit(candidate.index)}
								{@const unitLabel =
									unit === 'ppm' ? 'µg/g' : unit === 'percentage' ? '%' : (unit ?? '')}
								{#if entry}
									<div
										class="mt-3 space-y-1 rounded border border-warning-500 preset-tonal-warning p-3"
									>
										<p class="text-sm font-semibold">
											⚠ Uranium concentration — needed for the
											{getResultColumnName(isotopeInfo[candidate.index], candidate.index)} fission correction,
											since uranium isn't one of the isotopes you're analysing.
										</p>
										<label class="label text-sm">
											<span class="block font-semibold"
												>Uranium in this reference material ({unitLabel})</span
											>
											<input
												class="input"
												type="number"
												step="any"
												min="0"
												placeholder="C_fissile^S"
												bind:value={entry.inStandard}
											/>
										</label>
									</div>
								{/if}
							{/each}
						{/if}
						{#if swaAuth.signInAvailable}
							{@const fromCatalog = typeof referenceCatalogItemIds[index] === 'string'}
							{@const refMode = referenceModeFor(index)}
							<div class="mt-3">
								<button
									type="button"
									class="btn preset-tonal-surface"
									onclick={() => togglePublishPanel(index)}
								>
									{publishPanelOpen.has(index)
										? 'Hide publish options'
										: fromCatalog
											? 'Save changes to the catalog'
											: 'Publish to shared catalog'}
								</button>
							</div>
							{#if publishPanelOpen.has(index)}
								{@const covered = coveredIsotopesForReference(index)}
								{@const seedEntries = datasheetEntriesFromReference(reference, covered)}
								{@const datasheetId = datasheetValueFor(index)}
								{@const refDupState = referenceDup[index]}
								{@const needsName =
									refMode === 'new' &&
									fromCatalog &&
									(newReferenceName[index] ?? '').trim().length === 0}
								{@const autoSteps = [
									...uncataloguedIsotopes(covered.map((c) => c.isotope)).map(
										(iso) => `add ${isotopeLabel(iso)} to the catalog`
									),
									...(datasheetId
										? []
										: seedEntries.length > 0
											? ["create a datasheet from this material's known concentrations"]
											: [])
								]}
								{@const blockers = [
									...referenceMaterialSaveBlockers(reference),
									...referenceDupBlockers(index),
									...(needsName ? ['Enter a name for the new reference material.'] : []),
									...(datasheetId || seedEntries.length > 0
										? []
										: [
												'Enter the known concentrations on this material, or pick an existing datasheet.'
											])
								]}
								<div
									class="mt-2 space-y-3 rounded border border-primary-500 preset-tonal-primary p-3"
								>
									<p class="text-sm">
										Saves this irradiation and its counting to the shared catalog. Any covered
										isotope not in the catalog yet, and the reference datasheet, are added for you
										as part of publishing.
									</p>

									{#if autoSteps.length > 0}
										<p class="text-sm">
											Publishing will also {autoSteps.join(', and ')}.
										</p>
									{/if}

									{#if refDupState?.checking}
										<p class="text-sm">Checking the catalog for a match…</p>
									{:else if refDupState?.match}
										<p class="text-sm text-warning-600-400">
											⚠ "{refDupState.match.netlCode || refDupState.match.sampleName}" is already in
											the catalog ({refDupState.match.countingCount} counting{refDupState.match
												.countingCount === 1
												? ''
												: 's'}).
										</p>
									{/if}

									{#if fromCatalog}
										<fieldset class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
											<label class="inline-flex items-center gap-1">
												<input
													type="radio"
													name="ref-mode-{index}"
													checked={refMode === 'update'}
													onchange={() =>
														(referenceUploadMode = { ...referenceUploadMode, [index]: 'update' })}
												/>
												Update the existing catalog entry
											</label>
											<label class="inline-flex items-center gap-1">
												<input
													type="radio"
													name="ref-mode-{index}"
													checked={refMode === 'new'}
													onchange={() =>
														(referenceUploadMode = { ...referenceUploadMode, [index]: 'new' })}
												/>
												Save as a new reference material
											</label>
										</fieldset>
										{#if refMode === 'update'}
											<p class="text-sm">
												Overwrites the counting you loaded from the catalog with your edited values,
												in place.
											</p>
										{:else}
											<label class="label">
												<span>New NETL code / name</span>
												<input
													class="input"
													type="text"
													placeholder={reference.NETL_code || 'e.g. SRM-1633c (rev)'}
													bind:value={newReferenceName[index]}
												/>
											</label>
										{/if}
									{/if}

									{#if blockers.length > 0}
										<ul class="ml-4 list-disc text-sm text-warning-600-400">
											{#each blockers as blocker (blocker)}<li>{blocker}</li>{/each}
										</ul>
									{/if}

									<div class="rounded border border-surface-300-700 p-3">
										<p class="text-sm font-bold">Reference datasheet (certified concentrations)</p>
										<label class="label mt-2">
											<span class="text-sm">Choose an existing datasheet</span>
											{#if datasheetsLoading}
												<span class="text-sm">Loading datasheets…</span>
											{:else}
												<select
													class="select"
													value={datasheetId}
													onchange={(e) =>
														(selectedDatasheetId = {
															...selectedDatasheetId,
															[index]: e.currentTarget.value
														})}
												>
													<option value="">— None selected —</option>
													{#each datasheets as sheet (sheet.id)}
														<option value={sheet.id}>{sheet.sampleName}</option>
													{/each}
												</select>
											{/if}
											{#if datasheetsError}
												<span class="text-sm text-error-500">{datasheetsError}</span>
											{:else if !datasheetsLoading && datasheets.length === 0}
												<span class="text-sm">No datasheets saved yet — create one below.</span>
											{/if}
										</label>

										<button
											type="button"
											class="mt-2 btn preset-tonal-surface"
											onclick={() =>
												newDatasheetOpen.has(index)
													? newDatasheetOpen.delete(index)
													: newDatasheetOpen.add(index)}
										>
											{newDatasheetOpen.has(index)
												? 'Cancel'
												: seedEntries.length > 0
													? "Create one from this material's concentrations"
													: 'Create a new datasheet'}
										</button>

										{#if newDatasheetOpen.has(index)}
											{#key seedEntries.length}
												<div class="mt-2 space-y-2">
													{#if seedEntries.length > 0}
														<p class="text-sm">
															Pre-filled from the concentrations entered on this material — review
															and edit, then save.
														</p>
													{/if}
													<ReferenceDatasheetForm
														bind:this={datasheetFormRefs[index]}
														sampleName={reference.sampleName || reference.NETL_code || ''}
														initialEntries={seedEntries}
													/>
													<button
														type="button"
														class="btn preset-filled-primary-500"
														disabled={datasheetSavingByRef[index]}
														onclick={() => createDatasheet(index)}
													>
														{datasheetSavingByRef[index] ? 'Saving…' : 'Save datasheet'}
													</button>
												</div>
											{/key}
										{/if}
									</div>

									<label class="label">
										<span>Counting label</span>
										<input
											class="input"
											type="text"
											placeholder="Counting 1"
											bind:value={countingLabelByRef[index]}
										/>
									</label>
									<label class="label">
										<span>Notes (optional)</span>
										<input class="input" type="text" bind:value={notesByRef[index]} />
									</label>

									{#if referenceWriteFeedback[index]}
										<p
											class="text-sm {referenceWriteFeedback[index].ok
												? 'text-success-600-400'
												: 'text-error-500'}"
										>
											{referenceWriteFeedback[index].text}
										</p>
									{/if}

									{@render confirmBox(
										referencePublishConfirm?.key === index ? referencePublishConfirm : null,
										referenceWriteBusy === index
									)}

									<button
										type="button"
										class="btn preset-filled-primary-500"
										disabled={referenceWriteBusy === index ||
											referencePublishConfirm?.key === index ||
											(swaAuth.signedIn && (!writerAccess || blockers.length > 0))}
										onclick={() => publishReference(index)}
									>
										{#if referenceWriteBusy === index}
											Publishing…
										{:else if !swaAuth.signedIn}
											Sign in to publish
										{:else if fromCatalog && refMode === 'update'}
											Update catalog entry
										{:else if fromCatalog}
											Save as new reference material
										{:else}
											Publish to shared catalog
										{/if}
									</button>
								</div>
							{/if}
						{/if}

						<details class="mt-3">
							<summary class="cursor-pointer text-sm">Debug information</summary>
							<ComputedDisplay
								title="Reference Material Information"
								data={matComp.reference[index]}
							/>
							<ComputedDisplay
								title="Reference and Isotope Information"
								data={matIsoComp.map((item) => item.reference[index])}
							/>
						</details>
					</CollapsibleCard>
				{/each}
			</div>

			{#if materials.reference.length > 0}
				{@const isotopesMappingNeeded = isotopeInfo.filter(
					(_, i) => getCoveringReferenceIndicesForIsotope(i).length !== 1
				)}
				{#if isotopesMappingNeeded.length > 0}
					<div class="mt-4 space-y-2 rounded border border-surface-300-700 p-3">
						<h3 class="text-lg font-bold">Isotope assignment</h3>
						{#each isotopeInfo as isotope, isotopeIndex (isotopeIndex)}
							{@const availableReferences = getCoveringReferenceIndicesForIsotope(isotopeIndex)}
							{#if availableReferences.length !== 1}
								<div
									class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] md:items-center"
								>
									<div class="text-sm">
										<strong>{getIsotopeDisplayName(isotope, isotopeIndex)}</strong>
									</div>
									{#if availableReferences.length > 1}
										<select
											class="input"
											value={String(getLinkedReferenceIndex(isotopeIndex))}
											onchange={(event) => {
												const target = event.currentTarget as HTMLSelectElement;
												setReferenceForIsotope(isotopeIndex, Number(target.value));
											}}
										>
											{#each availableReferences as availableReferenceIndex (availableReferenceIndex)}
												<option value={String(availableReferenceIndex)}>
													{getReferenceLabel(availableReferenceIndex)}
												</option>
											{/each}
										</select>
									{:else}
										<p class="text-sm text-error-500">No reference material covers this isotope.</p>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			{/if}

			{#if referenceCatalogError}
				<p class="mt-3 text-sm text-error-500">{referenceCatalogError}</p>
			{/if}
			{#if referenceCatalogMessage}
				<p class="mt-3 text-sm text-success-600-400">{referenceCatalogMessage}</p>
			{/if}
			{#if referenceCatalogWarning}
				<p class="mt-3 rounded border border-warning-500 preset-tonal-warning px-3 py-2 text-sm">
					{referenceCatalogWarning}
				</p>
			{/if}
		{:else if stepType === StepType.UNKNOWN_MATERIALS}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Add the unknown materials you want to analyze.</p>
			<br />

			{@render unreviewedFissionNotice()}

			<h3 class="text-xl font-bold">Unknown materials ({materials.unknown.length})</h3>
			{#if materials.unknown.length === 0}
				<p>No unknown materials yet. Add one to continue.</p>
			{/if}
			<div class="mt-2 space-y-2">
				{#each materials.unknown as unknown, index (index)}
					<CollapsibleCard
						title={unknown.NETL_code || `Unknown ${index + 1}`}
						open={expandedUnknowns.has(index)}
						onToggle={() => toggleExpanded(expandedUnknowns, index)}
						onRemove={() => removeUnknown(index)}
					>
						<MaterialInfo
							{isotopeCount}
							{isotopeInfo}
							getRoiIndex={getRoiIndexFn}
							bind:this={matRefs.unknown[index]}
							bind:materialInfo={materials.unknown[index]}
						/>
						{#if !hasUraniumAnalyzed}
							{#each fissionUraniumEntryTargets as candidate (candidate.index)}
								{@const entry = fissionManualEntryFor(candidate.index)}
								{@const unit = fissionTargetUnit(candidate.index)}
								{@const unitLabel =
									unit === 'ppm' ? 'µg/g' : unit === 'percentage' ? '%' : (unit ?? '')}
								{#if entry && entry.inUnknown[index]}
									<div
										class="mt-3 space-y-1 rounded border border-warning-500 preset-tonal-warning p-3"
									>
										<p class="text-sm font-semibold">
											⚠ Uranium concentration — needed for the
											{getResultColumnName(isotopeInfo[candidate.index], candidate.index)} fission correction,
											since uranium isn't one of the isotopes you're analysing.
										</p>
										<div class="flex flex-wrap items-end gap-2">
											<label class="label text-sm">
												<span class="block font-semibold"
													>Uranium in this unknown ({unitLabel})</span
												>
												<input
													class="input"
													type="number"
													step="any"
													min="0"
													placeholder="C_fissile^U"
													bind:value={entry.inUnknown[index].value}
												/>
											</label>
											<label class="label text-sm">
												<span class="block font-semibold">± uncertainty</span>
												<input
													class="input"
													type="number"
													step="any"
													min="0"
													placeholder="optional"
													bind:value={entry.inUnknown[index].uncertainty}
												/>
											</label>
										</div>
									</div>
								{/if}
							{/each}
						{/if}
						<details class="mt-3">
							<summary class="cursor-pointer text-sm">Debug information</summary>
							<ComputedDisplay
								title="Unknown Material Information for Unknown {index + 1}"
								data={matComp.unknown[index]}
							/>
							<ComputedDisplay
								title="Unknown and Isotope Information for Unknown {index + 1}"
								data={matIsoComp.map((item) => item.unknown[index])}
							/>
						</details>
					</CollapsibleCard>
				{/each}
			</div>
			<br />
			<button type="button" class="btn preset-filled-primary-500" onclick={addUnknown}>
				Add unknown material
			</button>
		{:else if stepType === StepType.REVIEW}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Review your inputs and the computed results below.</p>
			<br /><br />
			{#if countingModeMismatches.length > 0}
				<div class="mb-4 space-y-1 rounded border border-warning-500 preset-tonal-warning p-3">
					<p class="font-bold">⚠ Counting-mode mismatch</p>
					<p class="text-sm">
						A reference and the unknown it is compared against must be counted the same way. These
						pairs differ:
					</p>
					<ul class="ml-4 list-disc text-sm">
						{#each countingModeMismatches as mm (mm.unknownLabel + '::' + mm.referenceLabel)}
							<li>
								<strong>{mm.unknownLabel}</strong> was counted in {mm.unknownMode} mode, but its reference
								<strong>{mm.referenceLabel}</strong>
								was counted in {mm.referenceMode} mode.
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if unreviewedFissionCount > 0}
				<div
					class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-warning-500 preset-tonal-warning p-3 text-sm"
				>
					<span>
						⚠ {unreviewedFissionCount}
						{unreviewedFissionCount === 1 ? 'isotope has' : 'isotopes have'} unreviewed fission-interference
						potential — set a factor (or 0) in Step 1.
					</span>
					<button
						type="button"
						class="btn shrink-0 preset-tonal-surface"
						onclick={() => goToStep(STEP.SELECT_ISOTOPES)}
					>
						Go to Select Isotopes
					</button>
				</div>
			{/if}
			{#each fissionFissileInputGroups as group (group.isotopeIndex)}
				<div class="mb-4 space-y-1 rounded border border-warning-500 preset-tonal-warning p-3">
					<p class="font-bold">
						⚠ {group.fissileElementLabel} concentration needed —
						<strong
							>{getResultColumnName(isotopeInfo[group.isotopeIndex], group.isotopeIndex)}</strong
						>
					</p>
					<p class="text-sm">
						{group.note} Type it in on the reference material (Step 2) and each unknown (Step 3).
					</p>
				</div>
			{/each}

			{#if fissionNeedsBariumHalfLife}
				<div class="mb-4 space-y-2 rounded border border-error-500 preset-tonal-error p-3">
					<p class="font-bold">Ba-140 half-life required for the lanthanum fission correction</p>
					<p class="text-sm">
						La-140 produced by uranium fission grows in from its precursor Ba-140, so the correction
						can't be computed without the Ba-140 half-life. It wasn't found among your analysed
						isotopes or in the catalog — enter it here (or add Ba-140 as an isotope). This is
						required if you want the fission correction applied.
					</p>
					<div class="flex flex-wrap items-end gap-2">
						<label class="label text-sm">
							<span class="block font-semibold">Ba-140 half-life</span>
							<input
								class="input"
								type="number"
								step="any"
								min="0"
								placeholder="e.g. 12.75"
								bind:value={fissionBariumHalfLife.value}
							/>
						</label>
						<label class="label text-sm">
							<span class="block font-semibold">Unit</span>
							<select class="select input" bind:value={fissionBariumHalfLife.unit}>
								{#each HALF_LIFE_UNITS as unitOption (unitOption)}
									<option value={unitOption}>{unitOption}</option>
								{/each}
							</select>
						</label>
						<button
							type="button"
							class="btn shrink-0 preset-tonal-surface"
							onclick={() => goToStep(STEP.SELECT_ISOTOPES)}
						>
							Go to Select Isotopes
						</button>
					</div>
				</div>
			{/if}

			{#if blockedFissionResults.some((r) => !r.needsFissileInput && !r.needsBariumHalfLife)}
				<div class="mb-4 space-y-1 rounded border border-warning-500 preset-tonal-warning p-3">
					<p class="font-bold">⚠ Fission correction not applied</p>
					<ul class="ml-4 list-disc text-sm">
						{#each blockedFissionResults.filter((r) => !r.needsFissileInput && !r.needsBariumHalfLife) as result (result.isotopeIndex + ':' + result.unknownIndex)}
							<li>
								<strong
									>{getResultColumnName(
										isotopeInfo[result.isotopeIndex],
										result.isotopeIndex
									)}</strong
								>
								in
								<strong
									>{materials.unknown[result.unknownIndex]?.NETL_code ||
										`Unknown ${result.unknownIndex + 1}`}</strong
								>
								— {result.note}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if appliedFissionResults.length > 0}
				<div class="mb-4 rounded border border-primary-500 preset-tonal-primary p-3 text-sm">
					Fission-interference corrections applied to {appliedFissionResults.length} result{appliedFissionResults.length ===
					1
						? ''
						: 's'} (marked <sup>†</sup> below). The uncorrected values are in the collapsed table beneath,
					and the worked calculation is in “Fission interference corrections”.
				</div>
			{/if}
			<!--Display table & header with unit-->
			<h3 class="text-xl font-bold">Predicted Concentrations</h3>
			<!--Display a table here with isotopes as the columns and materials as the rows-->
			<table class="table-auto border-collapse border border-surface-300-700">
				<thead>
					<tr>
						<th class="border border-surface-300-700 px-4 py-2"></th>
						{#each isotopeInfo as iso, index}
							<th class="border border-surface-300-700 px-4 py-2 text-center">
								{getResultColumnName(iso, index)}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="border border-surface-300-700 px-4 py-2 font-bold"> Units </td>
						{#each isotopeInfo as _, index}
							<td class="border border-surface-300-700 px-4 py-2 text-center">
								{(() => {
									const referenceIndex = getLinkedReferenceIndex(index);
									const unit =
										materials.reference[referenceIndex]?.concentrationUnits?.[index] ??
										materials.reference[0]?.concentrationUnits?.[index] ??
										'';
									return unit === 'ppm' ? 'µg/g' : unit === 'percentage' ? '%' : unit;
								})()}
							</td>
						{/each}
					</tr>
					{#each materials.unknown as unk, uIndex}
						{@const unknownLabel = unk.NETL_code || `Unknown ${uIndex + 1}`}
						<tr>
							<td class="border border-surface-300-700 px-4 py-2 font-bold">
								{unknownLabel}
							</td>
							{#each isotopeInfo as _, iIndex}
								{@const comp = everythingComp[iIndex][uIndex]}
								{@const fission = fissionResults.get(`${iIndex}:${uIndex}`)}
								{@const applied = Boolean(fission && fission.applied)}
								{@const shown = applied ? fission!.corrected : comp.unknownConcentration}
								{@const shownUnc = applied
									? fission!.correctedUncertaintyAbsolute
									: comp.unknownConcentrationUncertaintyAbsolute}
								<td class="border border-surface-300-700 px-4 py-2 text-center">
									{roundResult(shown)}{#if applied}<sup title="Fission-interference corrected"
											>†</sup
										>{/if} ± {roundToMatch(shownUnc, shown)}
								</td>
							{/each}
						</tr>
						<tr>
							<td class="border border-surface-300-700 px-4 py-2 font-bold">
								{unknownLabel} Conc Det Lim
							</td>
							{#each isotopeInfo as _, iIndex}
								<td class="border border-surface-300-700 px-4 py-2 text-center">
									{roundResult(everythingComp[iIndex][uIndex].concentrationDetectionLimit)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			{#if appliedFissionResults.length > 0}
				<p class="mt-1 text-sm"><sup>†</sup> fission-interference corrected — see below.</p>
			{/if}
			<br />

			{#if appliedFissionResults.length > 0 || blockedFissionResults.some((r) => !r.needsFissileInput && !r.needsBariumHalfLife)}
				<h3 class="text-xl font-bold">Fission interference corrections</h3>
				<p class="mt-1 mb-2 text-sm">
					C<sub>target</sub><sup>U</sup> = k · (C<sub>target</sub><sup>S</sup> + f<sub>S</sub> · C<sub
						>fissile</sub
					><sup>S</sup>) − f<sub>U</sub> · C<sub>fissile</sub><sup>U</sup>. Concentrations shown in
					the target isotope’s unit; k is the combined correction factor. f is the Step 1 factor (f<sub
						>S</sub
					>
					= f<sub>U</sub>), except for La-140 on the special (thermal-only) correction, where it is
					computed per sample from the Ba-140 → La-140 in-growth so f<sub>S</sub> and f<sub>U</sub> differ.
				</p>
				<div class="overflow-x-auto">
					<table class="table-auto border-collapse border border-surface-300-700 text-sm">
						<thead>
							<tr>
								{#each ['Isotope', 'Unknown', 'Fissile parent', 'f', 'k', 'C_target^S', 'C_fissile^S', 'C_fissile^U', 'Uncorrected', 'Corrected'] as heading (heading)}
									<th class="border border-surface-300-700 px-3 py-1 text-center">{heading}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each [...fissionResults.values()].filter((r) => r.applied || !r.needsFissileInput) as result (result.isotopeIndex + ':' + result.unknownIndex)}
								<tr>
									<td class="border border-surface-300-700 px-3 py-1">
										{getResultColumnName(isotopeInfo[result.isotopeIndex], result.isotopeIndex)}
										{@render fissionModeBadge(result.isLanthanum)}
									</td>
									<td class="border border-surface-300-700 px-3 py-1">
										{materials.unknown[result.unknownIndex]?.NETL_code ||
											`Unknown ${result.unknownIndex + 1}`}
									</td>
									<td class="border border-surface-300-700 px-3 py-1"
										>{result.fissileElementLabel}</td
									>
									<td class="border border-surface-300-700 px-3 py-1 text-right">
										{#if result.isLanthanum}
											{result.fStandard.toPrecision(3)} / {result.f.toPrecision(3)}
										{:else}
											{result.f}
										{/if}
									</td>
									{#if result.applied}
										<td class="border border-surface-300-700 px-3 py-1 text-right"
											>{result.k.toPrecision(4)}</td
										>
										<td class="border border-surface-300-700 px-3 py-1 text-right"
											>{roundResult(result.cTargetStandard)}</td
										>
										<td class="border border-surface-300-700 px-3 py-1 text-right"
											>{roundResult(result.cFissileStandard)}</td
										>
										<td class="border border-surface-300-700 px-3 py-1 text-right"
											>{roundResult(result.cFissileUnknown)}</td
										>
										<td class="border border-surface-300-700 px-3 py-1 text-right"
											>{roundResult(result.uncorrected)} ± {roundToMatch(
												result.uncorrectedUncertaintyAbsolute,
												result.uncorrected
											)}</td
										>
										<td class="border border-surface-300-700 px-3 py-1 text-right font-bold"
											>{roundResult(result.corrected)} ± {roundToMatch(
												result.correctedUncertaintyAbsolute,
												result.corrected
											)}</td
										>
									{:else}
										<td class="border border-surface-300-700 px-3 py-1 text-center" colspan="6"
											>{result.note}</td
										>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<br />

				<details class="rounded border border-surface-300-700 p-3">
					<summary class="cursor-pointer font-semibold">Uncorrected concentrations</summary>
					<div class="mt-3 overflow-x-auto">
						<table class="table-auto border-collapse border border-surface-300-700">
							<thead>
								<tr>
									<th class="border border-surface-300-700 px-4 py-2"></th>
									{#each isotopeInfo as iso, index}
										<th class="border border-surface-300-700 px-4 py-2 text-center"
											>{getResultColumnName(iso, index)}</th
										>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each materials.unknown as unk, uIndex}
									{@const unknownLabel = unk.NETL_code || `Unknown ${uIndex + 1}`}
									<tr>
										<td class="border border-surface-300-700 px-4 py-2 font-bold">{unknownLabel}</td
										>
										{#each isotopeInfo as _, iIndex}
											{@const comp = everythingComp[iIndex][uIndex]}
											<td class="border border-surface-300-700 px-4 py-2 text-center">
												{roundResult(comp.unknownConcentration)} ± {roundToMatch(
													comp.unknownConcentrationUncertaintyAbsolute,
													comp.unknownConcentration
												)}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</details>
				<br />
			{/if}
			<button
				type="button"
				class="btn preset-filled-primary-500 text-xl"
				onclick={downloadTableAsCSV}
			>
				Download Table as CSV
			</button>
			<br /><br />

			{#if swaAuth.signInAvailable}
				<section class="mt-4 space-y-2 rounded border border-primary-500 preset-tonal-primary p-4">
					<h3 class="text-xl font-bold">Contribute to the shared catalog</h3>
					{#if pendingUploadCount === 0}
						<p class="text-sm">
							Nothing new to upload — every isotope and reference material in this analysis is
							already in the catalog (or has been published).
						</p>
					{:else}
						<p class="text-sm">
							{pendingUploadCount} new item{pendingUploadCount === 1 ? '' : 's'} can be uploaded:
							{pendingIsotopeIndices.length} isotope{pendingIsotopeIndices.length === 1 ? '' : 's'},
							{pendingReferenceIndices.length} reference material{pendingReferenceIndices.length ===
							1
								? ''
								: 's'}{pendingRelationships.length > 0
								? `, ${pendingRelationships.length} relationship${pendingRelationships.length === 1 ? '' : 's'}`
								: ''}. Dependencies (catalog isotopes, datasheets) are handled automatically.
						</p>

						{@render confirmBox(uploadAllConfirm, uploadAllBusy)}

						<button
							type="button"
							class="btn preset-filled-primary-500"
							disabled={uploadAllBusy || uploadAllConfirm !== null}
							onclick={uploadAll}
						>
							{#if uploadAllBusy}
								Uploading…
							{:else if !swaAuth.signedIn}
								Sign in to upload all
							{:else}
								Upload all ({pendingUploadCount})
							{/if}
						</button>
					{/if}
					{#if uploadAllResult}
						<p class="text-sm">{uploadAllResult}</p>
					{/if}
				</section>
				<br />
			{/if}

			<details class="mt-4 rounded border border-surface-300-700 p-3">
				<summary class="cursor-pointer font-semibold">Expand for debug information</summary>
				<div class="mt-3 space-y-4">
					<ComputedDisplay title="Isotope Information" data={isotopeInfo} />
					<ComputedDisplay title="Material Information" data={materials} />
					<ComputedDisplay level={4} title="Isotope Computed Values" data={isoComp} />
					<ComputedDisplay level={4} title="Material Computed Values" data={matComp} />
					<ComputedDisplay
						level={4}
						title="Material and Isotope Computed Values"
						data={matIsoComp}
					/>
					<ComputedDisplay level={4} title="Multi Material Computed Values" data={multiMatComp} />
					<ComputedDisplay
						level={4}
						title="Computed Values that use everything"
						data={everythingComp}
					/>
				</div>
			</details>
			<br />
		{/if}

		{#if stepType !== StepType.WELCOME}
			<div class="mt-6 flex flex-wrap gap-4">
				{@render stepNavButtons()}
			</div>
		{/if}
		<br />
	</form>
</div>
