<script lang="ts">
    import { SvelteMap } from 'svelte/reactivity';
	import IsotopeViewer from '$lib/components/IsotopeViewer.svelte';
	import AuthGate from '$lib/components/AuthGate.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';
	import ReferenceDatasheetForm from '$lib/components/ReferenceDatasheetForm.svelte';
	import IsotopeMeasurementMappingForm from '$lib/components/IsotopeMeasurementMappingForm.svelte';
	import type { IsotopeCatalogItem, IsotopeInfo, ReferenceMaterial } from '$lib/types.js';
	import { createReferenceMaterial } from '$lib/utils/naaUtils.js';

	type ReferenceMaterialCountingWriteRequest = {
		countingLabel: string;
		referenceMaterial: ReferenceMaterial;
	};

	type ReferenceMaterialWriteRequest = {
		referenceKey: string;
		notes: string;
		referenceDatasheetId: string;
		isotopes: Array<{
			isotopeId: string;
			energy: number;
		}>;
		countings: ReferenceMaterialCountingWriteRequest[];
	};

	type ReferenceDatasheetEntry = {
		label: string;
		concentration: number;
		uncertainty: number;
		unit: 'ppm' | 'percentage';
	};

	type ReferenceDatasheet = {
		id: string;
		sampleName: string;
		entries: ReferenceDatasheetEntry[];
		createdAt?: string | null;
	};

	type IsotopeMeasurementLink = {
		id: string;
		measuredIsotope: {
			isotopeId: string;
		};
		targetIsotope: {
			isotopeId: string;
		};
		notes?: string;
		createdAt?: string;
	};

	type SaveReferenceMaterialResult = {
		created: boolean;
		appendedCountings: number;
		totalCountings: number;
	};

	const WRITER_ROLE = 'isotope_writer';
	const DEFAULT_COUNTING_LABEL_PREFIX = 'Counting';

	function createCounting(isotopeCount: number): ReferenceMaterial {
		return createReferenceMaterial(isotopeCount);
	}

	function cloneReferenceMaterial(referenceMaterial: ReferenceMaterial): ReferenceMaterial {
		return {
			...referenceMaterial,
			counts: referenceMaterial.counts.map((count) => ({ ...count })),
			concentrationUnits: [...referenceMaterial.concentrationUnits],
			knownConcentration: [...referenceMaterial.knownConcentration],
			knownUncertainty: [...referenceMaterial.knownUncertainty]
		};
	}

	function resizeReferenceMaterial(reference: ReferenceMaterial, isotopeCount: number): ReferenceMaterial {
		const nextReference = createReferenceMaterial(isotopeCount);
		const existingCounts = reference.counts || [];

		nextReference.NETL_code = reference.NETL_code;
		nextReference.sampleName = reference.sampleName;
		nextReference.mass = reference.mass;
		nextReference.irradiationTime = reference.irradiationTime;
		nextReference.irradiationEnd = reference.irradiationEnd;
		nextReference.measurementStartTime = reference.measurementStartTime;
		nextReference.decayTime = reference.decayTime;
		nextReference.liveTime = reference.liveTime;
		nextReference.realTime = reference.realTime;
		nextReference.fluence = reference.fluence;
		nextReference.irradiationType = reference.irradiationType;
		nextReference.dtType = reference.dtType;
		nextReference.counts = Array.from({ length: isotopeCount }, (_, index) => {
			const count = existingCounts[index];
			return {
				grossCounts: count?.grossCounts ?? 0,
				netCounts: count?.netCounts ?? 0,
				uncertainty: count?.uncertainty ?? 0,
				grossCountsPositionalCorrectionFactor: count?.grossCountsPositionalCorrectionFactor ?? 1,
				netCountsPositionalCorrectionFactor: count?.netCountsPositionalCorrectionFactor ?? 1,
				uncertaintyPositionalCorrectionFactor: count?.uncertaintyPositionalCorrectionFactor ?? 1
			};
		});

		nextReference.knownConcentration = Array.from({ length: isotopeCount }, (_, index) =>
			reference.knownConcentration?.[index] ?? 0
		);
		nextReference.knownUncertainty = Array.from({ length: isotopeCount }, (_, index) =>
			reference.knownUncertainty?.[index] ?? 0
		);
		nextReference.concentrationUnits = Array.from({ length: isotopeCount }, (_, index) =>
			reference.concentrationUnits?.[index]
		);

		return nextReference;
	}

	function defaultCountingLabel(index: number): string {
		return `${DEFAULT_COUNTING_LABEL_PREFIX} ${index + 1}`;
	}

	let authGateRef = $state<AuthGate | null>(null);
	let isSubmitting = $state(false);
	let submitError = $state('');
	let submitMessage = $state('');

	let activeTab = $state<'irradiation' | 'datasheet' | 'mappings'>('irradiation');

	let selectedIsotopes = $state<IsotopeInfo[]>([]);
	let referenceMaterialNotes = $state('');
	let referenceDatasheets = $state<ReferenceDatasheet[]>([]);
	let datasheetsLoading = $state(false);
	let datasheetsError = $state('');
	let selectedReferenceDatasheetId = $state('');
	let datasheetSearchTerm = $state('');
	let datasheetMatchError = $state('');
	let isotopeMeasurementLinks = $state<IsotopeMeasurementLink[]>([]);
	let isotopeCatalogById = new SvelteMap<string, IsotopeCatalogItem>();
	let countingLabels = $state<string[]>([defaultCountingLabel(0)]);
	let countings = $state<ReferenceMaterial[]>([createCounting(0)]);
	let countingRefs = $state<(RefMatInfo | undefined)[]>([undefined]);
	let lastResizedIsotopeCount = $state(-1);

	let isotopeCount = $derived(selectedIsotopes.length);
	let filteredReferenceDatasheets = $derived.by(() => {
		const query = datasheetSearchTerm.trim().toLowerCase();
		if (!query) {
			return referenceDatasheets;
		}

		return referenceDatasheets.filter((item) => {
			const sampleName = (item.sampleName || '').toLowerCase();
			const id = (item.id || '').toLowerCase();
			return sampleName.includes(query) || id.includes(query);
		});
	});

	function getReferenceKeyFromCounting(referenceMaterial: ReferenceMaterial): string {
		const netlCode = referenceMaterial.NETL_code?.trim();
		const sampleName = referenceMaterial.sampleName?.trim();
		return [netlCode, sampleName].filter(Boolean).join('::');
	}

	function ensureCountingRefsLength(expectedLength: number) {
		if (countingRefs.length === expectedLength) {
			return;
		}

		countingRefs = Array.from({ length: expectedLength }, (_, index) => countingRefs[index]);
	}

	function normalizeLabel(value: string): string {
		return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
	}

	function arraysEqual<T>(left: T[] | undefined, right: T[]): boolean {
		if (!Array.isArray(left) || left.length !== right.length) {
			return false;
		}

		for (let index = 0; index < right.length; index++) {
			if (left[index] !== right[index]) {
				return false;
			}
		}

		return true;
	}

	function uniqueNormalizedLabels(labels: string[]): string[] {
		const normalized = labels
			.map((label) => normalizeLabel(label))
			.filter((label) => label.length > 0);

		return normalized.filter((label, index) => normalized.indexOf(label) === index);
	}

	function extractIsotopeId(link: IsotopeMeasurementLink, side: 'measured' | 'target'): string {
		const entry = side === 'measured' ? link.measuredIsotope : link.targetIsotope;
		const objectId = (entry as { isotopeId?: string; id?: string } | undefined)?.isotopeId
			?? (entry as { isotopeId?: string; id?: string } | undefined)?.id
			?? '';
		const flatId = (link as unknown as Record<string, unknown>)[
			side === 'measured' ? 'measuredIsotopeId' : 'targetIsotopeId'
		];
		const candidate = typeof flatId === 'string' && flatId.trim().length > 0 ? flatId : objectId;
		return candidate.trim();
	}

	function isotopeLabelCandidates(isotope: IsotopeInfo): string[] {
		const isotopeName = typeof isotope.isotopeName === 'string' ? isotope.isotopeName : '';
		const elementName = typeof isotope.elementName === 'string' ? isotope.elementName : '';
		const isotopeMatch = isotopeName.match(/^([A-Za-z]+)-?(\d+[A-Za-z]*)$/);
		const candidates = [isotopeName, elementName];
		if (isotopeMatch) {
			candidates.push(`${isotopeMatch[1]}-${isotopeMatch[2]}`);
			candidates.push(`${isotopeMatch[1]}${isotopeMatch[2]}`);
			candidates.push(isotopeMatch[1]);
		}

		return uniqueNormalizedLabels(candidates);
	}

	function catalogLabelCandidates(isotopeId: string): string[] {
		const catalogItem = isotopeCatalogById.get(isotopeId);
		if (!catalogItem) {
			return [];
		}

		const candidates = [
			catalogItem.elementName,
			catalogItem.shortName,
			`${catalogItem.shortName}-${catalogItem.massNumber}${catalogItem.suffix}`
		];

		return uniqueNormalizedLabels(candidates);
	}

	function proxyLabelCandidates(isotope: IsotopeInfo): string[] {
		const candidates = [...isotopeLabelCandidates(isotope)];
		const measuredId = isotope.id?.trim();

		if (!measuredId) {
			return candidates;
		}

		for (const link of isotopeMeasurementLinks) {
			const linkMeasuredId = extractIsotopeId(link, 'measured');
			const linkTargetId = extractIsotopeId(link, 'target');

			if (linkMeasuredId === measuredId) {
				for (const proxyCandidate of catalogLabelCandidates(linkTargetId)) {
					if (!candidates.includes(proxyCandidate)) {
						candidates.push(proxyCandidate);
					}
				}
			}

			if (linkTargetId === measuredId) {
				for (const proxyCandidate of catalogLabelCandidates(linkMeasuredId)) {
					if (!candidates.includes(proxyCandidate)) {
						candidates.push(proxyCandidate);
					}
				}
			}
		}

		return candidates;
	}

	async function loadReferenceDatasheets() {
		datasheetsLoading = true;
		datasheetsError = '';
		try {
			const response = await fetch('/api/reference-datasheets', {
				method: 'GET',
				headers: { accept: 'application/json' }
			});

			const body = await response.json().catch(() => null);
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					await authGateRef?.refreshAuthState();
				}
				throw new Error(body?.error || `Request failed with status ${response.status}`);
			}

			referenceDatasheets = Array.isArray(body?.items) ? body.items : [];
			if (referenceDatasheets.length > 0 && !selectedReferenceDatasheetId) {
				selectedReferenceDatasheetId = referenceDatasheets[0].id;
			}
		} catch (error) {
			datasheetsError = error instanceof Error ? error.message : 'Unable to load reference datasheets.';
		} finally {
			datasheetsLoading = false;
		}
	}

	async function loadIsotopeCatalog() {
		try {
			const response = await fetch('/api/isotopes?limit=1000', {
				method: 'GET',
				headers: { accept: 'application/json' }
			});

			const body = await response.json().catch(() => null);
			if (!response.ok) {
				return;
			}

			const items = Array.isArray(body?.items) ? body.items : [];
			const nextCatalog = new SvelteMap<string, IsotopeCatalogItem>();
			for (const item of items as IsotopeCatalogItem[]) {
				if (item?.id) {
					nextCatalog.set(item.id, item);
				}
			}
			isotopeCatalogById = nextCatalog;
		} catch {
			// Best effort only. If the catalog is unavailable, the direct isotope labels still work.
		}
	}

	async function loadIsotopeMeasurementLinks() {
		try {
			const response = await fetch('/api/isotope-measurements', {
				method: 'GET',
				headers: { accept: 'application/json' }
			});

			const body = await response.json().catch(() => null);
			if (!response.ok) {
				return;
			}

			isotopeMeasurementLinks = Array.isArray(body?.items) ? body.items : [];
		} catch {
			// Best effort only. If proxy links are unavailable, direct matching still works.
		}
	}

	function applyDatasheetToCountings() {
		datasheetMatchError = '';
		if (!selectedReferenceDatasheetId || selectedIsotopes.length === 0) {
			return;
		}

		const selectedDatasheet = referenceDatasheets.find((item) => item.id === selectedReferenceDatasheetId);
		if (!selectedDatasheet) {
			return;
		}

		const entryMap = new SvelteMap<string, ReferenceDatasheetEntry>();
		for (const entry of selectedDatasheet.entries ?? []) {
			const key = normalizeLabel(entry.label);
			if (!key || entryMap.has(key)) {
				continue;
			}
			entryMap.set(key, entry);
		}

		const nextConcentration: number[] = [];
		const nextUncertainty: number[] = [];
		const nextUnits: Array<'ppm' | 'percentage' | undefined> = [];
		const missing: string[] = [];

		for (const isotope of selectedIsotopes) {
			const candidates = proxyLabelCandidates(isotope);
			const match = candidates.map((candidate) => entryMap.get(candidate)).find(Boolean);
			if (!match) {
				missing.push(isotope.isotopeName || isotope.elementName || 'Unknown isotope');
				nextConcentration.push(0);
				nextUncertainty.push(0);
				nextUnits.push(undefined);
				continue;
			}

			nextConcentration.push(match.concentration);
			nextUncertainty.push(match.uncertainty);
			nextUnits.push(match.unit);
		}

		datasheetMatchError =
			missing.length > 0
				? `Selected datasheet is missing concentration entries for: ${missing.join(', ')}`
				: '';

		const nextCountings = countings.map((counting) => {
			const concentrationsMatch = arraysEqual(counting.knownConcentration, nextConcentration);
			const uncertaintiesMatch = arraysEqual(counting.knownUncertainty, nextUncertainty);
			const unitsMatch = arraysEqual(counting.concentrationUnits, nextUnits);

			if (concentrationsMatch && uncertaintiesMatch && unitsMatch) {
				return counting;
			}

			return {
				...counting,
				knownConcentration: [...nextConcentration],
				knownUncertainty: [...nextUncertainty],
				concentrationUnits: [...nextUnits]
			};
		});

		if (nextCountings.some((counting, index) => counting !== countings[index])) {
			countings = nextCountings;
		}
	}

	$effect(() => {
		if (lastResizedIsotopeCount === isotopeCount) {
			return;
		}

		lastResizedIsotopeCount = isotopeCount;
		const nextCountings = countings.map((counting) => resizeReferenceMaterial(counting, isotopeCount));
		const changed = nextCountings.some((counting, index) => counting !== countings[index]);

		if (changed) {
			countings = nextCountings;
		}

		if (countingLabels.length !== countings.length) {
			countingLabels = Array.from({ length: countings.length }, (_, index) =>
				countingLabels[index] || defaultCountingLabel(index)
			);
		}

		ensureCountingRefsLength(countings.length);
	});

	$effect(() => {
		if (activeTab !== 'irradiation') {
			return;
		}

		if (isotopeCatalogById.size === 0) {
			void loadIsotopeCatalog();
		}

		if (isotopeMeasurementLinks.length === 0) {
			void loadIsotopeMeasurementLinks();
		}

		if (!datasheetsLoading && referenceDatasheets.length === 0 && !datasheetsError) {
			void loadReferenceDatasheets();
		}
	});

	$effect(() => {
		applyDatasheetToCountings();
	});

	function addCounting() {
		const template = countings[countings.length - 1] ?? createCounting(isotopeCount);
		const nextCounting = cloneReferenceMaterial(template);
		countings = [...countings, nextCounting];
		countingLabels = [...countingLabels, defaultCountingLabel(countings.length - 1)];
		countingRefs = [...countingRefs, undefined];
	}

	function removeCounting(index: number) {
		if (countings.length <= 1) {
			return;
		}

		countings = countings.filter((_, countingIndex) => countingIndex !== index);
		countingLabels = countingLabels.filter((_, countingIndex) => countingIndex !== index);
		countingRefs = countingRefs.filter((_, countingIndex) => countingIndex !== index);
	}

	function validateCountings(): boolean {
		submitError = '';
		if (!selectedReferenceDatasheetId) {
			submitError = 'Select a reference datasheet before saving an irradiation counting.';
			return false;
		}

		if (datasheetMatchError) {
			submitError = datasheetMatchError;
			return false;
		}

		if (selectedIsotopes.length === 0) {
			submitError = 'Select at least one isotope before saving a reference material.';
			return false;
		}

		for (let i = 0; i < countings.length; i++) {
			const ref = countingRefs[i];
			if (!ref || typeof ref.validateRefMatInfo !== 'function') {
				submitError = 'Form is still initializing. Please try again.';
				return false;
			}

			const valid = ref.validateRefMatInfo();
			if (!valid) {
				if (typeof ref.showValidationErrors === 'function') {
					ref.showValidationErrors();
				}
				const errors = ref.getValidationErrors?.() || ['Please complete all required fields.'];
				submitError = errors.join(' | ');
				return false;
			}
		}

		return true;
	}

	function buildPayload(): ReferenceMaterialWriteRequest {
		const firstCounting = countings[0];
		const isotopeSelections: ReferenceMaterialWriteRequest['isotopes'] = [];
		for (const isotope of selectedIsotopes) {
			if (typeof isotope.id !== 'string' || isotope.id.trim().length === 0) {
				continue;
			}

			const selection: ReferenceMaterialWriteRequest['isotopes'][number] = {
				isotopeId: isotope.id,
				energy: isotope.energy
			};

			isotopeSelections.push(selection);
		}

		if (isotopeSelections.length !== selectedIsotopes.length) {
			throw new Error('One or more selected isotopes are missing a catalog ID. Re-select isotopes and try again.');
		}

		return {
			referenceKey: getReferenceKeyFromCounting(firstCounting),
			notes: referenceMaterialNotes.trim(),
			referenceDatasheetId: selectedReferenceDatasheetId,
			isotopes: isotopeSelections,
			countings: countings.map((referenceMaterial, index) => ({
				countingLabel: countingLabels[index]?.trim() || defaultCountingLabel(index),
				referenceMaterial: {
					...referenceMaterial,
					referenceDatasheetId: selectedReferenceDatasheetId
				}
			}))
		};
	}

	async function saveReferenceMaterial(payload: ReferenceMaterialWriteRequest): Promise<SaveReferenceMaterialResult> {
		const response = await fetch('/api/reference-materials', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json'
			},
			body: JSON.stringify(payload)
		});

		const body = await response.json().catch(() => null);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				await authGateRef?.refreshAuthState();
			}
			throw new Error(body?.error || `Request failed with status ${response.status}`);
		}

		return {
			created: Boolean(body?.created),
			appendedCountings: Number(body?.appendedCountings ?? 0),
			totalCountings: Number(body?.totalCountings ?? 0)
		};
	}

	async function submitReferenceMaterial(writerAccess: boolean) {
		submitMessage = '';
		submitError = '';

		if (!writerAccess) {
			submitError = `Your account is signed in, but it does not have the '${WRITER_ROLE}' role required to save reference materials.`;
			return;
		}

		if (!validateCountings()) {
			return;
		}

		isSubmitting = true;
		try {
			const payload = buildPayload();
			const result = await saveReferenceMaterial(payload);
			submitMessage = result.created
				? `Reference material created with ${result.appendedCountings} counting(s).`
				: `Reference material updated. Appended ${result.appendedCountings} new counting(s). Total countings: ${result.totalCountings}.`;
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Unable to save reference material.';
		} finally {
			isSubmitting = false;
		}
	}

