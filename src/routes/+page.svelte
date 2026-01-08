<script lang="ts">
	import IsotopeInfo from '$lib/components/isotopeInfo.svelte';
	import MaterialInfo from '$lib/components/materialInfo.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';

	import { getAll as isoGA } from '../lib/NAAMath/isotopeMath.ts';
	import { getAll as matGA } from '../lib/NAAMath/MaterialMath.ts';
	import { getAll as matIsoGA } from '../lib/NAAMath/MaterialIsotopeMath.ts';
	import { getAll as MMGA } from '../lib/NAAMath/MultiMaterialMath.ts';
	import { getAll as EGA } from '../lib/NAAMath/everythingMath.ts';

	let step = $state(0);

	let isoRef: IsotopeInfo | undefined = $state(undefined);
	let matRefs = $state({
		reference: undefined as RefMatInfo | undefined,
		unknown: undefined as MaterialInfo | undefined
	});

	let isotopeInfo = $state({ elementName: '', isotopeName: '', energy: 0, halfLife: 0 });
	let materials = $state({
		reference: {
			NETL_code: '',
			sampleName: '',
			mass: 0,
			irradiationTime: 0,
			knownConcentration: 0,
			knownUncertainty: 0
		},
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
		{#if step === 0}
			<h1 class="text-3xl font-bold">NAA Analysis - Version 1.0</h1>
			<p>
				This version includes a complete analysis process for a single isotope, a single standard,
				and a single unknown sample.
			</p>
			<br />
			<h2 class="text-2xl font-bold">Future plans:</h2>
			<ol class="list-inside list-decimal">
				<li>Version 2.0: Upload from Maestro</li>
			</ol>
			<br />
			<h2 class="text-2xl font-bold">Future additions, not planned yet:</h2>
			<ul class="list-inside list-disc">
				<li>Uncertainity & relevant calculations</li>
				<li>Multiple isotopes</li>
				<li>Multiple standards</li>
				<li>Multiple unknowns</li>
				<li>Exporting reports</li>
			</ul>
			<br />
			<button type="button" onclick={next}>Get Started</button>
		{:else if step === 1}
			<h2 class="text-2xl font-bold">Step 1: Isotope Information</h2>
			<p>
				This is where you enter information about the isotope. This is used in the concentration
				calculations.
			</p>
			<br /><br />
			<IsotopeInfo bind:this={isoRef} bind:isotopeInfo />

			<br />
			<h3 class="text-xl font-bold">Computed Isotope Information</h3>
			<pre>{JSON.stringify(isoComp, null, 4)}</pre>

			<button
				type="button"
				onclick={() => stepExit(next, () => isoRef?.validateIsotopeInfo() ?? false)}
			>
				Next
			</button>
		{:else if step === 2}
			<h2 class="text-2xl font-bold">Step 2: Reference Material Information</h2>
			<p>
				This is where you enter information about the reference material. This is used when
				comparing to the unknown material to determine concentrations.
			</p>
			<br /><br />
			<RefMatInfo bind:this={matRefs.reference} bind:refMatInfo={materials.reference} />

			<br />
			<h3 class="text-xl font-bold">Reference Material Information</h3>
			<pre>{JSON.stringify(matComp.reference, null, 4)}</pre>
			<h3 class="text-xl font-bold">Reference and Isotope Information</h3>
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
			<h2 class="text-2xl font-bold">Step 3: Unknown Material Information</h2>
			<p>
				This is where you enter information about the unknown material you are trying to understand.
			</p>
			<br /><br />
			<MaterialInfo bind:this={matRefs.unknown} bind:materialInfo={materials.unknown} />

			<br />
			<h3 class="text-xl font-bold">Unknown Material Information</h3>
			<pre>{JSON.stringify(matComp.unknown, null, 4)}</pre>
			<h3 class="text-xl font-bold">Unknown and Isotope Information</h3>
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
			<h2 class="text-2xl font-bold">Step 4: Review</h2>
			<p>Please review all information you entered and see computed values below.</p>
			<h3 class="text-xl font-bold">Isotope Information</h3>
			<pre>{JSON.stringify(isotopeInfo, null, 4)}</pre>
			<br />
			<h3 class="text-xl font-bold">Material Information</h3>
			<pre>{JSON.stringify(materials, null, 4)}</pre>
			<br /><br />
			<h3 class="text-xl font-bold">Computed Values:</h3>
			<h4 class="text-lg font-semibold">Isotope Computed Values</h4>
			<pre>{JSON.stringify(isoComp, null, 4)}</pre>
			<h4 class="text-lg font-semibold">Material Computed Values</h4>
			<pre>{JSON.stringify(matComp, null, 4)}</pre>
			<h4 class="text-lg font-semibold">Material and Isotope Computed Values</h4>
			<pre>{JSON.stringify(matIsoComp, null, 4)}</pre>
			<h4 class="text-lg font-semibold">Multi Material Computed Values</h4>
			<pre>{JSON.stringify(multiMatComp, null, 4)}</pre>
			<h4 class="text-lg font-semibold">Computed Values that use everything</h4>
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
