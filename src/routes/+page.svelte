<script lang="ts">
	let elementName = $state('');
	let isotopeName = $state('');
	let energy = $state(0);
	let halfLife = $state(0);
	function computeDecayConstant(hl: number) {
		//argument hl: the half life in seconds.
		return Math.log(2) / hl;
	}
    let decayConstant = $derived(computeDecayConstant(halfLife))
</script>

<div style="padding: 5%">
	<label class="label">
		<span>Element Name:</span>
		<input class="input w-50" type="text" bind:value={elementName} />
	</label>
	<label class="label">
		<span>Isotope:</span>
		<input class="input w-50" type="text" bind:value={isotopeName} />
	</label>
	<label class="label">
		<span>Energy (in KeV):</span>
		<input class="input w-50" type="number" bind:value={energy} />
	</label>
	<label class="label">
		<span>Half Life (in seconds, s):</span>
		<input class="input w-50" type="number" bind:value={halfLife} />
	</label>
    <br/><br/>
    <p>The decay constant is: {decayConstant}</p>
</div>

<!-- <h1>Welcome to your library project</h1>
<p>Create your package using @sveltejs/package and preview/showcase your work with SvelteKit</p>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p> -->
