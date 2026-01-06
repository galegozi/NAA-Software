<script lang="ts">
	let {
		isotopeInfo = $bindable({
			elementName: '',
			isotopeName: '',
			energy: 0,
			halfLife: 0
		})
	} = $props();

	let decayConstant = $derived(Math.log(2) / isotopeInfo.halfLife);

	export function getDecayConstant(): number {
		return decayConstant;
	}

	export function validateIsotopeInfo(): boolean {
		return (
			isotopeInfo.elementName !== '' &&
			isotopeInfo.isotopeName !== '' &&
			isotopeInfo.energy > 0 &&
			isotopeInfo.halfLife > 0
		);
	}
</script>

<label class="label">
	<span>Element Name</span>
	<input class="input w-50" type="text" bind:value={isotopeInfo.elementName} />
</label>
<label class="label">
	<span>Isotope</span>
	<input class="input w-50" type="text" bind:value={isotopeInfo.isotopeName} />
</label>
<label class="label">
	<span>Energy (in KeV)</span>
	<input class="input w-50" type="number" bind:value={isotopeInfo.energy} />
</label>
<label class="label">
	<span>Half Life (in seconds, s)</span>
	<input class="input w-50" type="number" bind:value={isotopeInfo.halfLife} />
</label>
<br /><br />
<p>The decay constant is: {decayConstant}</p>
