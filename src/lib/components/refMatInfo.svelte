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

	refMatInfo.knownConcentration = Array(isotopeCount).fill(0);
	refMatInfo.knownUncertainty = Array(isotopeCount).fill(0);
</script>

<MaterialInfo bind:materialInfo={refMatInfo} getRoiIndex={getRoiIndex} isotopeCount={isotopeCount} />
<!-- <label class="label">
	<span>Known Concentration (in ug/g, as a percent)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownConcentration} />
</label>
<label class="label">
	<span>Known Uncertainty (in ug/g)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownUncertainty} />
</label> -->
{#each {length: isotopeCount} as _, index}
	<h3 class="text-xl font-bold">Isotope {index + 1} Known Concentration</h3>
	<label class="label">
		<span>Known Concentration (in ug/g, as a percent)</span>
		<input class="input w-50" type="number" bind:value={refMatInfo.knownConcentration[index]} />
	</label>
	<label class="label">
		<span>Known Uncertainty (in ug/g)</span>
		<input class="input w-50" type="number" bind:value={refMatInfo.knownUncertainty[index]} />
	</label>
{/each}