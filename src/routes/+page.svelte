<script lang="ts">
	import { browser } from '$app/environment';
	import IsotopeInfo from '$lib/components/isotopeInfo.svelte';
	import MaterialInfo from '$lib/components/materialInfo.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';
	import PageCounter from '$lib/components/pageCounter.svelte';
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
		isEnvironmentWithoutSignIn
	} from '$lib/utils/authEnvironment.js';
	import {
		APP_VERSION,
		getIsotopeIndex,
		getReferenceInfoStartStep,
		getUnknownCountStep,
		getUnknownInfoStartStep,
		getNextButtonText,
		getBackButtonText,
		getStepTitle,
		StepType,
		getStepType,
		getProgressPercentage,
		getReviewStep
	} from '$lib/utils/stepUtils.js';

	const AUTH_STATE_STORAGE_KEY = 'naa-auth-redirect-state';

	type PersistedWizardState = {
		step: number;
		title: string;
		isotopeCount: number;
		isotopeInfo: IsotopeInfoType[];
		referenceCount: number;
		unknownCount: number;
		materials: {
			reference: ReferenceMaterial[];
			unknown: UnknownMaterial[];
		};
		referenceIsotopeSelections: string[][];
		isotopeReferenceMap: number[];
		referenceCatalogItemIds?: (string | null)[];
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

	// Using findRoiIndices from naaUtils

	async function isUserAuthenticated(): Promise<boolean> {
		// can the user get /api/isotopes?
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

	function updateIsotopeData(newCount: number) {
		isotopeCount = newCount;

		// Preserve existing isotope data, only add/remove as needed
		const existingIsotopeInfo = [...isotopeInfo];
		isotopeInfo = Array.from({ length: isotopeCount }, (_, i) => {
			if (i < existingIsotopeInfo.length) {
				const existingIso = existingIsotopeInfo[i];
				return {
					...existingIso,
					linkedReference: existingIso.linkedReference ?? 0
				};
			}
			return createIsotopeInfo();
		});

		// Preserve component references for existing isotopes
		const existingIsoRef = [...isoRef];
		isoRef = Array.from({ length: isotopeCount }, (_, i) =>
			i < existingIsoRef.length ? existingIsoRef[i] : undefined
		);

		// Update reference materials, preserving existing values
		const existingReferences = [...materials.reference];
		materials.reference = Array.from({ length: referenceCount }, (_, i) => {
			const currentReference = existingReferences[i] || createReferenceMaterial(isotopeCount);
			return resizeReferenceMaterial(currentReference, isotopeCount);
		});

		// Update unknown materials counts, preserving existing count data
		materials.unknown = materials.unknown.map((unk) => resizeUnknownMaterial(unk, isotopeCount));

		updateIsotopeReferenceMap(isotopeCount, referenceCount);
	}

	function updateReferenceData(newCount: number) {
		referenceCount = newCount;

		// Preserve existing references, only add/remove as needed
		const existingReferences = [...materials.reference];
		const existingRefs = [...matRefs.reference];
		materials.reference = Array.from({ length: referenceCount }, (_, i) =>
			i < existingReferences.length
				? resizeReferenceMaterial(existingReferences[i], isotopeCount)
				: createReferenceMaterial(isotopeCount)
		);

		matRefs.reference = Array.from({ length: referenceCount }, (_, i) =>
			i < existingRefs.length ? existingRefs[i] : undefined
		);

		const existingSelections = [...referenceIsotopeSelections];
		referenceIsotopeSelections = Array.from({ length: referenceCount }, (_, i) =>
			i < existingSelections.length ? existingSelections[i] : new Set<string>()
		);

		const existingCatalogItemIds = [...referenceCatalogItemIds];
		referenceCatalogItemIds = Array.from({ length: referenceCount }, (_, i) =>
			i < existingCatalogItemIds.length ? existingCatalogItemIds[i] : null
		);

		updateIsotopeReferenceMap(isotopeCount, referenceCount);
	}

	function updateUnknownData(newCount: number) {
		unknownCount = newCount;

		// Preserve existing unknown materials, only add/remove as needed
		const existingUnknowns = [...materials.unknown];
		const existingRefs = [...matRefs.unknown];

		materials.unknown = Array.from({ length: unknownCount }, (_, i) =>
			i < existingUnknowns.length ? existingUnknowns[i] : createUnknownMaterial(isotopeCount)
		);

		matRefs.unknown = Array.from({ length: unknownCount }, (_, i) =>
			i < existingRefs.length ? existingRefs[i] : undefined
		);
	}

	function syncIsotopeDependentState(newCount: number) {
		isotopeCount = newCount;

		const existingIsoRef = [...isoRef];
		isoRef = Array.from({ length: newCount }, (_, i) =>
			i < existingIsoRef.length ? existingIsoRef[i] : undefined
		);

		const existingReferences = [...materials.reference];
		materials.reference = Array.from({ length: referenceCount }, (_, i) => {
			const currentReference = existingReferences[i] || createReferenceMaterial(newCount);
			return resizeReferenceMaterial(currentReference, newCount);
		});

		materials.unknown = materials.unknown.map((unk) => resizeUnknownMaterial(unk, newCount));

		updateIsotopeReferenceMap(newCount, referenceCount);
	}

	function getPersistedWizardState(): PersistedWizardState {
		return {
			step,
			title,
			isotopeCount,
			isotopeInfo,
			referenceCount,
			unknownCount,
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

	function clearPersistedWizardState() {
		if (!browser) {
			return;
		}

		window.sessionStorage.removeItem(AUTH_STATE_STORAGE_KEY);
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
			step = savedState.step ?? 0;
			title = savedState.title ?? 'NAA Analysis';
			isotopeInfo = Array.isArray(savedState.isotopeInfo)
				? savedState.isotopeInfo
				: [createIsotopeInfo()];
			referenceCount = savedState.referenceCount ?? 1;
			unknownCount = savedState.unknownCount ?? 1;
			materials = savedState.materials ?? {
				reference: [createReferenceMaterial(isotopeInfo.length || 1)],
				unknown: [createUnknownMaterial(isotopeInfo.length || 1)]
			};
			referenceIsotopeSelections = Array.isArray(savedState.referenceIsotopeSelections)
				? savedState.referenceIsotopeSelections.map((selection) => new Set(selection))
				: [new Set<string>()];
			isotopeReferenceMap = Array.isArray(savedState.isotopeReferenceMap)
				? savedState.isotopeReferenceMap
				: [0];
			referenceCatalogItemIds = Array.isArray(savedState.referenceCatalogItemIds)
				? savedState.referenceCatalogItemIds.map((id) => id ?? null)
				: [null];

			isoRef = Array.from({ length: isotopeInfo.length }, () => undefined);
			matRefs = {
				reference: Array.from({ length: referenceCount }, () => undefined),
				unknown: Array.from({ length: unknownCount }, () => undefined)
			};
			syncIsotopeDependentState(isotopeInfo.length);
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
		loginUrl.searchParams.set('post_login_redirect_uri', currentUrl.pathname + currentUrl.search + currentUrl.hash);

		persistWizardState();
		window.location.assign(loginUrl.toString());
	}

	let step = $state(0);

	let title = $state('NAA Analysis');

	// isotope information
	let isoIndex = $derived(getIsotopeIndex(step));
	let isotopeCount = $state(1);
	// holds the reference to each isotope info component
	let isoRef: (IsotopeInfo | undefined)[] = $state([undefined]);
	// array of isotope information
	let isotopeInfo: IsotopeInfoType[] = $state([createIsotopeInfo()]);
	// computed isotope information
	let isoComp = $derived(isotopeInfo.map(isoGA));

	// step 1: number of isotopes
	// step 2 to 1 + isotopeCount: isotope information
	// step 2 + isotopeCount: number of references
	// step 3 + isotopeCount to 2 + isotopeCount + referenceCount: reference information
	// step 3 + isotopeCount + referenceCount: number of unknowns
	// step 4 + isotopeCount + referenceCount to 3 + isotopeCount + referenceCount + unknownCount:
	// unknown material information
	// step 4 + isotopeCount + referenceCount + unknownCount: review
	let userIsAuthenticated = $state(false);
	let localAuthNotice = $state('');
	let currentHostname = $state(browser ? window.location.hostname : '');
	let showSignInPrompt = $derived(
		currentHostname !== '' && !isEnvironmentWithoutSignIn(currentHostname)
	);
	let referenceCount = $state(1);
	let refIdx = $derived(
		step >= getReferenceInfoStartStep(isotopeCount, userIsAuthenticated) &&
		step < getUnknownCountStep(isotopeCount, referenceCount, userIsAuthenticated)
			? step - getReferenceInfoStartStep(isotopeCount, userIsAuthenticated)
			: -1
	);
	let unknownIdx = $derived(
		step >= getUnknownInfoStartStep(isotopeCount, referenceCount, userIsAuthenticated)
			? step - getUnknownInfoStartStep(isotopeCount, referenceCount, userIsAuthenticated)
			: -1
	);
	let unknownCount = $state(1);
	let matRefs = $state({
		reference: [undefined] as (RefMatInfo | undefined)[],
		unknown: [undefined] as (MaterialInfo | undefined)[]
	});
	let referenceIsotopeSelections = $state<Set<string>[]>([new Set<string>()]);
	let referenceCatalogItemIds = $state<(string | null)[]>([null]);
	let referenceCatalogMessage = $state('');
	let referenceCatalogError = $state('');
	let referenceCatalogWarning = $state('');
	let isotopeMeasurementLinks = $state<IsotopeMeasurementLink[]>([]);
	let isotopeCatalogById = $state<Record<string, IsotopeCatalogItem>>({});
	let hasRequestedIsotopeCatalog = $state(false);
	let hasRequestedIsotopeMeasurementLinks = $state(false);
	let materials = $state({
		reference: [createReferenceMaterial(1)],
		unknown: [createUnknownMaterial(1)]
	});
	let isotopeReferenceMap = $state<number[]>([0]);
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

	$effect(() => {
		const currentMap = isotopeReferenceMap ?? [];
		const nextMap = Array.from({ length: isotopeCount }, (_, index) => {
			const selectionKey = getIsotopeSelectionKey(index);
			const coveringRefs = referenceIsotopeSelections
				.map((selection, refIndex) =>
					selection instanceof Set && selection.has(selectionKey) ? refIndex : -1
				)
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
		isotopeInfo.map((iso, index) => {
			const referenceIndex = getLinkedReferenceIndex(index);
			const reference = materials.reference[referenceIndex] ?? materials.reference[0];
			return materials.unknown.map((unk) => EGA(reference, unk, iso, index));
		})
	);

	let nextButtonText = $derived(
		getNextButtonText(step, isotopeCount, referenceCount, unknownCount, userIsAuthenticated)
	);
	let backButtonText = $derived(
		getBackButtonText(step, isotopeCount, referenceCount, unknownCount, userIsAuthenticated)
	);
	let stepTitle = $derived(
		getStepTitle(step, isotopeCount, referenceCount, unknownCount, userIsAuthenticated)
	);
	let stepType = $derived(
		getStepType(step, isotopeCount, referenceCount, unknownCount, userIsAuthenticated)
	);
	let progressPercentage = $derived(
		getProgressPercentage(step, isotopeCount, referenceCount, unknownCount, userIsAuthenticated)
	);
	let totalSteps = $derived(
		getReviewStep(isotopeCount, referenceCount, unknownCount, userIsAuthenticated)
	);
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

		void isUserAuthenticated().then((isAuthenticated) => {
			if (!cancelled) {
				userIsAuthenticated = isAuthenticated;
			}
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!userIsAuthenticated) {
			return;
		}

		const onlyHasBlankManualIsotope =
			isotopeInfo.length === 1 &&
			!isotopeInfo[0]?.elementName &&
			!isotopeInfo[0]?.isotopeName &&
			isotopeInfo[0]?.energy === 0 &&
			isotopeInfo[0]?.halfLife === 0;

		if (onlyHasBlankManualIsotope) {
			isotopeInfo = [];
			syncIsotopeDependentState(0);
		}
	});

	$effect(() => {
		if (!userIsAuthenticated) {
			return;
		}

		if (isotopeInfo.length !== isotopeCount) {
			syncIsotopeDependentState(isotopeInfo.length);
		}
	});

	$effect(() => {
		if (!browser || !userIsAuthenticated) {
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
		if (
			idMatches.length === 1 &&
			getFiniteEnergy(isotopes[idMatches[0].index]?.energy) === null
		) {
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

	function applyReferenceMaterialCatalogItem(item: ReferenceMaterialCatalogItem) {
		referenceCatalogMessage = '';
		referenceCatalogError = '';
		referenceCatalogWarning = '';

		if (referenceCatalogItemIds.includes(item.id)) {
			referenceCatalogError = 'This reference irradiation is already selected.';
			return;
		}

		const sourceMaterial = item.latestCounting?.referenceMaterial;
		if (!sourceMaterial) {
			referenceCatalogError = 'Selected catalog entry does not contain a saved counting.';
			return;
		}

		const nextReference = createReferenceMaterial(isotopeCount);
		nextReference.NETL_code = sourceMaterial.NETL_code;
		nextReference.sampleName = sourceMaterial.sampleName;
		nextReference.mass = sourceMaterial.mass;
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

		const hasOnlyPlaceholder =
			referenceCatalogItemIds.length === 1 && referenceCatalogItemIds[0] === null;

		let nextReferences: ReferenceMaterial[];
		let nextSelections: Set<string>[];
		let nextCatalogItemIds: (string | null)[];

		if (hasOnlyPlaceholder) {
			nextReferences = [nextReference];
			nextSelections = [matchedSelection];
			nextCatalogItemIds = [item.id];
		} else {
			nextReferences = [...materials.reference, nextReference];
			nextSelections = [...referenceIsotopeSelections, matchedSelection];
			nextCatalogItemIds = [...referenceCatalogItemIds, item.id];
		}

		materials = {
			...materials,
			reference: nextReferences
		};
		referenceIsotopeSelections = nextSelections;
		referenceCatalogItemIds = nextCatalogItemIds;
		referenceCount = nextReferences.length;
		updateIsotopeReferenceMap(isotopeCount, nextReferences.length);

		referenceCatalogMessage =
			`Added ${sourceMaterial.NETL_code} (${sourceMaterial.sampleName}). Covers ${matchedSelection.size} isotope row(s).`;
		referenceCatalogWarning = proxyWarnings.join(' ');
	}

	function removeReferenceMaterialCatalogItem(referenceIndex: number) {
		if (referenceIndex < 0 || referenceIndex >= materials.reference.length) {
			return;
		}

		referenceCatalogMessage = '';
		referenceCatalogError = '';
		referenceCatalogWarning = '';

		const nextReferences = materials.reference.filter((_, idx) => idx !== referenceIndex);
		const nextSelections = referenceIsotopeSelections.filter((_, idx) => idx !== referenceIndex);
		const nextCatalogItemIds = referenceCatalogItemIds.filter((_, idx) => idx !== referenceIndex);

		if (nextReferences.length === 0) {
			materials = {
				...materials,
				reference: [createReferenceMaterial(isotopeCount)]
			};
			referenceIsotopeSelections = [new Set<string>()];
			referenceCatalogItemIds = [null];
			referenceCount = 1;
			updateIsotopeReferenceMap(isotopeCount, 1);
			return;
		}

		materials = {
			...materials,
			reference: nextReferences
		};
		referenceIsotopeSelections = nextSelections;
		referenceCatalogItemIds = nextCatalogItemIds;
		referenceCount = nextReferences.length;
		updateIsotopeReferenceMap(isotopeCount, nextReferences.length);
	}

	function getCoveringReferenceIndicesForIsotope(isotopeIndex: number): number[] {
		const selectionKey = getIsotopeSelectionKey(isotopeIndex);
		return referenceIsotopeSelections
			.map((selection, referenceIndex) =>
				selection instanceof Set && selection.has(selectionKey) ? referenceIndex : -1
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

	function getIsotopeDisplayName(isotope: IsotopeInfoType, index: number): string {
		const energy = getFiniteEnergy(isotope.energy);
		const energyLabel = energy !== null ? ` @ ${energy.toLocaleString()} keV` : '';

		if (isotope.elementName && isotope.isotopeName) {
			return `${isotope.elementName}-${isotope.isotopeName}${energyLabel}`;
		}

		return `Isotope ${index + 1}${energyLabel}`;
	}

	function validateCurrentStep(): boolean {
		validationErrors = [];

		if (stepType === StepType.ISOTOPE_SELECT) {
			if (isotopeCount < 1) {
				validationErrors = ['Please select at least one isotope from the database'];
				return false;
			}

			const hasInvalidSelection = isotopeInfo.some(
				(isotope) =>
					!isotope.elementName ||
					!isotope.isotopeName ||
					isotope.energy <= 0 ||
					isotope.halfLife <= 0
			);

			if (hasInvalidSelection) {
				validationErrors = ['One or more selected isotopes could not be loaded correctly'];
				return false;
			}
		}

		// Validate isotope count step
		if (stepType === StepType.ISOTOPE_COUNT) {
			if (!Number.isInteger(isotopeCount) || isotopeCount < 1) {
				validationErrors = ['Please enter a positive integer for the number of isotopes'];
				return false;
			}
		}

		// Validate isotope info steps
		if (stepType === StepType.ISOTOPE_INFO && isoIndex >= 0 && isoIndex < isotopeCount) {
			if (isoRef[isoIndex] && typeof isoRef[isoIndex]?.validateIsotopeInfo === 'function') {
				const isValid = isoRef[isoIndex]!.validateIsotopeInfo();
				if (!isValid) {
					if (typeof isoRef[isoIndex]?.showValidationErrors === 'function') {
						isoRef[isoIndex]!.showValidationErrors();
					}
					const errors = isoRef[isoIndex]!.getValidationErrors?.() || [
						'Please fill in all required fields'
					];
					validationErrors = errors;
					return false;
				}
			}
		}

		// Validate reference count step
		if (stepType === StepType.REFERENCE_COUNT) {
			if (!Number.isInteger(referenceCount) || referenceCount < 1) {
				validationErrors = [
					'Please enter a positive integer for the number of reference materials'
				];
				return false;
			}
		}

		// Validate reference material steps
		if (refIdx >= 0 && refIdx < referenceCount) {
			if (userIsAuthenticated) {
				const selectedReferenceIds = referenceCatalogItemIds.filter(
					(id): id is string => typeof id === 'string'
				);
				if (selectedReferenceIds.length === 0) {
					validationErrors = ['Please select at least one reference irradiation before continuing.'];
					return false;
				}

				const missingReferenceIrradiations = isotopeInfo
					.map((iso, index) => ({ iso, index }))
					.filter(({ index }) => getCoveringReferenceIndicesForIsotope(index).length === 0)
					.map(({ iso, index }) => getIsotopeDisplayName(iso, index));

				if (missingReferenceIrradiations.length > 0) {
					validationErrors = [
						`Missing reference irradiations for selected isotopes: ${missingReferenceIrradiations.join(', ')}`
					];
					return false;
				}
			} else {
				const currentRef = matRefs.reference[refIdx];
				if (currentRef && typeof currentRef.validateRefMatInfo === 'function') {
					const isValid = currentRef.validateRefMatInfo();
					if (!isValid) {
						if (typeof currentRef.showValidationErrors === 'function') {
							currentRef.showValidationErrors();
						}
						const errors = currentRef.getValidationErrors?.() || [
							'Please fill in all required fields'
						];
						validationErrors = errors;
						return false;
					}
				}
			}
		}

		// Validate unknown count step
		if (stepType === StepType.UNKNOWN_COUNT) {
			if (!Number.isInteger(unknownCount) || unknownCount < 1) {
				validationErrors = ['Please enter a positive integer for the number of unknown materials'];
				return false;
			}
		}

		// Validate unknown material steps
		if (stepType === StepType.UNKNOWN_INFO && unknownIdx >= 0 && unknownIdx < unknownCount) {
			if (
				matRefs.unknown[unknownIdx] &&
				typeof matRefs.unknown[unknownIdx]?.validateMaterialInfo === 'function'
			) {
				const isValid = matRefs.unknown[unknownIdx]!.validateMaterialInfo();
				if (!isValid) {
					if (typeof matRefs.unknown[unknownIdx]?.showValidationErrors === 'function') {
						matRefs.unknown[unknownIdx]!.showValidationErrors();
					}
					const errors = matRefs.unknown[unknownIdx]!.getValidationErrors?.() || [
						'Please fill in all required fields'
					];
					validationErrors = errors;
					return false;
				}
			}
		}

		return true;
	}

	function getReferenceLabel(index: number): string {
		const ref = materials.reference[index];
		const labelBase = ref?.NETL_code || ref?.sampleName;
		return labelBase ? `${labelBase}` : `Reference ${index + 1}`;
	}

	const next = () => {
		// Prevent navigating beyond the final review step
		if (step >= totalSteps) return;

		// Clear previous errors
		validationErrors = [];

		// Validate before proceeding (skip validation only for welcome step)
		if (step > 0 && step < totalSteps) {
			if (!validateCurrentStep()) {
				// Show error message
				alert('Please complete all required fields before proceeding.');
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
				<li>Automatic loading of isotope information from the database.</li>
				<li>Automatic loading of reference materials from the database.</li>
			</ul>
			<br />
			<p>Note: This software has NOT gone through formal validation or verification processes.</p>
			<br />
			<p>
				In this version (v{APP_VERSION}), the main focus is to add loading of reference materials from a
				database.
			</p>
			<br />
			<h2 class="text-2xl font-bold">
				Future additions, not planned yet (note: can be implemented in any order):
			</h2>
			<ul class="list-inside list-disc">
				<li>Authentication</li>
				<li>Modifications to the database</li>
				<li>Automatic loading of irradiation data.</li>
				<li>Exporting reports</li>
				<li>Interference Adjustment</li>
			</ul>
			<br />
			<button type="button" onclick={next}>Get Started</button>
		{:else if stepType === StepType.ISOTOPE_COUNT && !userIsAuthenticated}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			{#if showSignInPrompt}
				<p>Hate typing in isotope information? Sign in here.</p>
				<br />
				<button
					type="button"
					class="btn variant-filled-primary"
					onclick={handleSignIn}
				>
					Sign In
				</button>
				{#if localAuthNotice}
					<p class="mt-3 text-sm text-amber-700">{localAuthNotice}</p>
				{/if}
				<br />
			{/if}
			<PageCounter pageType="elements" pageCount={isotopeCount} updateFxn={updateIsotopeData} />
			<br />
			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if stepType === StepType.ISOTOPE_INFO && !userIsAuthenticated}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>
				This is where you enter information about isotope {isoIndex + 1}. This is used in the
				concentration calculations.
			</p>
			<br /><br />
			<IsotopeInfo bind:this={isoRef[isoIndex]} bind:isotopeInfo={isotopeInfo[isoIndex]} />
			<br />
			<details>
				<summary>Expand for debug information</summary>
				<ComputedDisplay
					title="Computed Isotope Information for Isotope {isoIndex + 1}"
					data={isoComp[isoIndex]}
				/>
			</details>

			<br />

			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
			<br /><br />
		{:else if stepType === StepType.ISOTOPE_SELECT}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>
				Search the isotope catalog and add the isotopes you want to analyze. The selected
				entries replace the manual isotope count and isotope information steps.
			</p>
			<br />
			<IsotopeViewer bind:selectedIsotopes={isotopeInfo} />
			<br />
			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if stepType === StepType.REFERENCE_COUNT}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<PageCounter
				pageType="reference materials"
				pageCount={referenceCount}
				updateFxn={updateReferenceData}
			/>
			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if refIdx >= 0 && refIdx < referenceCount}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			{#if userIsAuthenticated}
				<p>
					Select reference irradiations from the catalog below. You can combine multiple
					irradiations to cover all isotopes, then choose which irradiation to use per isotope.
				</p>
				<br />
				<ReferenceMaterialViewer
					isotopeIds={selectableReferenceCatalogIsotopeIds}
					selectedItemIds={referenceCatalogItemIds.filter((id): id is string => typeof id === 'string')}
					currentSelectionId={null}
					onSelectItem={(item: ReferenceMaterialCatalogItem) => {
						applyReferenceMaterialCatalogItem(item);
					}}
				/>

				{#if referenceCatalogItemIds.filter((id): id is string => typeof id === 'string').length > 0}
					<div class="mt-4 space-y-2 rounded border border-gray-300 p-3">
						<h3 class="text-lg font-bold">Selected reference irradiations</h3>
						{#each referenceCatalogItemIds as catalogId, selectedIndex (selectedIndex)}
							{#if catalogId}
								{@const refMat = materials.reference[selectedIndex]}
								{@const irrEnd = refMat?.irradiationEnd ? new Date(refMat.irradiationEnd).toLocaleString() : '—'}
								{@const irrStart = (refMat?.irradiationEnd && refMat?.irradiationTime) ? new Date(new Date(refMat.irradiationEnd).getTime() - refMat.irradiationTime * 1000).toLocaleString() : '—'}
								<div class="flex items-center justify-between gap-3 rounded border border-gray-200 p-2">
									<div>
										<strong>{getReferenceLabel(selectedIndex)}</strong>
										<span class="ml-2 text-sm">{refMat?.NETL_code ?? ''}{refMat?.sampleName ? ` (${refMat.sampleName})` : ''}</span>
										<span class="ml-2 text-sm text-gray-500">{irrStart} → {irrEnd}</span>
									</div>
									<button
										type="button"
										class="rounded border border-gray-300 px-2 py-1 text-sm"
										onclick={() => removeReferenceMaterialCatalogItem(selectedIndex)}
									>
										Remove
									</button>
								</div>
							{/if}
						{/each}
					</div>

					{@const isotopesMappingNeeded = isotopeInfo.filter((_, i) => getCoveringReferenceIndicesForIsotope(i).length !== 1)}
					{#if isotopesMappingNeeded.length > 0}
						<div class="mt-4 space-y-2 rounded border border-gray-300 p-3">
							<h3 class="text-lg font-bold">Isotope assignment</h3>
							{#each isotopeInfo as isotope, isotopeIndex (isotopeIndex)}
								{@const availableReferences = getCoveringReferenceIndicesForIsotope(isotopeIndex)}
								{#if availableReferences.length !== 1}
									<div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] md:items-center">
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
											<p class="text-sm text-red-700">No selected irradiation covers this isotope.</p>
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
					<p class="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
						{referenceCatalogWarning}
					</p>
				{/if}
			{:else}
				<p>
					This is where you enter information about the reference material. This is used when
					comparing to the unknown material to determine concentrations.
				</p>
				<br /><br />
				<!-- <pre>{JSON.stringify(materials, null, 4)}</pre> -->
				<RefMatInfo
					{isotopeCount}
					{isotopeInfo}
					usedIsotopeLabels={getUsedIsotopeLabels(refIdx)}
					getRoiIndex={getRoiIndexFn}
					bind:selected={referenceIsotopeSelections[refIdx]}
					bind:refMatInfo={materials.reference[refIdx]}
					bind:this={matRefs.reference[refIdx]}
				/>

				<ComputedDisplay title="Reference Material Information" data={matComp.reference[refIdx]} />
				<ComputedDisplay
					title="Reference and Isotope Information"
					data={matIsoComp.map((item) => item.reference[refIdx])}
				/>
			{/if}

			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if stepType === StepType.UNKNOWN_COUNT}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<PageCounter
				pageType="unknown materials"
				pageCount={unknownCount}
				updateFxn={updateUnknownData}
			/>
			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if stepType === StepType.UNKNOWN_INFO}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>
				This is where you enter information about the unknown material you are trying to understand.
			</p>
			<br /><br />
			<MaterialInfo
				{isotopeCount}
				{isotopeInfo}
				getRoiIndex={getRoiIndexFn}
				bind:this={matRefs.unknown[unknownIdx]}
				bind:materialInfo={materials.unknown[unknownIdx]}
			/>

			<br />
			<ComputedDisplay
				title="Unknown Material Information for Unknown {unknownIdx + 1}"
				data={matComp.unknown[unknownIdx]}
			/>
			<ComputedDisplay
				title="Unknown and Isotope Information for Unknown {unknownIdx + 1}"
				data={matIsoComp.map((item) => item.unknown[unknownIdx])}
			/>

			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if stepType === StepType.REVIEW}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Please review all information you entered and see computed values below.</p>
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

			<ComputedDisplay title="Isotope Information" data={isotopeInfo} />
			<br />
			<ComputedDisplay title="Material Information" data={materials} />
			<br /><br />

			<h3 class="text-xl font-bold">Computed Values:</h3>
			<ComputedDisplay level={4} title="Isotope Computed Values" data={isoComp} />
			<ComputedDisplay level={4} title="Material Computed Values" data={matComp} />
			<ComputedDisplay level={4} title="Material and Isotope Computed Values" data={matIsoComp} />
			<ComputedDisplay level={4} title="Multi Material Computed Values" data={multiMatComp} />
			<ComputedDisplay
				level={4}
				title="Computed Values that use everything"
				data={everythingComp}
			/>
			<br />
			<button type="button" onclick={prev}>{backButtonText}</button>
		{/if}
		<br />
	</form>
</div>
