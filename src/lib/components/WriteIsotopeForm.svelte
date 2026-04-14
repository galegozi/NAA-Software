<script lang="ts">
	import type { IsotopeWriteForm } from '$lib/types.js';

	let {
		formData = $bindable<IsotopeWriteForm>({
			elementName: '',
			shortName: '',
			massNumber: 0,
			suffix: '',
			energy: 0,
			halfLife: 0,
			unit: 'seconds'
		})
	} = $props();

	let showErrors = $state(false);

	export function validateWriteIsotopeForm(): boolean {
		return (
			formData.elementName.trim() !== '' &&
			formData.shortName.trim() !== '' &&
			Number.isInteger(formData.massNumber) &&
			formData.massNumber > 0 &&
			formData.energy > 0 &&
			formData.halfLife > 0
		);
	}

	export function getValidationErrors(): string[] {
		const errors: string[] = [];

		if (!formData.elementName.trim()) errors.push('Element name is required');
		if (!formData.shortName.trim()) errors.push('Element short name is required');
		if (!Number.isInteger(formData.massNumber) || formData.massNumber <= 0) {
			errors.push('Mass number must be a positive integer');
		}
		if (formData.energy <= 0) errors.push('Energy must be greater than 0');
		if (formData.halfLife <= 0) errors.push('Half-life must be greater than 0');

		return errors;
	}

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
		bind:value={formData.elementName}
		required
	/>
	{#if showErrors && !formData.elementName.trim()}
		<span class="field-error">Element name is required</span>
	{/if}
</label>

<label class="label">
	<span>Element Short Name</span>
	<input
		class="input w-50"
		type="text"
		placeholder="e.g., Au, Na"
		bind:value={formData.shortName}
		required
	/>
	{#if showErrors && !formData.shortName.trim()}
		<span class="field-error">Element short name is required</span>
	{/if}
</label>

<label class="label">
	<span>Mass Number</span>
	<input
		class="input w-50"
		type="number"
		min="1"
		step="1"
		placeholder="e.g., 198"
		bind:value={formData.massNumber}
		required
	/>
	{#if showErrors && (!Number.isInteger(formData.massNumber) || formData.massNumber <= 0)}
		<span class="field-error">Mass number must be a positive integer</span>
	{/if}
</label>

<label class="label">
	<span>Suffix</span>
	<input
		class="input w-50"
		type="text"
		placeholder="e.g., m"
		bind:value={formData.suffix}
	/>
</label>

<label class="label">
	<span>Energy (in KeV)</span>
	<input
		class="input w-50"
		type="number"
		min="0"
		step="any"
		placeholder="e.g., 411.8"
		bind:value={formData.energy}
		required
	/>
	{#if showErrors && formData.energy <= 0}
		<span class="field-error">Energy must be greater than 0</span>
	{/if}
</label>

<label class="label">
	<span>Half Life</span>
	<input
		class="input w-50"
		type="number"
		min="0"
		step="any"
		placeholder="e.g., 230940.5"
		bind:value={formData.halfLife}
		required
	/>
	{#if showErrors && formData.halfLife <= 0}
		<span class="field-error">Half-life must be greater than 0</span>
	{/if}
</label>

<label>
	<span>Half Life Unit</span>
	<select
		class="select input w-50 bg-surface-50-950 text-surface-950-50"
		bind:value={formData.unit}
		required
	>
		<option value="seconds">Seconds</option>
		<option value="minutes">Minutes</option>
		<option value="hours">Hours</option>
		<option value="days">Days</option>
		<option value="weeks">Weeks</option>
		<option value="years">Years</option>
	</select>
</label>

<style>
	.field-error {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}
</style>