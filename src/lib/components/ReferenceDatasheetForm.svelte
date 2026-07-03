<script lang="ts">
	import AuthGate from '$lib/components/AuthGate.svelte';

	type ConcentrationUnit = 'ppm' | 'percentage';

	type ConcentrationEntry = {
		label: string;
		concentration: number | '';
		uncertainty: number | '';
		unit: ConcentrationUnit;
	};

	type DatasheetPayload = {
		sampleName: string;
		entries: Array<{
			label: string;
			concentration: number;
			uncertainty: number;
			unit: ConcentrationUnit;
		}>;
	};

	const WRITER_ROLE = 'isotope_writer';

	function createEntry(): ConcentrationEntry {
		return { label: '', concentration: '', uncertainty: '', unit: 'ppm' };
	}

	let authGateRef = $state<AuthGate | null>(null);
	let isSubmitting = $state(false);
	let submitError = $state('');
	let submitMessage = $state('');

	let sampleName = $state('');
	let entries = $state<ConcentrationEntry[]>([createEntry()]);

	function addEntry() {
		entries = [...entries, createEntry()];
	}

	function removeEntry(index: number) {
		if (entries.length <= 1) return;
		entries = entries.filter((_, i) => i !== index);
	}

	function validate(): boolean {
		submitError = '';

		if (sampleName.trim().length === 0) {
			submitError = 'Sample name is required.';
			return false;
		}

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			if (entry.label.trim().length === 0) {
				submitError = `Entry ${i + 1}: label is required.`;
				return false;
			}
			if (entry.concentration === '' || isNaN(Number(entry.concentration)) || Number(entry.concentration) < 0) {
				submitError = `Entry ${i + 1}: concentration must be a non-negative number.`;
				return false;
			}
			if (entry.uncertainty === '' || isNaN(Number(entry.uncertainty)) || Number(entry.uncertainty) < 0) {
				submitError = `Entry ${i + 1}: uncertainty must be a non-negative number.`;
				return false;
			}
		}

		return true;
	}

	function buildPayload(): DatasheetPayload {
		return {
			sampleName: sampleName.trim(),
			entries: entries.map((e) => ({
				label: e.label.trim(),
				concentration: Number(e.concentration),
				uncertainty: Number(e.uncertainty),
				unit: e.unit
			}))
		};
	}

	async function saveDatasheet(payload: DatasheetPayload): Promise<void> {
		const response = await fetch('/api/reference-datasheets', {
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
	}

	async function submit(writerAccess: boolean) {
		submitMessage = '';
		submitError = '';

		if (!writerAccess) {
			submitError = `Your account is signed in, but it does not have the '${WRITER_ROLE}' role required to save datasheets.`;
			return;
		}

		if (!validate()) return;

		isSubmitting = true;
		try {
			const payload = buildPayload();
			await saveDatasheet(payload);
			submitMessage = `Datasheet for "${payload.sampleName}" saved with ${payload.entries.length} entr${payload.entries.length === 1 ? 'y' : 'ies'}.`;
			sampleName = '';
			entries = [createEntry()];
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Unable to save datasheet.';
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
					<h2>Reference datasheet entry</h2>
					<p>Enter concentration data for elements or isotopes in a reference sample.</p>
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
					<span>Sample Name</span>
					<input
						class="input w-full"
						type="text"
						bind:value={sampleName}
						placeholder="e.g. NIST SRM 1632e"
					/>
				</label>
			</div>

			<div class="writer-block">
				<h3 class="ds-section-title">Concentration Entries</h3>
				<p class="ds-section-hint">Add one row per isotope or element.</p>

				<div class="ds-entries">
					{#each entries as entry, index (index)}
						<div class="ds-entry">
							<div class="ds-entry__fields">
								<label class="label ds-label-wide">
									<span>Isotope / Element</span>
									<input
										class="input"
										type="text"
										bind:value={entry.label}
										placeholder="e.g. Fe or Fe-59"
									/>
								</label>

								<label class="label">
									<span>Concentration</span>
									<input
										class="input"
										type="number"
										min="0"
										step="any"
										bind:value={entry.concentration}
										placeholder="0"
									/>
								</label>

								<label class="label">
									<span>Uncertainty</span>
									<input
										class="input"
										type="number"
										min="0"
										step="any"
										bind:value={entry.uncertainty}
										placeholder="0"
									/>
								</label>

								<label class="label">
									<span>Unit</span>
									<select class="select" bind:value={entry.unit}>
										<option value="ppm">ppm</option>
										<option value="percentage">%</option>
									</select>
								</label>
							</div>

							{#if entries.length > 1}
								<button
									type="button"
									class="btn writer-btn-secondary ds-remove-btn"
									onclick={() => removeEntry(index)}
									aria-label="Remove entry {index + 1}"
								>
									Remove
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div class="writer-form__actions">
				<button type="button" class="btn writer-btn-secondary" onclick={addEntry}>
					Add Entry
				</button>
				<button
					type="button"
					class="btn variant-filled-primary"
					disabled={isSubmitting || !writerAccess}
					onclick={() => { void submit(writerAccess); }}
				>
					{isSubmitting ? 'Saving...' : 'Save Datasheet'}
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

<style>
	.ds-section-title {
		margin: 0 0 0.25rem;
	}

	.ds-section-hint {
		margin: 0 0 0.8rem;
		font-size: 0.88rem;
	}

	.ds-entries {
		display: grid;
		gap: 0.75rem;
	}

	.ds-entry {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--writer-card-border, rgb(15 23 42 / 0.08));
		border-radius: 0.75rem;
		flex-wrap: wrap;
	}

	.ds-entry__fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		flex: 1;
	}

	.ds-label-wide {
		flex: 2;
		min-width: 10rem;
	}

	.ds-entry__fields .label {
		flex: 1;
		min-width: 7rem;
	}

	.ds-remove-btn {
		align-self: flex-end;
		flex-shrink: 0;
	}
</style>
