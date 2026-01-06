<!--Put information about materials here (both known and unknown)-->

<script lang="ts">
	let {
		materialInfo = $bindable({
			NETL_code: '',
			sampleName: '',
			mass: 0,
		})
	} = $props();

	export function validateMaterialInfo() {
		return materialInfo.NETL_code !== ''
			&& materialInfo.sampleName !== ""
			&& materialInfo.mass !== 0;
	}
</script>

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
