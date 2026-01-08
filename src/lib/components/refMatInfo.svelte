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
		})
	} = $props();

	export function validateRefMatInfo() {
		return (
			// Validate inherited MaterialInfo fields
			refMatInfo.NETL_code !== '' &&
			refMatInfo.sampleName !== '' &&
			refMatInfo.mass !== 0 &&
			refMatInfo.irradiationTime !== 0 &&
			refMatInfo.decayTime !== 0 &&
			refMatInfo.liveTime !== 0 &&
			refMatInfo.realTime !== 0 &&
			refMatInfo.fluence !== 0 &&
			refMatInfo.grossCounts !== 0 &&
			refMatInfo.netCounts !== 0 &&
			refMatInfo.countUncertainty !== 0 &&
			refMatInfo.dtType !== undefined &&
			// Validate Reference Material specific fields
			refMatInfo.knownConcentration !== 0 &&
			refMatInfo.knownUncertainty !== 0
		);
	}
</script>

<MaterialInfo bind:materialInfo={refMatInfo} />
<label class="label">
	<span>Known Concentration (in ug/g, as a percent)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownConcentration} />
</label>
<label class="label">
	<span>Known Uncertainty (in ug/g)</span>
	<input class="input w-50" type="number" bind:value={refMatInfo.knownUncertainty} />
</label>
