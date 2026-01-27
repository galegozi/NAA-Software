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
			decayTime: 0,
			liveTime: 0,
			realTime: 0,
			fluence: 0,
			counts: [],
			dtType: undefined,

			// specific to Reference Material
			knownConcentration: [],
			knownUncertainty: []
		}),
		getRoiIndex
	} = $props();

	// Initialize/rescale arrays reactively while preserving existing values
	$effect(() => {
		const currentConcentration = refMatInfo.knownConcentration ?? [];
		const currentUncertainty = refMatInfo.knownUncertainty ?? [];

		// If arrays are already the correct size, do nothing
		if (
			currentConcentration.length === isotopeCount &&
			currentUncertainty.length === isotopeCount
		) {
			return;
		}

		const newConcentration = Array(isotopeCount).fill(0);
		const newUncertainty = Array(isotopeCount).fill(0);

		const copyLength = Math.min(isotopeCount, currentConcentration.length);
		for (let i = 0; i < copyLength; i++) {
			newConcentration[i] = currentConcentration[i];
		}

		const copyUncLength = Math.min(isotopeCount, currentUncertainty.length);
		for (let i = 0; i < copyUncLength; i++) {
			newUncertainty[i] = currentUncertainty[i];
		}

		refMatInfo.knownConcentration = newConcentration;
		refMatInfo.knownUncertainty = newUncertainty;
	});

	let matInfoRef: any;

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
			if (refMatInfo.knownConcentration[i] <= 0) {
				errors.push(`Isotope ${i + 1}: Known Concentration must be greater than 0`);
			}
			if (refMatInfo.knownUncertainty[i] < 0) {
				errors.push(`Isotope ${i + 1}: Known Uncertainty cannot be negative`);
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

<MaterialInfo bind:this={matInfoRef} bind:materialInfo={refMatInfo} {getRoiIndex} {isotopeCount} />
<!-- <label class="label">
	<span>Known Concentration (in ug/g, as a percent)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownConcentration} />
</label>
<label class="label">
	<span>Known Uncertainty (in ug/g)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownUncertainty} />
</label> -->
<br /><br />
{#each { length: isotopeCount } as _, index}
	<h3 class="text-xl font-bold">Isotope {index + 1} Known Concentration</h3>
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
	<br />
{/each}

<style>
	.field-error {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}
</style>
