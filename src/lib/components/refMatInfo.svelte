<!--Information about a reference material. This material type has a known concentration of the desired isotope.-->

<script lang="ts">
	import MaterialInfo from './materialInfo.svelte';
	let {
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
			grossCounts: 0,
			netCounts: 0,
			countUncertainty: 0,
			dtType: undefined,

			// specific to Reference Material
			knownConcentration: 0,
			knownUncertainty: 0
		}),
		getRoiIndex
	} = $props();
</script>

<MaterialInfo bind:materialInfo={refMatInfo} getRoiIndex={getRoiIndex} />
<label class="label">
	<span>Known Concentration (in ug/g, as a percent)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownConcentration} />
</label>
<label class="label">
	<span>Known Uncertainty (in ug/g)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownUncertainty} />
</label>
