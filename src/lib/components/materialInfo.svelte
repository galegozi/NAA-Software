<script lang="ts">
	import MaestroUpload from './maestroUpload.svelte';

	let {
		materialInfo = $bindable({
			NETL_code: '',
			sampleName: '',
			mass: 0,
			irradiationTime: 0,
			decayTime: 0,
			liveTime: 0,
			realTime: 0,
			fluence: 0,
			grossCounts: 0,
			netCounts: 0,
			countUncertainty: 0,
			dtType: undefined
		}),
		getRoiIndex
	} = $props();

	function handleParsedMaestro(data: object) {
		// process data as needed
		materialInfo.liveTime = materialInfo.liveTime || (data as any).liveTime;
		materialInfo.realTime = materialInfo.realTime || (data as any).realTime;
		console.log(JSON.stringify(data, null, 4));
		let roiIndex = getRoiIndex((data as any).roiData);
		materialInfo.grossCounts = (data as any).roiData[roiIndex].grossCounts;
		materialInfo.netCounts = (data as any).roiData[roiIndex].netCounts;
		materialInfo.countUncertainty = (data as any).roiData[roiIndex].uncertainty;
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
<label class="label">
	<span>Gross Counts</span>
	<input class="input w-50" type="number" bind:value={materialInfo.grossCounts} />
</label>
<label class="label">
	<span>Net Counts</span>
	<input class="input w-50" type="number" bind:value={materialInfo.netCounts} />
</label>
<label class="label">
	<span>Uncertainty (in counts)</span>
	<input class="input w-50" type="number" bind:value={materialInfo.countUncertainty} />
</label>
<label class="label">
	<span>Dead Time Correction Type</span>
	<select class="input w-50" bind:value={materialInfo.dtType}>
		<option value={undefined} disabled selected>Select correction type</option>
		<option value="short">Short Lived Only</option>
		<option value="mixed">Mixed: Short Lived in presence of Long Lived</option>
	</select>
</label>
