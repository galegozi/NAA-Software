<script lang="ts">
	import IsotopeInfo from '$lib/components/isotopeInfo.svelte';
	import MaterialInfo from '$lib/components/materialInfo.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';

	import { getAll as isoGA } from '../lib/NAAMath/isotopeMath.ts';
	import { getAll as matGA } from '../lib/NAAMath/MaterialMath.ts';
	import { getAll as matIsoGA } from '../lib/NAAMath/MaterialIsotopeMath.ts';
	import { getAll as MMGA } from '../lib/NAAMath/MultiMaterialMath.ts';
	import { getAll as EGA } from '../lib/NAAMath/everythingMath.ts';

	let step = $state(1);

	let isoRef: IsotopeInfo | undefined = $state(undefined);
	let matRefs = $state({
		reference: undefined as RefMatInfo | undefined,
		unknown: undefined as MaterialInfo | undefined
	});

	let isotopeInfo = $state({ elementName: '', isotopeName: '', energy: 0, halfLife: 0 });
	let materials = $state({
		reference: { NETL_code: '', sampleName: '', mass: 0, irradiationTime: 0, knownConcentration: 0, knownUncertainty: 0 },
		unknown: { NETL_code: '', sampleName: '', mass: 0, irradiationTime: 0 }
	});

	let isoComp = $derived(isoGA(isotopeInfo));
	let matComp = $derived({
		reference: matGA(materials.reference),
		unknown: matGA(materials.unknown)
	});
	let matIsoComp = $derived({
		reference: matIsoGA(materials.reference, isotopeInfo),
		unknown: matIsoGA(materials.unknown, isotopeInfo)
	});
	let multiMatComp = $derived(MMGA(materials.reference, materials.unknown));
	let everythingComp = $derived(EGA(materials.reference, materials.unknown, isotopeInfo));

	const stepExit = (exitFxn: () => void, validateStep: () => boolean) => {
		if (!validateStep()) {
			alert('Please fill out all fields correctly before proceeding.');
			return;
		}
		exitFxn();
	};

	const next = () => step++;
	const prev = () => step--;

	const handleSubmit = () => {
		alert('Submitted, thanks!');
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

			<br />

			<pre>{JSON.stringify(isoComp, null, 4)}</pre>

			<button
				type="button"
				onclick={() => stepExit(next, () => isoRef?.validateIsotopeInfo() ?? false)}
			>
				Next
			</button>
		{:else if step === 2}
			<p>Step 2: Reference Material Information</p>
			<p>
				This is where you enter information about the reference material. This is used when
				comparing to the unknown material to determine concentrations.
			</p>
			<RefMatInfo bind:this={matRefs.reference} bind:refMatInfo={materials.reference} />

			<br />
			<p>Reference Material Information</p>
			<pre>{JSON.stringify(matComp.reference, null, 4)}</pre>
			<p>Reference and Isotope Information</p>
			<pre>{JSON.stringify(matIsoComp.reference, null, 4)}</pre>

			<button
				type="button"
				onclick={() => stepExit(prev, () => matRefs.reference?.validateRefMatInfo() ?? false)}
			>
				Back
			</button>
			&nbsp;&nbsp;
			<button
				type="button"
				onclick={() => stepExit(next, () => matRefs.reference?.validateRefMatInfo() ?? false)}
			>
				Next
			</button>
		{:else if step === 3}
			<p>Step 3: Unknown Material Information</p>
			<p>
				This is where you enter information about the unknown material you are trying to understand.
			</p>
			<MaterialInfo bind:this={matRefs.unknown} bind:materialInfo={materials.unknown} />

			<br />
			<p>Unknown Material Information</p>
			<pre>{JSON.stringify(matComp.unknown, null, 4)}</pre>
			<p>Unknown and Isotope Information</p>
			<pre>{JSON.stringify(matIsoComp.unknown, null, 4)}</pre>

			<button
				type="button"
				onclick={() => stepExit(prev, () => matRefs.unknown?.validateMaterialInfo() ?? false)}
			>
				Back
			</button>
			&nbsp;&nbsp;
			<button
				type="button"
				onclick={() => stepExit(next, () => matRefs.unknown?.validateMaterialInfo() ?? false)}
			>
				Confirm and Review
			</button>
		{:else if step === 4}
			<p>Step 4: Review and Submit</p>
			<p>Please review your information before submitting.</p>
			<p>Isotope Information</p>
			<pre>{JSON.stringify(isotopeInfo, null, 4)}</pre>
			<br />
			<p>Material Information</p>
			<pre>{JSON.stringify(materials, null, 4)}</pre>
			<br /><br />
			<p>Computed Values:</p>
			<p>Isotope Computed Values</p>
			<pre>{JSON.stringify(isoComp, null, 4)}</pre>
			<p>Material Computed Values</p>
			<pre>{JSON.stringify(matComp, null, 4)}</pre>
			<p>Material and Isotope Computed Values</p>
			<pre>{JSON.stringify(matIsoComp, null, 4)}</pre>
			<p>Multi Material Computed Values</p>
			<pre>{JSON.stringify(multiMatComp, null, 4)}</pre>
			<p>Computed Values that use everything</p>
			<pre>{JSON.stringify(everythingComp, null, 4)}</pre>
			<br />
			<!-- <p>Reference Material Information</p>
			<pre>{JSON.stringify(materials.reference, null, 2)}</pre>
			<p>
				Reference Material Saturation Factor: {matComputedFactors.reference.saturationFactor}
			</p>
			<p>Unknown Material Information</p>
			<pre>{JSON.stringify(materials.unknown, null, 2)}</pre>
			<p>
				Unknown Material Saturation Factor: {matComputedFactors.unknown.saturationFactor}
			</p>
			<p>Mass Ratio</p> -->
			<!-- <pre>{(correctionFactors as any).mass}</pre> -->
			<button type="button" onclick={prev}>Back</button>
			<!-- &nbsp;&nbsp; -->
			<!-- <button type="submit">Submit</button> -->
		{/if}
		<br />
		<!-- {#if step > 2}<button type="button" onclick={prev}>Back</button>{/if} -->
		<!-- {#if step == 2}<button type="button" onclick={next}>Next</button>{/if} -->
	</form>
</div>
