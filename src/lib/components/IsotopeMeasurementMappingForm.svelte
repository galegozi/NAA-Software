<script lang="ts">
	import { onMount } from 'svelte';
	import AuthGate from '$lib/components/AuthGate.svelte';
	import IsotopeViewer from '$lib/components/IsotopeViewer.svelte';
	import type { IsotopeInfo } from '$lib/types.js';

	type IsotopeSelectionPayload = {
		isotopeId: string;
		energy: number;
		elementName: string;
		isotopeName: string;
	};

	type MappingPayload = {
		measuredIsotope: IsotopeSelectionPayload;
		targetIsotope: IsotopeSelectionPayload;
		notes: string;
	};

	type MappingRecord = {
		id: string;
		measuredIsotope: IsotopeSelectionPayload;
		targetIsotope: IsotopeSelectionPayload;
		notes?: string;
		createdAt?: string;
	};

	const WRITER_ROLE = 'isotope_writer';

	let authGateRef = $state<AuthGate | null>(null);
	let measuredSelection = $state<IsotopeInfo[]>([]);
	let targetSelection = $state<IsotopeInfo[]>([]);
	let notes = $state('');
	let isSubmitting = $state(false);
	let isLoadingMappings = $state(false);
	let submitError = $state('');
	let submitMessage = $state('');
	let mappingsError = $state('');
	let mappings = $state<MappingRecord[]>([]);
	let mappingsSearchTerm = $state('');

	let filteredMappings = $derived.by(() => {
		const query = mappingsSearchTerm.trim().toLowerCase();
		if (!query) {
			return mappings;
		}

		return mappings.filter((mapping) => {
			const haystack = [
				mapping.measuredIsotope?.elementName,
				mapping.measuredIsotope?.isotopeName,
				mapping.targetIsotope?.elementName,
				mapping.targetIsotope?.isotopeName,
				mapping.notes ?? ''
			]
				.join(' ')
				.toLowerCase();

			return haystack.includes(query);
		});
	});

	$effect(() => {
		if (measuredSelection.length > 1) {
			measuredSelection = [measuredSelection[measuredSelection.length - 1]];
		}
	});

	$effect(() => {
		if (targetSelection.length > 1) {
			targetSelection = [targetSelection[targetSelection.length - 1]];
		}
	});

	onMount(() => {
		void loadMappings();
	});

	function toSelectionPayload(isotope: IsotopeInfo): IsotopeSelectionPayload {
		if (!isotope.id || isotope.id.trim().length === 0) {
			throw new Error('Selected isotope is missing an ID. Please re-select from the isotope list.');
		}

		return {
			isotopeId: isotope.id,
			energy: isotope.energy,
			elementName: isotope.elementName,
			isotopeName: isotope.isotopeName
		};
	}

	function buildPayload(): MappingPayload {
		if (measuredSelection.length === 0) {
			throw new Error('Select one measured isotope.');
		}

		if (targetSelection.length === 0) {
			throw new Error('Select one target isotope.');
		}

		const measuredIsotope = toSelectionPayload(measuredSelection[0]);
		const targetIsotope = toSelectionPayload(targetSelection[0]);

		return {
			measuredIsotope,
			targetIsotope,
			notes: notes.trim()
		};
	}

	async function loadMappings() {
		isLoadingMappings = true;
		mappingsError = '';
		try {
			const response = await fetch('/api/isotope-measurements', {
				method: 'GET',
				headers: {
					accept: 'application/json'
				}
			});

			const body = await response.json().catch(() => null);
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					await authGateRef?.refreshAuthState();
				}
				throw new Error(body?.error || `Request failed with status ${response.status}`);
			}

			mappings = Array.isArray(body?.items) ? body.items : [];
		} catch (error) {
			mappingsError = error instanceof Error ? error.message : 'Unable to load isotope mappings.';
		} finally {
			isLoadingMappings = false;
		}
	}

	async function submit(writerAccess: boolean) {
		submitError = '';
		submitMessage = '';

		if (!writerAccess) {
			submitError = `Your account does not have the '${WRITER_ROLE}' role required to save isotope mappings.`;
			return;
		}

		isSubmitting = true;
		try {
			const payload = buildPayload();
			const response = await fetch('/api/isotope-measurements', {
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

			submitMessage = response.status === 201 ? 'Isotope mapping saved.' : 'Isotope mapping updated.';
			notes = '';
			await loadMappings();
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Unable to save isotope mapping.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<AuthGate bind:this={authGateRef} requiredRole={WRITER_ROLE}>
	{#snippet children({ principal, writerAccess })}
		<div class="writer-card">
			<div class="writer-card__header">
				<div>
					<h2>Isotope proxy mappings</h2>
					<p>Define cases where one isotope is used to quantify another isotope.</p>
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

			<div class="mapping-grid">
				<div class="writer-block">
					<h3 class="mapping-title">Measured Isotope (A)</h3>
					<p class="mapping-hint">Pick exactly one isotope. If you add multiple, only the latest one is kept.</p>
					<IsotopeViewer bind:selectedIsotopes={measuredSelection} />
				</div>
				<div class="writer-block">
					<h3 class="mapping-title">Target Isotope (B)</h3>
					<p class="mapping-hint">Pick the isotope that A is used to quantify.</p>
					<IsotopeViewer bind:selectedIsotopes={targetSelection} />
				</div>
			</div>

			<div class="writer-block">
				<label class="label">
					<span>Notes (optional)</span>
					<textarea
						class="textarea w-full"
						bind:value={notes}
						rows="3"
						placeholder="Example: Pa-233 is used as a proxy for Th in this workflow"
					></textarea>
				</label>
			</div>

			<div class="writer-form__actions">
				<button
					type="button"
					class="btn variant-filled-primary"
					disabled={isSubmitting || !writerAccess}
					onclick={() => {
						void submit(writerAccess);
					}}
				>
					{isSubmitting ? 'Saving...' : 'Save A Measures B Mapping'}
				</button>
			</div>

			{#if submitError}
				<p class="writer-page__feedback writer-page__feedback--error">{submitError}</p>
			{/if}
			{#if submitMessage}
				<p class="writer-page__feedback writer-page__feedback--success">{submitMessage}</p>
			{/if}
		</div>

		<div class="writer-card">
			<div class="writer-card__header">
				<div>
					<h2>Saved mappings</h2>
					<p>Search and review existing isotope proxy pairs.</p>
				</div>
			</div>

			<label class="label writer-block">
				<span>Search mappings</span>
				<input class="input w-full" type="search" bind:value={mappingsSearchTerm} placeholder="Search by isotope or notes" />
			</label>

			{#if isLoadingMappings}
				<p>Loading isotope mappings...</p>
			{:else if mappingsError}
				<p class="writer-page__feedback writer-page__feedback--error">{mappingsError}</p>
			{:else if filteredMappings.length === 0}
				<p>No isotope mappings found.</p>
			{:else}
				<div class="mapping-list">
					{#each filteredMappings as mapping}
						<div class="mapping-item">
							<div class="mapping-row">
								<strong>{mapping.measuredIsotope.isotopeName}</strong>
								<span class="mapping-arrow">measures</span>
								<strong>{mapping.targetIsotope.isotopeName}</strong>
							</div>
							<div class="mapping-row mapping-meta">
								<span>{mapping.measuredIsotope.elementName} ({mapping.measuredIsotope.energy} keV)</span>
								<span>{mapping.targetIsotope.elementName} ({mapping.targetIsotope.energy} keV)</span>
							</div>
							{#if mapping.notes}
								<p class="mapping-notes">{mapping.notes}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}
</AuthGate>

<style>
	.mapping-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
		gap: 1rem;
	}

	.mapping-title {
		margin: 0;
	}

	.mapping-hint {
		margin: 0.4rem 0 0.8rem;
		font-size: 0.9rem;
	}

	.mapping-list {
		display: grid;
		gap: 0.8rem;
	}

	.mapping-item {
		padding: 0.85rem 1rem;
		border: 1px solid var(--writer-card-border, rgb(15 23 42 / 0.08));
		border-radius: 0.8rem;
	}

	.mapping-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.mapping-meta {
		font-size: 0.9rem;
		opacity: 0.9;
		justify-content: space-between;
	}

	.mapping-arrow {
		opacity: 0.8;
	}

	.mapping-notes {
		margin: 0.55rem 0 0;
		font-size: 0.9rem;
	}
</style>
