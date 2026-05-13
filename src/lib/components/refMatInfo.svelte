<!--Information about a reference material. This material type has a known concentration of the desired isotope.-->

<script lang="ts">
	import MaterialInfo from './materialInfo.svelte';
	let {
		isotopeCount,
		refMatInfo = $bindable({
			// inherited from MaterialInfo
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

			// specific to Reference Material
			// concentration units (in percentage or ppm) for each isotope
			concentrationUnits: [],
			knownConcentration: [],
			knownUncertainty: []
		}),
		getRoiIndex,
		isotopeInfo = [],
		selected = $bindable<Set<string>>(new Set<string>()),
		usedIsotopeLabels = new Set<string>()
	} = $props();

	// Initialize/rescale arrays reactively while preserving existing values
	$effect(() => {
		const currentConcentration = refMatInfo.knownConcentration ?? [];
		const currentUncertainty = refMatInfo.knownUncertainty ?? [];

		// If arrays are already the correct size, do nothing
		if (
			currentConcentration.length === isotopeCount &&
			currentUncertainty.length === isotopeCount &&
			refMatInfo.concentrationUnits.length === isotopeCount
		) {
			return;
		}

		const newConcentration = Array(isotopeCount).fill(0);
		const newUncertainty = Array(isotopeCount).fill(0);
		const newUnits = Array(isotopeCount).fill(undefined);

		const copyLength = Math.min(isotopeCount, currentConcentration.length);
		for (let i = 0; i < copyLength; i++) {
			newConcentration[i] = currentConcentration[i];
		}

		const copyUncLength = Math.min(isotopeCount, currentUncertainty.length);
		for (let i = 0; i < copyUncLength; i++) {
			newUncertainty[i] = currentUncertainty[i];
		}

		const copyUnitsLength = Math.min(isotopeCount, refMatInfo.concentrationUnits.length);
		for (let i = 0; i < copyUnitsLength; i++) {
			newUnits[i] = refMatInfo.concentrationUnits[i];
		}

		refMatInfo.knownConcentration = newConcentration;
		refMatInfo.knownUncertainty = newUncertainty;
		refMatInfo.concentrationUnits = newUnits;
	});

	let matInfoRef: any;
	const isReference = true;
	const canEditToggles = isReference;

	$effect(() => {
		if (!(selected instanceof Set)) {
			selected = new Set<string>();
		}
		if (usedIsotopeLabels.size === 0 || selected.size === 0) {
			return;
		}
		const cleaned = new Set<string>();
		for (let i = 0; i < isotopeCount; i++) {
			const isotopeKey = getIsotopeKey(i);
			if (selected.has(isotopeKey) && !usedIsotopeLabels.has(isotopeKey)) {
				cleaned.add(isotopeKey);
			}
		}
		if (cleaned.size !== selected.size) {
			selected = cleaned;
		}
	});

	function getIsotopeLabel(index: number): string {
		const elementName = isotopeInfo?.[index]?.elementName?.trim?.() ?? '';
		return elementName || `Isotope ${index + 1}`;
	}

	function getIsotopeKey(index: number): string {
		return `isotope:${index}`;
	}

	function isIsotopeEnabled(index: number): boolean {
		const isotopeKey = getIsotopeKey(index);
		if (usedIsotopeLabels.has(isotopeKey)) {
			return false;
		}
		if (!(selected instanceof Set) || selected.size === 0) {
			return true;
		}
		return selected.has(isotopeKey);
	}

	export function validateRefMatInfo(): boolean {
		const errors = getValidationErrors();
		return errors.length === 0;
	}

	export function getValidationErrors(): string[] {
		const errors: string[] = [];

		// Validate base material info using the MaterialInfo component's validation
		if (matInfoRef && typeof matInfoRef.validateMaterialInfo === 'function') {
			if (!matInfoRef.validateMaterialInfo()) {
				errors.push(...matInfoRef.getValidationErrors());
			}
		}

		// Validate known concentration and uncertainty
		for (let i = 0; i < isotopeCount; i++) {
			if (!isIsotopeEnabled(i)) {
				continue;
			}
			if (refMatInfo.knownConcentration[i] <= 0) {
				errors.push(`${getIsotopeLabel(i)}: Known Concentration must be greater than 0`);
			}
			if (refMatInfo.knownUncertainty[i] < 0) {
				errors.push(`${getIsotopeLabel(i)}: Known Uncertainty cannot be negative`);
			}
		}

		return errors;
	}

	let showErrors = $state(false);

	export function showValidationErrors() {
		showErrors = true;
		// Propagate to MaterialInfo component
		if (matInfoRef && typeof matInfoRef.showValidationErrors === 'function') {
			matInfoRef.showValidationErrors();
		}
	}

	export function hideValidationErrors() {
		showErrors = false;
		if (matInfoRef && typeof matInfoRef.hideValidationErrors === 'function') {
			matInfoRef.hideValidationErrors();
		}
	}
</script>

<MaterialInfo
	bind:this={matInfoRef}
	bind:materialInfo={refMatInfo}
	{getRoiIndex}
	{isotopeCount}
	{isotopeInfo}
	{canEditToggles}
	disabledIsotopeLabels={usedIsotopeLabels}
	bind:selected
/>
<br /><br />

{#each { length: isotopeCount } as _, index}
	{#if isIsotopeEnabled(index)}
		<h3 class="text-xl font-bold">{isotopeInfo && isotopeInfo[index] ? isotopeInfo[index].elementName : `Isotope ${index + 1}`} Known Concentration</h3>
		<label class="label">
			<span>Known Concentration</span>
			<input
				class="input w-50"
				type="number"
				bind:value={refMatInfo.knownConcentration[index]}
				placeholder="e.g., 0.35"
				min="0"
				required
			/>
			{#if showErrors && refMatInfo.knownConcentration[index] <= 0}
				<span class="field-error">Known Concentration must be greater than 0</span>
			{/if}
		</label>
		<label class="label">
			<span>Known Uncertainty</span>
			<input
				class="input w-50"
				type="number"
				bind:value={refMatInfo.knownUncertainty[index]}
				placeholder="e.g., 0.006"
				min="0"
				step="any"
				required
			/>
			{#if showErrors && refMatInfo.knownUncertainty[index] < 0}
				<span class="field-error">Known Uncertainty cannot be negative</span>
			{/if}
		</label>
		<label class="label">
			<span>Reference Material Concentration Units</span>
			<select class="select w-50" bind:value={refMatInfo.concentrationUnits[index]}>
				<option value={undefined} disabled selected>Select units</option>
				<option value="percentage">Percentage (%)</option>
				<option value="ppm">Parts per million (ppm)</option>
			</select>
		</label>
		<br />
	{/if}
{/each}

<style>
	.field-error {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}
</style>
