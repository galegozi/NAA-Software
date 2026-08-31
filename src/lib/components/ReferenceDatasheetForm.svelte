<script lang="ts">
	// Controlled sub-form for entering a reference datasheet (known concentrations).
	// The parent owns auth and the POST; call `getPayload()` to validate + read.
	type ConcentrationUnit = 'ppm' | 'percentage';

	type ConcentrationEntry = {
		label: string;
		concentration: number | '';
		uncertainty: number | '';
		unit: ConcentrationUnit;
	};

	export type DatasheetPayload = {
		sampleName: string;
		entries: Array<{
			label: string;
			concentration: number;
			uncertainty: number;
			unit: ConcentrationUnit;
		}>;
	};

	let { sampleName = $bindable('') }: { sampleName?: string } = $props();

	function createEntry(): ConcentrationEntry {
		return { label: '', concentration: '', uncertainty: '', unit: 'ppm' };
	}

	let entries = $state<ConcentrationEntry[]>([createEntry()]);
	let error = $state('');

	function addEntry() {
		entries = [...entries, createEntry()];
	}

	function removeEntry(index: number) {
		if (entries.length <= 1) {
			return;
		}
		entries = entries.filter((_, i) => i !== index);
	}

	export function reset() {
		entries = [createEntry()];
		error = '';
	}

	/** Validate and return the payload, or null (with `error` set) if invalid. */
	export function getPayload(): DatasheetPayload | null {
		error = '';

		if (sampleName.trim().length === 0) {
			error = 'Sample name is required.';
			return null;
		}

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			if (entry.label.trim().length === 0) {
				error = `Entry ${i + 1}: label is required.`;
				return null;
			}
			if (
				entry.concentration === '' ||
				isNaN(Number(entry.concentration)) ||
				Number(entry.concentration) < 0
			) {
				error = `Entry ${i + 1}: concentration must be a non-negative number.`;
				return null;
			}
			if (
				entry.uncertainty === '' ||
				isNaN(Number(entry.uncertainty)) ||
				Number(entry.uncertainty) < 0
			) {
				error = `Entry ${i + 1}: uncertainty must be a non-negative number.`;
				return null;
			}
		}

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
</script>

<div class="space-y-3">
	<label class="label">
		<span>Sample name</span>
		<input
			class="input w-full"
			type="text"
			bind:value={sampleName}
			placeholder="e.g. NIST SRM 1632e"
		/>
	</label>

	<div class="space-y-2">
		<p class="text-sm font-bold">Concentration entries (one row per isotope or element)</p>
		{#each entries as entry, index (index)}
			<div class="flex flex-wrap items-end gap-2 rounded border border-surface-300-700 p-3">
				<label class="label grow">
					<span>Isotope / element</span>
					<input
						class="input"
						type="text"
						bind:value={entry.label}
						placeholder="e.g. Fe or Fe-59"
					/>
				</label>
				<label class="label">
					<span>Concentration</span>
					<input class="input" type="number" min="0" step="any" bind:value={entry.concentration} />
				</label>
				<label class="label">
					<span>Uncertainty</span>
					<input class="input" type="number" min="0" step="any" bind:value={entry.uncertainty} />
				</label>
				<label class="label">
					<span>Unit</span>
					<select class="select" bind:value={entry.unit}>
						<option value="ppm">ppm</option>
						<option value="percentage">%</option>
					</select>
				</label>
				{#if entries.length > 1}
					<button type="button" class="btn preset-tonal-surface" onclick={() => removeEntry(index)}>
						Remove
					</button>
				{/if}
			</div>
		{/each}
		<button type="button" class="btn preset-tonal-surface" onclick={addEntry}>Add entry</button>
	</div>

	{#if error}
		<p class="text-sm text-error-500">{error}</p>
	{/if}
</div>
