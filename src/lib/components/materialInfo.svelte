<script lang="ts">
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

	function handleParsedMaestro(data: object) {
		materialInfo.liveTime = materialInfo.liveTime || (data as any).liveTime;
		materialInfo.realTime = materialInfo.realTime || (data as any).realTime;
		let roiIndex = getRoiIndex((data as any).roiData);
		materialInfo.counts = roiIndex.map((index: number) => ({
			grossCounts: (data as any).roiData[index].grossCounts,
			netCounts: (data as any).roiData[index].netCounts,
			uncertainty: (data as any).roiData[index].uncertainty
		}));
	}
</script>

<MaestroUpload onParsed={handleParsedMaestro} />
<br />

<label class="label">
	<span>NETL Code</span>
	<input class="input w-50" type="text" bind:value={materialInfo.NETL_code} />
</label>
<label class="label">
	<span>Sample Name</span>
	<input class="input w-50" type="text" bind:value={materialInfo.sampleName} />
</label>
<label class="label">
	<span>Mass (in grams, g)</span>
	<input class="input w-50" type="number" bind:value={materialInfo.mass} />
</label>
<label class="label">
	<span>Irradiation time (in seconds, s)</span>
	<input class="input w-50" type="number" bind:value={materialInfo.irradiationTime} />
</label>
<label class="label">
	<span>Decay Time (in seconds, s)</span>
	<input class="input w-50" type="number" bind:value={materialInfo.decayTime} />
</label>
<label class="label">
	<span>Live Time (in seconds, s)</span>
	<input class="input w-50" type="number" bind:value={materialInfo.liveTime} />
</label>
<label class="label">
	<span>Real Time (in seconds, s)</span>
	<input class="input w-50" type="number" bind:value={materialInfo.realTime} />
</label>
<label class="label">
	<span>Fluence (in neutrons/cm²)</span>
	<input class="input w-50" type="number" bind:value={materialInfo.fluence} />
</label>
<br />
{#each { length: isotopeCount } as _, index}
	<h3 class="text-xl font-bold">Isotope {index + 1} Counts</h3>
	<label class="label">
		<span>Gross Counts</span>
		<input class="input w-50" type="number" bind:value={materialInfo.counts[index].grossCounts} />
	</label>
	<label class="label">
		<span>Net Counts</span>
		<input class="input w-50" type="number" bind:value={materialInfo.counts[index].netCounts} />
	</label>
	<label class="label">
		<span>Uncertainty (in counts)</span>
		<input class="input w-50" type="number" bind:value={materialInfo.counts[index].uncertainty} />
	</label>
	<br />
{/each}
<br />
<label class="label">
	<span>Dead Time Correction Type</span>
	<select
		class="select input w-50 bg-surface-50-950 text-surface-950-50"
		bind:value={materialInfo.dtType}
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
