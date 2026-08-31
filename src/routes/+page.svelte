<script lang="ts">
	import { browser } from '$app/environment';
	import { tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
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
		truncateToSigFigs
	} from '$lib/utils/naaUtils.js';
	import {
		getBaseMaterialErrors,
		getIsotopeErrors,
		getReferenceMaterialErrors
	} from '$lib/utils/materialValidation.js';
	import { isEnvironmentWithoutSignIn } from '$lib/utils/authEnvironment.js';
	import {
		APP_VERSION,
		REVIEW_STEP,
		StepType,
		getBackButtonText,
		getNextButtonText,
		getProgressPercentage,
		getStepTitle,
		getStepType
	} from '$lib/utils/stepUtils.js';

	const AUTH_STATE_STORAGE_KEY = 'naa-auth-redirect-state';
	const PERSISTED_STATE_VERSION = 2;

	type PersistedWizardState = {
		version: number;
		step: number;
		title: string;
		isotopeInfo: IsotopeInfoType[];
		materials: {
			reference: ReferenceMaterial[];
			unknown: UnknownMaterial[];
		};
		referenceIsotopeSelections: string[][];
		isotopeReferenceMap: number[];
		referenceCatalogItemIds: (string | null)[];
	};

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

	function getPersistedWizardState(): PersistedWizardState {
		return {
			version: PERSISTED_STATE_VERSION,
			step,
			title,
			isotopeInfo,
			materials,
			referenceIsotopeSelections: referenceIsotopeSelections.map((selection) =>
				Array.from(selection ?? [])
			),
			isotopeReferenceMap,
			referenceCatalogItemIds
		};
	}

	function persistWizardState() {
		if (!browser) {
			return;
		}

		window.sessionStorage.setItem(
			AUTH_STATE_STORAGE_KEY,
			JSON.stringify(getPersistedWizardState())
		);
	}

	function restoreWizardState() {
		if (!browser) {
			return;
		}

		const rawState = window.sessionStorage.getItem(AUTH_STATE_STORAGE_KEY);
		if (!rawState) {
			return;
		}

		try {
			const savedState = JSON.parse(rawState) as PersistedWizardState;
			if (savedState.version !== PERSISTED_STATE_VERSION) {
				return;
			}

			step = Math.min(Math.max(savedState.step ?? 0, 0), REVIEW_STEP);
			title = savedState.title ?? 'NAA Analysis';
			isotopeInfo = Array.isArray(savedState.isotopeInfo) ? savedState.isotopeInfo : [];

			const restoredMaterials = savedState.materials ?? { reference: [], unknown: [] };
			materials = {
				reference: Array.isArray(restoredMaterials.reference) ? restoredMaterials.reference : [],
				unknown: Array.isArray(restoredMaterials.unknown) ? restoredMaterials.unknown : []
			};

			referenceIsotopeSelections = materials.reference.map((_, index) => {
				const saved = savedState.referenceIsotopeSelections?.[index];
				return new Set<string>(Array.isArray(saved) ? saved : []);
			});
			referenceCatalogItemIds = materials.reference.map(
				(_, index) => savedState.referenceCatalogItemIds?.[index] ?? null
			);
			isotopeReferenceMap = Array.isArray(savedState.isotopeReferenceMap)
				? savedState.isotopeReferenceMap
				: [];

			isoRef = Array.from({ length: isotopeInfo.length }, () => undefined);
			matRefs = {
				reference: Array.from({ length: materials.reference.length }, () => undefined),
				unknown: Array.from({ length: materials.unknown.length }, () => undefined)
			};
			reconcileIsotopeDependentState();
		} catch {
			// Ignore invalid saved state and continue with the current in-memory defaults.
		} finally {
			window.sessionStorage.removeItem(AUTH_STATE_STORAGE_KEY);
		}
	}

	async function handleSignIn() {
		if (!browser) {
			return;
		}

		localAuthNotice = '';

		const currentUrl = new URL(window.location.href);
		const loginUrl = new URL('/.auth/login/aad', currentUrl.origin);
		loginUrl.searchParams.set(
			'post_login_redirect_uri',
			currentUrl.pathname + currentUrl.search + currentUrl.hash
		);

		persistWizardState();
		window.location.assign(loginUrl.toString());
	}

	let step = $state(0);

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
	let referenceCatalogMessage = $state('');
	let referenceCatalogError = $state('');
	let referenceCatalogWarning = $state('');
	let customReferenceNotice = $state('');
	let referenceListEl = $state<HTMLDivElement>();
	let isotopeMeasurementLinks = $state<IsotopeMeasurementLink[]>([]);
	let isotopeCatalogById = $state<Record<string, IsotopeCatalogItem>>({});
	let hasRequestedIsotopeCatalog = $state(false);
	let hasRequestedIsotopeMeasurementLinks = $state(false);
	let isotopeReferenceMap = $state<number[]>([]);

	let catalogAvailable = $state(false);
	let localAuthNotice = $state('');
	let currentHostname = $state(browser ? window.location.hostname : '');

	const expandedIsotopes = new SvelteSet<number>();
	const expandedReferences = new SvelteSet<number>();
	const expandedUnknowns = new SvelteSet<number>();

	// isotope / material counts are derived from the working lists
	let isotopeCount = $derived(isotopeInfo.length);
	let referenceCount = $derived(materials.reference.length);
	// computed isotope information
	let isoComp = $derived(isotopeInfo.map(isoGA));

	let showSignInPrompt = $derived(
		currentHostname !== '' && !isEnvironmentWithoutSignIn(currentHostname) && !catalogAvailable
	);

	let matComp = $derived({
		reference: materials.reference.map((ref) => matGA(ref)),
		unknown: materials.unknown.map((unk) => matGA(unk))
	});
	let matIsoComp = $derived(
		isotopeInfo.map((iso, index) => ({
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

		for (const link of isotopeMeasurementLinks) {
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
			: isotopeInfo.map((iso, index) => {
					const referenceIndex = getLinkedReferenceIndex(index);
					const reference = materials.reference[referenceIndex] ?? materials.reference[0];
					return materials.unknown.map((unk) => EGA(reference, unk, iso, index));
				})
	);

	let nextButtonText = $derived(getNextButtonText(step));
	let backButtonText = $derived(getBackButtonText(step));
	let stepTitle = $derived(getStepTitle(step));
	let stepType = $derived(getStepType(step));
	let progressPercentage = $derived(getProgressPercentage(step));
	const totalSteps = REVIEW_STEP;
	let showProgress = $derived(step > 0);

	// Memoized function to prevent recreation on every render
	let getRoiIndexFn = $derived((roiData: { centroid: number }[]) =>
		findRoiIndices(isotopeInfo, roiData)
	);

	// Validation state
	let validationErrors: string[] = $state([]);

	$effect(() => {
		if (!browser) {
			return;
		}

		currentHostname = window.location.hostname;
		restoreWizardState();

		let cancelled = false;

		void detectCatalogAvailability().then((available) => {
			if (!cancelled) {
				catalogAvailable = available;
			}
		});

		return () => {
			cancelled = true;
		};
	});

	// Keep the per-isotope arrays on every material aligned with the isotope list.
	$effect(() => {
		void isotopeInfo.length;
		untrack(reconcileIsotopeDependentState);
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
			const response = await fetch(`${apiUrl}?limit=1000`, {
				headers: {
					accept: 'application/json'
				}
			});

			const body = await response.json().catch(() => null);
			if (!response.ok) {
				return;
			}

			const items = Array.isArray(body?.items) ? body.items : [];
			isotopeCatalogById = Object.fromEntries(
				(items as IsotopeCatalogItem[])
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

		return `${itemId}::${countingLabel}::${createdAt}::${measurementStart}::${irradiationEnd}::${irradiationType}`;
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
		if (!sourceMaterial) {
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

		const usedIndices = new Set<number>();
		const matchedSelection = new Set<string>();
		const proxyWarnings: string[] = [];

		for (let index = 0; index < isotopeCount; index++) {
			const match = findCatalogIsotopeMatch(isotopeInfo[index], item, usedIndices);
			const sourceIndex = match.sourceIndex;
			if (sourceIndex < 0) {
				continue;
			}

			usedIndices.add(sourceIndex);
			matchedSelection.add(getIsotopeSelectionKey(index));

			const targetId = isotopeInfo[index]?.id?.trim();
			if (targetId && match.matchedIsotopeId && match.matchedIsotopeId !== targetId) {
				const warning = `${getIsotopeDisplayName(isotopeInfo[index], index)} is selected for analysis, but ${getCatalogIsotopeDisplayName(match.matchedIsotopeId)} is measured in this reference irradiation.`;
				if (!proxyWarnings.includes(warning)) {
					proxyWarnings.push(warning);
				}
			}

			nextReference.counts[index] = {
				grossCounts: sourceCounts[sourceIndex]?.grossCounts ?? 0,
				netCounts: sourceCounts[sourceIndex]?.netCounts ?? 0,
				uncertainty: sourceCounts[sourceIndex]?.uncertainty ?? 0,
				grossCountsPositionalCorrectionFactor:
					sourceCounts[sourceIndex]?.grossCountsPositionalCorrectionFactor ?? 1,
				netCountsPositionalCorrectionFactor:
					sourceCounts[sourceIndex]?.netCountsPositionalCorrectionFactor ?? 1,
				uncertaintyPositionalCorrectionFactor:
					sourceCounts[sourceIndex]?.uncertaintyPositionalCorrectionFactor ?? 1
			};

			nextReference.knownConcentration[index] = sourceConcentrations[sourceIndex] ?? 0;
			nextReference.knownUncertainty[index] = sourceUncertainties[sourceIndex] ?? 0;
			nextReference.concentrationUnits[index] = sourceUnits[sourceIndex];
		}

		if (matchedSelection.size === 0) {
			referenceCatalogError =
				'This reference irradiation does not cover any currently selected isotopes.';
			return;
		}

		materials = {
			...materials,
			reference: [...materials.reference, nextReference]
		};
		referenceIsotopeSelections = [...referenceIsotopeSelections, matchedSelection];
		referenceCatalogItemIds = [...referenceCatalogItemIds, selectionId];
		matRefs.reference = [...matRefs.reference, undefined];
		updateIsotopeReferenceMap(isotopeCount, materials.reference.length);

		referenceCatalogMessage = `Added ${sourceMaterial.NETL_code} (${sourceMaterial.sampleName})${sourceMaterial.irradiationType ? ` [${sourceMaterial.irradiationType}]` : ''}. Covers ${matchedSelection.size} isotope row(s).`;
		referenceCatalogWarning = proxyWarnings.join(' ');
	}

	function addCustomIsotope() {
		isotopeInfo = [...isotopeInfo, createIsotopeInfo()];
		isoRef = [...isoRef, undefined];
		expandedIsotopes.add(isotopeInfo.length - 1);
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
		referenceListEl?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function removeReference(referenceIndex: number) {
		if (referenceIndex < 0 || referenceIndex >= materials.reference.length) {
			return;
		}

		referenceCatalogMessage = '';
		referenceCatalogError = '';
		referenceCatalogWarning = '';
		customReferenceNotice = '';

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
		const energyLabel = energy !== null ? ` @ ${energy.toLocaleString()} keV` : '';

		if (isotope.elementName && isotope.isotopeName) {
			return `${isotope.elementName}-${isotope.isotopeName}${energyLabel}`;
		}

		return `Isotope ${index + 1}${energyLabel}`;
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

		step = Math.min(step + 1, totalSteps);
	};
	const prev = () => {
		if (step <= 0) return;
		step = Math.max(step - 1, 0);
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
			...isotopeInfo.flatMap((iso) => [
				escapeCSV(iso.isotopeName),
				escapeCSV(`${iso.isotopeName} Uncertainty`)
			])
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

		// Add data rows for each unknown material
		materials.unknown.forEach((unk, uIndex) => {
			const unknownLabel = unk.NETL_code || `Unknown ${uIndex + 1}`;
			const row = [
				escapeCSV(unknownLabel),
				...isotopeInfo.flatMap((_, iIndex) => [
					escapeCSV(truncateToSigFigs(everythingComp[iIndex][uIndex].unknownConcentration, 3)),
					escapeCSV(
						truncateToSigFigs(
							everythingComp[iIndex][uIndex].unknownConcentrationUncertaintyAbsolute,
							2
						)
					)
				])
			];
			csvRows.push(row.join(','));

			const detectionLimitRow = [
				escapeCSV(`${unknownLabel} Conc Det Lim`),
				...isotopeInfo.flatMap((_, iIndex) => [
					escapeCSV(
						truncateToSigFigs(everythingComp[iIndex][uIndex].concentrationDetectionLimit, 3)
					),
					escapeCSV('')
				])
			];
			csvRows.push(detectionLimitRow.join(','));
		});

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

<div style="padding: 5%">
	<h1 class="text-3xl font-bold">NAA Analysis Software - Version {APP_VERSION}</h1>
	<br />
	<h2 class="text-2xl font-bold">Current Experiment: {title}</h2>
	<br />

	{#if showProgress}
		<ProgressIndicator currentStep={step} {totalSteps} percentage={progressPercentage} />
	{/if}

	{#if validationErrors.length > 0}
		<div class="my-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
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
		{#if stepType === StepType.WELCOME}
			<p>Welcome to the NAA Analysis software!</p>
			<br />
			<label class="label">
				<span>To start, please enter an experiment title:</span>
				<input class="input w-50" type="text" bind:value={title} />
			</label>
			<br />
			<p>This version is a developer preview. Please use with caution.</p>
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
					reference materials (custom data is never saved to the database).
				</li>
				<li>
					Automatic loading of more items whenever you scroll to the bottom of a catalog list.
				</li>
			</ul>
			<br />
			<p>Note: This software has NOT gone through formal validation or verification processes.</p>
			<br />
			<p>
				In this version (v{APP_VERSION}), the main focus is to work on small bug fixes and
				improvements after the big 7.0 release.
			</p>
			<br />
			<h2 class="text-2xl font-bold">Next planned releases</h2>
			<ol class="ml-6 list-outside list-decimal">
				<li>
					Version 7.1: Minor updates and bug fixes, including significant figure handling and the
					normal/compton selector for ROI files.
				</li>
				<li>Version 8.0: Interference</li>
			</ol>
			<br />
			<h2 class="text-2xl font-bold">
				Future additions, not planned yet (note: can be implemented in any order):
			</h2>
			<ul class="list-inside list-disc">
				<li>Edit/Delete operations to the database through the UI.</li>
			</ul>
			<br />
			<button type="button" onclick={next}>Get Started</button>
		{:else if stepType === StepType.SELECT_ISOTOPES}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Add the isotopes you want to analyze.</p>
			{#if showSignInPrompt}
				<p class="mt-2 text-sm">
					Not seeing the catalog? <button type="button" class="underline" onclick={handleSignIn}
						>Sign in</button
					>
					to reach the shared catalog.
					{#if localAuthNotice}<span class="text-amber-700">{localAuthNotice}</span>{/if}
				</p>
			{/if}
			<br />

			{#if catalogAvailable}
				<IsotopeViewer bind:selectedIsotopes={isotopeInfo} showSelectionList={false} />
				<br />
			{/if}

			<h3 class="text-xl font-bold">Isotopes to analyze ({isotopeInfo.length})</h3>
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
						title={getIsotopeDisplayName(isotope, index)}
						subtitle={isotope.id ? 'From catalog' : 'Custom'}
						open={expandedIsotopes.has(index)}
						onToggle={() => toggleExpanded(expandedIsotopes, index)}
						onRemove={() => removeIsotope(index)}
					>
						<IsotopeInfo bind:this={isoRef[index]} bind:isotopeInfo={isotopeInfo[index]} />
						<details class="mt-3">
							<summary class="cursor-pointer text-sm">Debug information</summary>
							<ComputedDisplay
								title="Computed Isotope Information for Isotope {index + 1}"
								data={isoComp[index]}
							/>
						</details>
					</CollapsibleCard>
				{/each}
			</div>
			<br />
			<button type="button" onclick={addCustomIsotope}>Add custom isotope</button>
		{:else if stepType === StepType.BUILD_LIBRARY}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Add reference materials, then assign one to each isotope.</p>
			<br />

			<section class="rounded-lg border-2 border-blue-500 bg-blue-50 p-5">
				<h3 class="text-2xl font-bold">Add your own reference material</h3>
				<p class="mt-2">
					Enter a reference material for this analysis only. Nothing you enter here is saved to the
					database.
				</p>
				<button
					type="button"
					class="variant-filled-primary mt-4 btn text-xl"
					onclick={addCustomReference}
				>
					+ Add custom reference material
				</button>
				{#if customReferenceNotice}
					<p
						class="mt-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800"
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
						<RefMatInfo
							{isotopeCount}
							{isotopeInfo}
							usedIsotopeLabels={getUsedIsotopeLabels(index)}
							getRoiIndex={getRoiIndexFn}
							bind:selected={referenceIsotopeSelections[index]}
							bind:refMatInfo={materials.reference[index]}
							bind:this={matRefs.reference[index]}
						/>
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
					<div class="mt-4 space-y-2 rounded border border-gray-300 p-3">
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
										<p class="text-sm text-red-700">No reference material covers this isotope.</p>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			{/if}

			{#if referenceCatalogError}
				<p class="mt-3 text-sm text-red-700">{referenceCatalogError}</p>
			{/if}
			{#if referenceCatalogMessage}
				<p class="mt-3 text-sm text-emerald-700">{referenceCatalogMessage}</p>
			{/if}
			{#if referenceCatalogWarning}
				<p
					class="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
				>
					{referenceCatalogWarning}
				</p>
			{/if}
		{:else if stepType === StepType.UNKNOWN_MATERIALS}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Add the unknown materials you want to analyze.</p>
			<br />

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
			<button type="button" onclick={addUnknown}>Add unknown material</button>
		{:else if stepType === StepType.REVIEW}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Review your inputs and the computed results below.</p>
			<br /><br />
			<!--Display table & header with unit-->
			<h3 class="text-xl font-bold">Predicted Concentrations</h3>
			<!--Display a table here with isotopes as the columns and materials as the rows-->
			<table class="table-auto border-collapse border border-gray-400">
				<thead>
					<tr>
						<th class="border border-gray-400 px-4 py-2"></th>
						{#each isotopeInfo as iso, index}
							<th class="border border-gray-400 px-4 py-2">
								{iso.elementName}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="border border-gray-400 px-4 py-2 font-bold"> Units </td>
						{#each isotopeInfo as _, index}
							<td class="border border-gray-400 px-4 py-2">
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
							<td class="border border-gray-400 px-4 py-2 font-bold">
								{unknownLabel}
							</td>
							{#each isotopeInfo as _, iIndex}
								<td class="border border-gray-400 px-4 py-2">
									{truncateToSigFigs(everythingComp[iIndex][uIndex].unknownConcentration, 3)} ± {truncateToSigFigs(
										everythingComp[iIndex][uIndex].unknownConcentrationUncertaintyAbsolute,
										2
									)}
								</td>
							{/each}
						</tr>
						<tr>
							<td class="border border-gray-400 px-4 py-2 font-bold">
								{unknownLabel} Conc Det Lim
							</td>
							{#each isotopeInfo as _, iIndex}
								<td class="border border-gray-400 px-4 py-2">
									{truncateToSigFigs(everythingComp[iIndex][uIndex].concentrationDetectionLimit, 3)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<br />
			<button type="button" class="variant-filled-primary btn" onclick={downloadTableAsCSV}>
				Download Table as CSV
			</button>
			<br /><br />

			<details class="mt-4 rounded border border-gray-300 p-3">
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
				<button type="button" onclick={prev}>{backButtonText}</button>
				{#if stepType !== StepType.REVIEW}
					<button type="button" onclick={next}>{nextButtonText}</button>
				{/if}
			</div>
		{/if}
		<br />
	</form>
</div>
