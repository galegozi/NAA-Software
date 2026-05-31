<script lang="ts">
	import { untrack } from 'svelte';
	import IsotopeEnable from './isotopeEnable.svelte';

	import type { MaestroParsedData, MaestroRoiEntry } from '$lib/NAAMath/types.js';
	import MaestroUpload from './maestroUpload.svelte';

	let {
		isotopeCount,
		materialInfo = $bindable({
			NETL_code: '',
			sampleName: '',
			mass: 0,
			irradiationTime: 0,
			irradiationEnd: '',
			measurementStartTime: '',
			decayTime: 0,
			liveTime: 0,
			realTime: 0,
			fluence: 0,
			counts: Array.from({ length: isotopeCount }, () => ({
				grossCounts: 0,
				netCounts: 0,
				uncertainty: 0,
				grossCountsPositionalCorrectionFactor: 1,
				netCountsPositionalCorrectionFactor: 1,
				uncertaintyPositionalCorrectionFactor: 1
			})),
			irradiationType: 'total',
			dtType: undefined,

		}),
		getRoiIndex,
		isotopeInfo = $bindable([]),
		canEditToggles = $bindable(false),
		disabledIsotopeLabels = new Set<string>(),
		selected = $bindable(new Set<string>())
	} = $props();

	$effect(() => {
		const currentCounts = materialInfo.counts ?? [];
		if (currentCounts.length !== isotopeCount) {
			const newCounts = Array.from({ length: isotopeCount }, (_, i) => {
				const existing = currentCounts[i];
				return {
					grossCounts: existing?.grossCounts ?? 0,
					netCounts: existing?.netCounts ?? 0,
					uncertainty: existing?.uncertainty ?? 0,
					grossCountsPositionalCorrectionFactor:
						existing?.grossCountsPositionalCorrectionFactor ?? 1,
					netCountsPositionalCorrectionFactor: existing?.netCountsPositionalCorrectionFactor ?? 1,
					uncertaintyPositionalCorrectionFactor:
						existing?.uncertaintyPositionalCorrectionFactor ?? 1
				};
			});
			materialInfo.counts = newCounts;
		}

		if (pendingMaestroData && isotopeCount > 0 && materialInfo.counts.length === isotopeCount) {
			const parsedData = pendingMaestroData;
			pendingMaestroData = null;
			applyParsedMaestroData(parsedData);
		}
	});

	let roiData = $state<MaestroRoiEntry[] | null>(null);
	let roiSelections = $state<number[]>([]);
	let pendingMaestroData = $state<MaestroParsedData | null>(null);

	$effect(() => {
		const currentSelections = roiSelections ?? [];
		if (currentSelections.length !== isotopeCount) {
			roiSelections = Array.from({ length: isotopeCount }, (_, i) => currentSelections[i] ?? -1);
		}
	});

	// Track if decay time was manually set to avoid overwriting user input
	let lastManualDecayTime = $state<number | null>(null);

	$effect(() => {
		const measurementStartTime = normalizeDateTimeLocal(materialInfo.measurementStartTime);
		const irradiationEnd = normalizeDateTimeLocal(materialInfo.irradiationEnd);

		if (measurementStartTime !== materialInfo.measurementStartTime) {
			materialInfo.measurementStartTime = measurementStartTime;
		}

		if (irradiationEnd !== materialInfo.irradiationEnd) {
			materialInfo.irradiationEnd = irradiationEnd;
		}

		if (!measurementStartTime || !irradiationEnd) {
			return;
		}

		const measurementStartDate = parseDateTimeInput(measurementStartTime);
		const irradiationEndDate = parseDateTimeInput(irradiationEnd);

		if (!measurementStartDate || !irradiationEndDate) {
			return;
		}

		const computedDecayTime =
			(measurementStartDate.getTime() - irradiationEndDate.getTime()) / 1000;
		const inputDecayTime = untrack(() => Number(materialInfo.decayTime));

		if (!Number.isFinite(computedDecayTime)) {
			return;
		}

		// Only auto-compute decay time if it hasn't been manually set
		// If user has manually entered a decay time that differs from computed, don't overwrite it
		if (lastManualDecayTime === null) {
			if (computedDecayTime > 0) {
				materialInfo.decayTime = computedDecayTime;
				return;
			}

			if (!(Number.isFinite(inputDecayTime) && inputDecayTime > 0)) {
				materialInfo.decayTime = computedDecayTime;
			}
		}
	});

	export function trackDecayTimeChange() {
		lastManualDecayTime = materialInfo.decayTime;
	}

	function parseDateTimeInput(value: string): Date | null {
		const trimmed = value?.trim();
		if (!trimmed) {
			return null;
		}

		const localMatch = trimmed.match(
			/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/
		);

		if (localMatch) {
			const year = Number(localMatch[1]);
			const month = Number(localMatch[2]);
			const day = Number(localMatch[3]);
			const hour = Number(localMatch[4]);
			const minute = Number(localMatch[5]);
			const second = Number(localMatch[6] ?? '0');
			const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
			return isNaN(parsed.getTime()) ? null : parsed;
		}

		const parsed = new Date(trimmed);
		return isNaN(parsed.getTime()) ? null : parsed;
	}

	function formatDateTimeLocal(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${year}-${month}-${day}T${hours}:${minutes}`;
	}

	function normalizeDateTimeLocal(value: string): string {
		const parsed = parseDateTimeInput(value);
		if (!parsed) {
			return value?.trim?.() ?? '';
		}
		return formatDateTimeLocal(parsed);
	}

	function applyRoiSelection(isoIndex: number, roiIndex: number) {
		if (!roiData || roiIndex < 0 || !roiData[roiIndex]) {
			return;
		}
		const entry = roiData[roiIndex]!;
		materialInfo.counts = materialInfo.counts.map((count: any, idx: number) =>
			idx === isoIndex
				? {
						grossCounts: entry.grossCounts,
						netCounts: entry.netCounts,
						uncertainty: entry.uncertainty,
						grossCountsPositionalCorrectionFactor:
							count?.grossCountsPositionalCorrectionFactor ?? 1,
						netCountsPositionalCorrectionFactor:
							count?.netCountsPositionalCorrectionFactor ?? 1,
						uncertaintyPositionalCorrectionFactor:
							count?.uncertaintyPositionalCorrectionFactor ?? 1
					}
				: count
		);
	}

	function applyAllRoiSelections(selections: number[]) {
		if (!roiData) return;
		materialInfo.counts = materialInfo.counts.map((count: any, idx: number) => {
			const roiIndex = selections[idx];
			if (roiIndex === undefined || roiIndex < 0 || !roiData![roiIndex]) {
				return count;
			}
			const entry = roiData![roiIndex];
			return {
				grossCounts: entry.grossCounts,
				netCounts: entry.netCounts,
				uncertainty: entry.uncertainty,
				grossCountsPositionalCorrectionFactor: count?.grossCountsPositionalCorrectionFactor ?? 1,
				netCountsPositionalCorrectionFactor: count?.netCountsPositionalCorrectionFactor ?? 1,
				uncertaintyPositionalCorrectionFactor: count?.uncertaintyPositionalCorrectionFactor ?? 1
			};
		});
	}

	function applyParsedMaestroData(data: MaestroParsedData) {
		materialInfo.liveTime = data.liveTime;
		materialInfo.realTime = data.realTime;
		materialInfo.measurementStartTime = data.startTime
			? `${data.startTime.getFullYear()}-${String(data.startTime.getMonth() + 1).padStart(2, '0')}-${String(data.startTime.getDate()).padStart(2, '0')}T${String(data.startTime.getHours()).padStart(2, '0')}:${String(data.startTime.getMinutes()).padStart(2, '0')}`
			: '';
		roiData = data.roiData;

		selected = new Set<string>();
		const nextSelections = getOneToOneRoiIndices(data.roiData);
		roiSelections = nextSelections;

		materialInfo.counts = Array.from({ length: isotopeCount }, () => ({
			grossCounts: 0,
			netCounts: 0,
			uncertainty: 0,
			grossCountsPositionalCorrectionFactor: 1,
			netCountsPositionalCorrectionFactor: 1,
			uncertaintyPositionalCorrectionFactor: 1
		}));

		if (canEditToggles) {
			const matchedLabels = nextSelections
				.map((roiIndex, isoIndex) => (roiIndex >= 0 ? getIsotopeKey(isoIndex) : null))
				.filter((label): label is string => Boolean(label));
			selected = new Set(matchedLabels);
		}

		applyAllRoiSelections(nextSelections);
	}

	function handleRoiSelectionChange(isoIndex: number, event: Event) {
		const target = event.target as HTMLSelectElement;
		const roiIndex = Number(target.value);
		roiSelections = roiSelections.map((value, idx) => (idx === isoIndex ? roiIndex : value));
		applyRoiSelection(isoIndex, roiIndex);
	}

	function getIsotopeLabel(index: number): string {
		const elementName = isotopeInfo?.[index]?.elementName?.trim?.() ?? '';
		return elementName || `Isotope ${index + 1}`;
	}

	function getIsotopeKey(index: number): string {
		return `isotope:${index}`;
	}

	function getExplicitlySelectedIndices(): number[] {
		if (!(selected instanceof Set) || selected.size === 0) {
			return [];
		}

		const indices: number[] = [];
		for (let i = 0; i < isotopeCount; i++) {
			if (selected.has(getIsotopeKey(i))) {
				indices.push(i);
			}
		}

		return indices;
	}

	function isIsotopeDisabled(index: number): boolean {
		return disabledIsotopeLabels.has(getIsotopeKey(index));
	}

	function isIsotopeSelected(index: number): boolean {
		if (!(selected instanceof Set) || selected.size === 0) {
			return true;
		}

		const explicitlySelectedIndices = getExplicitlySelectedIndices();
		if (explicitlySelectedIndices.length === 0) {
			return true;
		}

		return explicitlySelectedIndices.includes(index);
	}

	function shouldShowIsotope(index: number): boolean {
		if (!canEditToggles) {
			return true;
		}
		if (isIsotopeDisabled(index)) {
			return false;
		}
		return isIsotopeSelected(index);
	}

	function getMatchingIsotopeIndices(): number[] {
		if (selected instanceof Set && selected.size > 0) {
			const indices = getExplicitlySelectedIndices().filter((index) => !isIsotopeDisabled(index));
			if (indices.length > 0) {
				return indices;
			}
		}

		return Array.from({ length: isotopeCount }, (_, i) => i).filter((index) => !isIsotopeDisabled(index));
	}

	function getOneToOneRoiIndices(roiEntries: MaestroRoiEntry[]): number[] {
		const selections = Array.from({ length: isotopeCount }, () => -1);
		const isotopeIndices = getMatchingIsotopeIndices();

		if (!roiEntries.length || !isotopeIndices.length) {
			return selections;
		}

		const availableRoi = new Set<number>(roiEntries.map((_, i) => i));
		const prioritizedIsotopes = isotopeIndices
			.map((isoIndex) => {
				const targetEnergy = Number(isotopeInfo?.[isoIndex]?.energy);
				let bestDiff = Infinity;
				if (Number.isFinite(targetEnergy)) {
					for (let i = 0; i < roiEntries.length; i++) {
						const diff = Math.abs(targetEnergy - roiEntries[i].centroid);
						if (diff < bestDiff) {
							bestDiff = diff;
						}
					}
				}
				return { isoIndex, bestDiff, targetEnergy };
			})
			.sort((a, b) => a.bestDiff - b.bestDiff);

		for (const { isoIndex, targetEnergy } of prioritizedIsotopes) {
			if (!Number.isFinite(targetEnergy) || availableRoi.size === 0) {
				continue;
			}

			let bestRoiIndex = -1;
			let bestDiff = Infinity;

			for (const roiIndex of availableRoi) {
				const diff = Math.abs(targetEnergy - roiEntries[roiIndex].centroid);
				if (diff < bestDiff) {
					bestDiff = diff;
					bestRoiIndex = roiIndex;
				}
			}

			if (bestRoiIndex >= 0) {
				selections[isoIndex] = bestRoiIndex;
				availableRoi.delete(bestRoiIndex);
			}
		}

		return selections;
	}

	function handleParsedMaestro(data: MaestroParsedData) {
		pendingMaestroData = data;
		if (isotopeCount > 0 && materialInfo.counts.length === isotopeCount) {
			const parsedData = pendingMaestroData;
			pendingMaestroData = null;
			applyParsedMaestroData(parsedData);
		}
	}

	export function validateMaterialInfo(): boolean {
		const errors = getValidationErrors();
		return errors.length === 0;
	}

	export function getValidationErrors(): string[] {
		const errors: string[] = [];

		if (!materialInfo.NETL_code?.trim()) {
			errors.push('NETL Code is required');
		}

		if (!materialInfo.sampleName?.trim()) {
			errors.push('Sample Name is required');
		}

		if (materialInfo.mass <= 0) {
			errors.push('Mass must be greater than 0');
		}

		if (materialInfo.irradiationTime <= 0) {
			errors.push('Irradiation time must be greater than 0');
		}

		if (materialInfo.decayTime < 0) {
			errors.push('Decay Time cannot be negative');
		}

		if (materialInfo.liveTime <= 0) {
			errors.push('Live Time must be greater than 0');
		}

		if (materialInfo.realTime <= 0) {
			errors.push('Real Time must be greater than 0');
		}

		if (materialInfo.fluence <= 0) {
			errors.push('Fluence must be greater than 0');
		}

		return errors;
	}

	let showErrors = $state(false);

	export function showValidationErrors() {
		showErrors = true;
	}

	export function hideValidationErrors() {
		showErrors = false;
	}
</script>

{#if canEditToggles}
	<IsotopeEnable
		isotopeOptions={Array.from({ length: isotopeCount }, (_, i) => ({
			value: getIsotopeKey(i),
			label: getIsotopeLabel(i)
		}))}
		disabledIsotopes={disabledIsotopeLabels}
		bind:selected={selected}
	/>
{/if}

<MaestroUpload onParsed={handleParsedMaestro} />
<br />

<label class="label">
	<span>NETL Code</span>
	<input
		class="input w-50"
		type="text"
		bind:value={materialInfo.NETL_code}
		placeholder="e.g., AB0053"
		required
	/>
	{#if showErrors && (!materialInfo.NETL_code || materialInfo.NETL_code.trim() === '')}
		<span class="field-error">NETL Code is required</span>
	{/if}
</label>
<label class="label">
	<span>Sample Name</span>
	<input
		class="input w-50"
		type="text"
		bind:value={materialInfo.sampleName}
		placeholder="e.g., 1633C"
		required
	/>
	{#if showErrors && (!materialInfo.sampleName || materialInfo.sampleName.trim() === '')}
		<span class="field-error">Sample Name is required</span>
	{/if}
</label>
<label class="label">
	<span>Mass (in grams, g)</span>
	<input
		class="input w-50"
		type="number"
		bind:value={materialInfo.mass}
		placeholder="e.g., 1"
		min="0"
		required
	/>
	{#if showErrors && materialInfo.mass <= 0}
		<span class="field-error">Mass must be greater than 0</span>
	{/if}
</label>
<label class="label">
	<span>Irradiation time (in seconds, s)</span>
	<input
		class="input w-50"
		type="number"
		bind:value={materialInfo.irradiationTime}
		placeholder="e.g., 3600"
		min="0"
		required
	/>
	{#if showErrors && materialInfo.irradiationTime <= 0}
		<span class="field-error">Irradiation time must be greater than 0</span>
	{/if}
</label>
<label class="label">
	<span>Irradiation End</span>
	<input
		class="input w-50"
		type="datetime-local"
		bind:value={materialInfo.irradiationEnd}
	/>
</label>
<label class="label">
	<span>Measurement Start Time</span>
	<input
		class="input w-50"
		type="datetime-local"
		bind:value={materialInfo.measurementStartTime}
	/>
</label>
<label class="label">
	<span>Decay Time (in seconds, s)</span>
	<input
		class="input w-50"
		type="number"
		bind:value={materialInfo.decayTime}
		oninput={() => trackDecayTimeChange()}
		placeholder="e.g., 7200"
		min="0"
		required
	/>
	{#if showErrors && materialInfo.decayTime < 0}
		<span class="field-error">Decay Time cannot be negative</span>
	{/if}
</label>
<label class="label">
	<span>Live Time (in seconds, s)</span>
	<input
		class="input w-50"
		type="number"
		bind:value={materialInfo.liveTime}
		placeholder="e.g., 1800"
		min="0"
		required
	/>
	{#if showErrors && materialInfo.liveTime <= 0}
		<span class="field-error">Live Time must be greater than 0</span>
	{/if}
</label>
<label class="label">
	<span>Real Time (in seconds, s)</span>
	<input
		class="input w-50"
		type="number"
		bind:value={materialInfo.realTime}
		placeholder="e.g., 1850"
		min="0"
		required
	/>
	{#if showErrors && materialInfo.realTime <= 0}
		<span class="field-error">Real Time must be greater than 0</span>
	{/if}
</label>
<label class="label">
	<span>Fluence (in neutrons/cm²)</span>
	<input
		class="input w-50"
		type="number"
		bind:value={materialInfo.fluence}
		placeholder="e.g., 1"
		min="0"
		required
	/>
	{#if showErrors && materialInfo.fluence <= 0}
		<span class="field-error">Fluence must be greater than 0</span>
	{/if}
</label>

<label class="label">
	<span>Irradiation Type</span>
	<select
		class="select input w-50 bg-surface-50-950 text-surface-950-50"
		bind:value={materialInfo.irradiationType}
		required
	>
		<option value="total">Total</option>
		<option value="gated">Gated</option>
	</select>
</label>

<label class="label">
	<span>Dead Time Correction Type</span>
	<select
		class="select input w-50 bg-surface-50-950 text-surface-950-50"
		bind:value={materialInfo.dtType}
		required
	>
		<option value="short">Short Lived Only</option>
		<option value="simple" selected>Simple: Only using the net counts, decay constant, and live time</option>
		<option value="Deprecated" disabled>Deprecated Options</option>
		<option value="mixed">Mixed (deprecated): Short Lived in presence of Long Lived</option>
		<!--(net counts)/(1-e^(-decay constant * live time))-->
	</select>
</label>

{#if materialInfo.dtType === 'mixed'}
	<p class="text-sm text-yellow-600 italic">
		Note: The Mixed Dead Time Correction is deprecated. Please let someone know if you need this
		feature.
	</p>
{/if}
<br />
{#each { length: isotopeCount } as _, index}
	{#if shouldShowIsotope(index)}
		{#if materialInfo.counts[index]}
			<h3 class="text-xl font-bold">
				{isotopeInfo && isotopeInfo[index] ? isotopeInfo[index].elementName : `Isotope ${index + 1}`} Counts
			</h3>
			<label class="label">
				<span>Gross Counts</span>
				<input
					class="input w-50"
					type="number"
					bind:value={materialInfo.counts[index].grossCounts}
					placeholder="e.g., 5000"
					min="0"
					required
				/>
			</label>
			<label class="label">
				<span>Net Counts</span>
				<input
					class="input w-50"
					type="number"
					bind:value={materialInfo.counts[index].netCounts}
					placeholder="e.g., 4500"
					min="0"
					required
				/>
			</label>
			<label class="label">
				<span>Uncertainty (in counts)</span>
				<input
					class="input w-50"
					type="number"
					bind:value={materialInfo.counts[index].uncertainty}
					placeholder="e.g., 67.08"
					min="0"
					required
				/>
			</label>
			<label class="label">
				<span>Gross Counts Positional Correction Factor</span>
				<input
					class="input w-50"
					type="number"
					bind:value={materialInfo.counts[index].grossCountsPositionalCorrectionFactor}
					placeholder="e.g., 1"
					step="any"
					required
				/>
			</label>
			<label class="label">
				<span>Net Counts Positional Correction Factor</span>
				<input
					class="input w-50"
					type="number"
					bind:value={materialInfo.counts[index].netCountsPositionalCorrectionFactor}
					placeholder="e.g., 1"
					step="any"
					required
				/>
			</label>
			<label class="label">
				<span>Uncertainty Positional Correction Factor</span>
				<input
					class="input w-50"
					type="number"
					bind:value={materialInfo.counts[index].uncertaintyPositionalCorrectionFactor}
					placeholder="e.g., 1"
					step="any"
					required
				/>
			</label>
			{#if roiData && roiData.length > 0}
				<label class="label">
					<span>ROI Match</span>
					<select
						class="select input w-50 bg-surface-50-950 text-surface-950-50"
						value={roiSelections[index]}
						onchange={(e) => handleRoiSelectionChange(index, e)}
					>
						<option value={-1}>None</option>
						{#each roiData as roi, roiIndex}
							<option value={roiIndex}>
								ROI {roi.roi}: {roi.centroid} keV ({roi.grossCounts} gross, {roi.netCounts} net)
							</option>
						{/each}
					</select>
				</label>
			{/if}
		{/if}
	{/if}
	<br />
{/each}

<style>
	.field-error {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}

	:global(html) {
		scroll-behavior: auto;
	}

	:global(input:focus, textarea:focus, select:focus) {
		scroll-margin-top: 5rem;
	}
</style>