</script>

<svelte:head>
	<title>Add Reference Material</title>
</svelte:head>

<section class="writer-page">
	<div class="writer-page__hero">
		<p class="writer-page__eyebrow">Reference Material Library</p>
		<h1 class="writer-page__title">Add reference material</h1>
		<p class="writer-page__summary">
			Use the <strong>Irradiation</strong> tab to record counting data from irradiated reference
			materials, the <strong>Datasheet</strong> tab to enter certified concentration values from
			a reference material certificate, or <strong>A Measures B</strong> to define isotope proxy mappings.
		</p>
	</div>

	<div class="writer-tabs" role="tablist" aria-label="Reference material input type">
		<button
			role="tab"
			type="button"
			class="writer-tab"
			class:writer-tab--active={activeTab === 'irradiation'}
			aria-selected={activeTab === 'irradiation'}
			onclick={() => { activeTab = 'irradiation'; }}
		>
			Irradiation
		</button>
		<button
			role="tab"
			type="button"
			class="writer-tab"
			class:writer-tab--active={activeTab === 'datasheet'}
			aria-selected={activeTab === 'datasheet'}
			onclick={() => { activeTab = 'datasheet'; }}
		>
			Datasheet
		</button>
		<button
			role="tab"
			type="button"
			class="writer-tab"
			class:writer-tab--active={activeTab === 'mappings'}
			aria-selected={activeTab === 'mappings'}
			onclick={() => {
				activeTab = 'mappings';
			}}
		>
			A Measures B
		</button>
	</div>

	{#if activeTab === 'irradiation'}
	<AuthGate bind:this={authGateRef} requiredRole={WRITER_ROLE}>
		{#snippet children({ principal, writerAccess })}
			<div class="writer-card">
				<div class="writer-card__header">
					<div>
						<h2>Reference material entry</h2>
						<p>
							If a saved document already matches NETL code + sample name, new submissions append
							additional countings to that record.
						</p>
					</div>
					<div class="writer-card__identity">
						<span>Signed in as</span>
						<strong>{principal?.userDetails || principal?.userId || 'Unknown user'}</strong>
					</div>
				</div>

				{#if !writerAccess}
					<div class="writer-page__feedback writer-page__feedback--warning" role="status">
						This account is signed in, but it does not have the <code>{WRITER_ROLE}</code> role.
						Saving is disabled until that role is assigned.
					</div>
				{/if}

				<div class="writer-block">
					<label class="label">
						<span>Find Datasheet</span>
						<input
							class="input w-full"
							type="search"
							bind:value={datasheetSearchTerm}
							placeholder="Search by sample name or datasheet ID"
						/>
					</label>
					<label class="label">
						<span>Reference Datasheet</span>
						<select class="select w-full" bind:value={selectedReferenceDatasheetId} disabled={datasheetsLoading}>
							<option value="" disabled selected>Select a saved datasheet</option>
							{#each filteredReferenceDatasheets as datasheet (datasheet.id)}
								<option value={datasheet.id}>{datasheet.sampleName}</option>
							{/each}
						</select>
					</label>
					{#if filteredReferenceDatasheets.length === 0 && referenceDatasheets.length > 0}
						<p>No datasheets match your search.</p>
					{/if}
					{#if datasheetsError}
						<p class="writer-page__feedback writer-page__feedback--error">{datasheetsError}</p>
					{/if}
					{#if datasheetMatchError}
						<p class="writer-page__feedback writer-page__feedback--warning">{datasheetMatchError}</p>
					{/if}
				</div>

				<div class="writer-block">
					<IsotopeViewer bind:selectedIsotopes />
				</div>

				<div class="writer-block">
					<label class="label">
						<span>Notes (optional)</span>
						<textarea
							class="textarea w-full"
							bind:value={referenceMaterialNotes}
							rows="3"
							placeholder="Optional context for this reference material or counting batch"
						></textarea>
					</label>
				</div>

				{#each countings as counting, index (`${counting.NETL_code || 'counting'}-${index}`)}
					<div class="writer-block writer-block--counting">
						<div class="writer-counting__header">
							<h3>{defaultCountingLabel(index)}</h3>
							{#if countings.length > 1}
								<button
									type="button"
									class="btn writer-btn-secondary"
									onclick={() => removeCounting(index)}
								>
									Remove
								</button>
							{/if}
						</div>

						<label class="label">
							<span>Counting Label</span>
							<input class="input w-50" type="text" bind:value={countingLabels[index]} />
						</label>

						<RefMatInfo
							bind:this={countingRefs[index]}
							isotopeCount={isotopeCount}
							bind:refMatInfo={countings[index]}
							isotopeInfo={selectedIsotopes}
							concentrationReadOnly={true}
							getRoiIndex={() => []}
						/>
					</div>
				{/each}

				<div class="writer-form__actions">
					<button type="button" class="btn writer-btn-secondary" onclick={addCounting}>
						Add Another Counting
					</button>
					<button
						type="button"
						class="btn variant-filled-primary"
						disabled={isSubmitting || !writerAccess}
						onclick={() => {
							void submitReferenceMaterial(writerAccess);
						}}
					>
						{isSubmitting ? 'Saving...' : 'Save Reference Material'}
					</button>
				</div>

				{#if submitError}
					<p class="writer-page__feedback writer-page__feedback--error">{submitError}</p>
				{/if}

				{#if submitMessage}
					<p class="writer-page__feedback writer-page__feedback--success">{submitMessage}</p>
				{/if}
			</div>
		{/snippet}
	</AuthGate>
	{:else if activeTab === 'datasheet'}
		<ReferenceDatasheetForm />
	{:else}
		<IsotopeMeasurementMappingForm />
	{/if}
</section>

<style>
	.writer-page {
		--writer-text: rgb(15 23 42);
		--writer-muted: rgb(51 65 85);
		--writer-accent: rgb(71 85 105);
		--writer-card-bg: rgb(255 252 245 / 0.96);
		--writer-card-border: rgb(15 23 42 / 0.08);
		--writer-card-shadow: 0 28px 60px rgb(15 23 42 / 0.12);
		--writer-warning-border: rgb(245 158 11 / 0.28);
		--writer-identity-bg: rgb(15 23 42 / 0.05);
		--writer-error-bg: rgb(254 242 242);
		--writer-error-text: rgb(153 27 27);
		--writer-error-border: rgb(248 113 113 / 0.28);
		--writer-success-bg: rgb(240 253 244);
		--writer-success-text: rgb(22 101 52);
		--writer-success-border: rgb(74 222 128 / 0.25);
		--writer-notice-text: rgb(180 83 9);
		padding: 3rem 5% 0;
		display: grid;
		gap: 1.5rem;
		overflow-x: auto;
		color: var(--writer-text);
	}

	.writer-page__hero {
		color: var(--writer-text);
		max-width: 52rem;
	}

	.writer-page__eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--writer-accent);
	}

	.writer-page__title {
		margin: 0;
		font-size: clamp(2.1rem, 4vw, 3.1rem);
		line-height: 1;
	}

	.writer-page__summary {
		margin: 0.8rem 0 0;
		color: var(--writer-muted);
	}

	.writer-card {
		background: var(--writer-card-bg);
		border: 1px solid var(--writer-card-border);
		border-radius: 1.5rem;
		padding: 1.5rem;
		box-shadow: var(--writer-card-shadow);
		color: var(--writer-text);
	}

	.writer-card__header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.writer-card__identity {
		background: var(--writer-identity-bg);
		border-radius: 0.8rem;
		padding: 0.8rem 1rem;
		min-width: 16rem;
	}

	.writer-card__identity span {
		display: block;
		font-size: 0.85rem;
		color: var(--writer-muted);
	}

	.writer-counting__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}

	.writer-block {
		margin-top: 1.4rem;
	}

	.writer-block--counting {
		padding-top: 1.25rem;
		border-top: 1px solid var(--writer-card-border);
	}

	.writer-form__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.2rem;
	}

	.writer-btn-secondary {
		border: 1px solid rgb(15 23 42 / 0.2);
		background: rgb(255 255 255 / 0.75);
	}

	.writer-page__feedback {
		margin-top: 1rem;
		padding: 0.85rem 1rem;
		border-radius: 0.8rem;
		border: 1px solid transparent;
	}

	.writer-page__feedback--warning {
		color: var(--writer-notice-text);
		border-color: var(--writer-warning-border);
		background: rgb(254 252 232);
	}

	.writer-page__feedback--error {
		background: var(--writer-error-bg);
		color: var(--writer-error-text);
		border-color: var(--writer-error-border);
	}

	.writer-page__feedback--success {
		background: var(--writer-success-bg);
		color: var(--writer-success-text);
		border-color: var(--writer-success-border);
	}

	.writer-page :global(.label span),
	.writer-page :global(h2),
	.writer-page :global(h3),
	.writer-page :global(p) {
		color: inherit;
	}

	.writer-page :global(input),
	.writer-page :global(select),
	.writer-page :global(textarea) {
		color: inherit;
	}

	@media (prefers-color-scheme: dark) {
		.writer-page {
			--writer-text: rgb(241 245 249);
			--writer-muted: rgb(203 213 225);
			--writer-accent: rgb(148 163 184);
			--writer-card-bg: rgb(15 23 42 / 0.92);
			--writer-card-border: rgb(148 163 184 / 0.22);
			--writer-card-shadow: 0 24px 56px rgb(2 6 23 / 0.55);
			--writer-warning-border: rgb(245 158 11 / 0.35);
			--writer-identity-bg: rgb(148 163 184 / 0.14);
			--writer-error-bg: rgb(69 10 10 / 0.52);
			--writer-error-text: rgb(254 202 202);
			--writer-error-border: rgb(248 113 113 / 0.5);
			--writer-success-bg: rgb(20 83 45 / 0.45);
			--writer-success-text: rgb(187 247 208);
			--writer-success-border: rgb(74 222 128 / 0.45);
			--writer-notice-text: rgb(253 224 71);
		}

		.writer-page :global(input),
		.writer-page :global(select),
		.writer-page :global(textarea) {
			background: rgb(15 23 42 / 0.72);
			border-color: rgb(148 163 184 / 0.25);
		}

		.writer-btn-secondary {
			border-color: rgb(148 163 184 / 0.35);
			background: rgb(30 41 59 / 0.72);
		}

		.writer-page__feedback--warning {
			background: rgb(120 53 15 / 0.35);
		}
	}

	@media (max-width: 900px) {
		.writer-page {
			padding: 2rem 1rem 0;
		}
	}

	.writer-tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 2px solid var(--writer-card-border);
		padding-bottom: 0;
	}

	.writer-tab {
		padding: 0.55rem 1.25rem;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--writer-muted);
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		border-radius: 0.4rem 0.4rem 0 0;
		transition: color 0.15s, border-color 0.15s;
	}

	.writer-tab:hover {
		color: var(--writer-text);
	}

	.writer-tab--active {
		color: var(--writer-text);
		border-bottom-color: var(--writer-text);
	}
</style>
