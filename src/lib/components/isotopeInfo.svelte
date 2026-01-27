<script lang="ts">
	import type { IsotopeInfo } from '$lib/types.js';

	let {
		isotopeInfo = $bindable<IsotopeInfo>({
			elementName: '',
			isotopeName: '',
			energy: 0,
			halfLife: 0
		})
	} = $props();

	export function validateIsotopeInfo(): boolean {
		return (
			isotopeInfo.elementName !== '' &&
			isotopeInfo.isotopeName !== '' &&
			isotopeInfo.energy > 0 &&
			isotopeInfo.halfLife > 0
		);
	}

	export function getValidationErrors(): string[] {
		const errors: string[] = [];
		if (!isotopeInfo.elementName) errors.push('Element name is required');
		if (!isotopeInfo.isotopeName) errors.push('Isotope name is required');
		if (isotopeInfo.energy <= 0) errors.push('Energy must be greater than 0');
		if (isotopeInfo.halfLife <= 0) errors.push('Half-life must be greater than 0');
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

<label class="label">
	<span>Element Name</span>
	<input
		class="input w-50"
		type="text"
		placeholder="e.g., Gold, Sodium"
		bind:value={isotopeInfo.elementName}
		required
	/>
	{#if showErrors && !isotopeInfo.elementName}
		<span class="field-error">Element name is required</span>
	{/if}
</label>
<label class="label">
	<span>Isotope</span>
	<input
		class="input w-50"
		type="text"
		placeholder="e.g., Au-198, Na-24"
		bind:value={isotopeInfo.isotopeName}
		required
	/>
	{#if showErrors && !isotopeInfo.isotopeName}
		<span class="field-error">Isotope name is required</span>
	{/if}
</label>
<label class="label">
	<span>Energy (in KeV)</span>
	<input
		class="input w-50"
		type="number"
		min="0"
		placeholder="e.g., 411.8"
		bind:value={isotopeInfo.energy}
		required
	/>
	{#if showErrors && isotopeInfo.energy <= 0}
		<span class="field-error">Energy must be greater than 0</span>
	{/if}
</label>
<label class="label">
	<span>Half Life (in seconds, s)</span>
	<input
		class="input w-50"
		type="number"
		min="0"
		placeholder="e.g., 230940"
		bind:value={isotopeInfo.halfLife}
		required
	/>
	{#if showErrors && isotopeInfo.halfLife <= 0}
		<span class="field-error">Half-life must be greater than 0</span>
	{/if}
</label>

<style>
	.field-error {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}
</style>
