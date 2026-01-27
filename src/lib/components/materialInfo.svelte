<script lang="ts">
	import type { MaestroParsedData } from '$lib/NAAMath/types.js';
	import MaestroUpload from './maestroUpload.svelte';

	let {
		isotopeCount,
		materialInfo = $bindable({
			NETL_code: '',
			sampleName: '',
			mass: 0,
			irradiationTime: 0,
			decayTime: 0,
			liveTime: 0,
			realTime: 0,
			fluence: 0,
			counts: Array.from({ length: isotopeCount }, () => ({
				grossCounts: 0,
				netCounts: 0,
				uncertainty: 0
			})),
			dtType: undefined
		}),
		getRoiIndex
	} = $props();

	function handleParsedMaestro(data: MaestroParsedData) {
		materialInfo.liveTime = materialInfo.liveTime || data.liveTime;
		materialInfo.realTime = materialInfo.realTime || data.realTime;
		const roiIndex = getRoiIndex(data.roiData);
		materialInfo.counts = roiIndex.map((index: number) => ({
			grossCounts: data.roiData[index].grossCounts,
			netCounts: data.roiData[index].netCounts,
			uncertainty: data.roiData[index].uncertainty
		}));
	}

	export function validateMaterialInfo(): boolean {
		const errors = getValidationErrors();
		return errors.length === 0;
	}

	export function getValidationErrors(): string[] {
		const errors: string[] = [];

		if (!materialInfo.NETL_code || materialInfo.NETL_code.trim() === '') {
			errors.push('NETL Code is required');
		}

		if (!materialInfo.sampleName || materialInfo.sampleName.trim() === '') {
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
	<span>Decay Time (in seconds, s)</span>
	<input
		class="input w-50"
		type="number"
		bind:value={materialInfo.decayTime}
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
<br />
{#each { length: isotopeCount } as _, index}
	<h3 class="text-xl font-bold">Isotope {index + 1} Counts</h3>
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
	<br />
{/each}
<br />
<label class="label">
	<span>Dead Time Correction Type</span>
	<select
		class="select input w-50 bg-surface-50-950 text-surface-950-50"
		bind:value={materialInfo.dtType}
		required
	>
		<option value={undefined} disabled selected>Select correction type</option>
		<option value="short">Short Lived Only</option>
		<option value="simple">Simple: Only using the net counts, decay constant, and live time</option>
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

<style>
	.field-error {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}
</style>
