<script>
	import IsotopeInfo from './inputs/isotopeInfo.svelte';
	import MaterialInfo from './inputs/materialInfo.svelte';

	let step = $state(1);

	let isoRef = $state();
	let refMatRef = $state();
	let unknownMatRef = $state();

	let isotopeInfo = $state({});
	let materials = $state({
		reference: {},
		unknown: {}
	});

	const stepExit = (
		/** @type {{ (): number; (): void; }} */ exitFxn,
		/** @type {() => boolean} */ validateStep
	) => {
		if (!validateStep()) {
			alert('Please fill out all fields correctly before proceeding.');
			return;
		}
		exitFxn();
	};

	const next = () => step++;
	const prev = () => step--;

	const handleSubmit = () => {
		//validate and go to step 4
		//for now, just display info.
		alert(
			`Isotope Info: ${JSON.stringify(
				isotopeInfo
			)}\nReference Material Info: ${JSON.stringify(
				materials.reference
			)}\nUnknown Material Info: ${JSON.stringify(materials.unknown)}`
		);
		alert(`The mass ratio is: ${
			(materials.reference.mass / materials.unknown.mass)
		}`);
	};
</script>

<div style="padding: 5%">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		{#if step === 1}
			<p>Step 1: Isotope Information</p>
			<p>
				This is where you enter information about the isotope. This is used in the concentration
				calculations.
			</p>
			<IsotopeInfo bind:this={isoRef} bind:isotopeInfo />

			<button type="button" onclick={() => stepExit(next, isoRef.validateIsotopeInfo)}>
				Next
			</button>
		{:else if step === 2}
			<p>Step 2: Reference Material Information</p>
			<p>
				This is where you enter information about the reference material. This is used when
				comparing to the unknown material to determine concentrations.
			</p>
			<MaterialInfo bind:this={refMatRef} bind:materialInfo={materials.reference} />
			<button type="button" onclick={() => stepExit(prev, refMatRef.validateMaterialInfo)}>
				Back
			</button>
			&nbsp;&nbsp;
			<button type="button" onclick={() => stepExit(next, refMatRef.validateMaterialInfo)}>
				Next
			</button>
		{:else if step === 3}
			<p>Step 3: Unknown Material Information</p>
			<p>
				This is where you enter information about the unknown material you are trying to understand.
			</p>
			<MaterialInfo bind:this={unknownMatRef} bind:materialInfo={materials.unknown} />
			<button type="button" onclick={() => stepExit(prev, unknownMatRef.validateMaterialInfo)}>
				Back
			</button>
			&nbsp;&nbsp;
			<button type="submit">Submit</button>
		{:else if step === 4}
			<p>Step 4: Review and Submit</p>
			<p>Please review your information before submitting.</p>
			<h3>Isotope Information</h3>
			<pre>{JSON.stringify(isotopeInfo, null, 2)}</pre>
			<h3>Reference Material Information</h3>
			<pre>{JSON.stringify(materials.reference, null, 2)}</pre>
			<h3>Unknown Material Information</h3>
			<pre>{JSON.stringify(materials.unknown, null, 2)}</pre>
			<button type="button" onclick={prev}>Back</button>
			&nbsp;&nbsp;
			<button type="submit">Submit</button>
		{/if}
		<br />
		<!-- {#if step > 2}<button type="button" onclick={prev}>Back</button>{/if} -->
		<!-- {#if step == 2}<button type="button" onclick={next}>Next</button>{/if} -->
	</form>
</div>
