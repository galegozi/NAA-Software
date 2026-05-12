<script lang="ts">
	import IsotopeViewer from '$lib/components/IsotopeViewer.svelte';
	import AuthGate from '$lib/components/AuthGate.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';
	import type { IsotopeInfo, ReferenceMaterial } from '$lib/types.js';
	import { createReferenceMaterial } from '$lib/utils/naaUtils.js';

	type ReferenceMaterialCountingWriteRequest = {
		countingLabel: string;
		referenceMaterial: ReferenceMaterial;
	};

	type ReferenceMaterialWriteRequest = {
		referenceKey: string;
		notes: string;
		isotopes: IsotopeInfo[];
		countings: ReferenceMaterialCountingWriteRequest[];
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

	let selectedIsotopes = $state<IsotopeInfo[]>([]);
	let referenceMaterialNotes = $state('');
	let countingLabels = $state<string[]>([defaultCountingLabel(0)]);
	let countings = $state<ReferenceMaterial[]>([createCounting(0)]);
	let countingRefs = $state<(RefMatInfo | undefined)[]>([undefined]);
	let lastResizedIsotopeCount = $state(-1);

	let isotopeCount = $derived(selectedIsotopes.length);

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
		return {
			referenceKey: getReferenceKeyFromCounting(firstCounting),
			notes: referenceMaterialNotes.trim(),
			isotopes: selectedIsotopes,
			countings: countings.map((referenceMaterial, index) => ({
				countingLabel: countingLabels[index]?.trim() || defaultCountingLabel(index),
				referenceMaterial
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
		<h1 class="writer-page__title">Add reference material countings</h1>
		<p class="writer-page__summary">
			Select isotopes from Cosmos-backed catalog, then save one or more countings for the same
			reference material. Re-analyzed ROI outputs can be saved as additional countings under the same key.
		</p>
	</div>

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
</style>
