<script lang="ts">
	import IsotopeInfo from '$lib/components/isotopeInfo.svelte';
	import MaterialInfo from '$lib/components/materialInfo.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';

	import { getAll as isoGA } from '../lib/NAAMath/isotopeMath.ts';
	import { getAll as matGA } from '../lib/NAAMath/MaterialMath.ts';
	import { getAll as matIsoGA } from '../lib/NAAMath/MaterialIsotopeMath.ts';
	import { getAll as MMGA } from '../lib/NAAMath/MultiMaterialMath.ts';
	import { getAll as EGA } from '../lib/NAAMath/everythingMath.ts';

	function findIndex(roiData: object[]): number[] {
		// Find the closest energy match between an isotope and the ROI centroids.
		// Returns an array of length isotopeInfo.length with the indices of the closest ROIs.
		let indices: number[] = [];
		for (let i = 0; i < isotopeInfo.length; i++) {
			let isotopeEnergy = isotopeInfo[i].energy;
			let closestIndex = -1;
			let closestDiff = Infinity;
			for (let j = 0; j < roiData.length; j++) {
				let roiCentroid = (roiData as any)[j].centroid;
				let diff = Math.abs(isotopeEnergy - roiCentroid);
				if (diff < closestDiff) {
					closestDiff = diff;
					closestIndex = j;
				}
			}
			indices.push(closestIndex);
		}
		return indices;
	}

	let step = $state(0);

	let isoIndex = $derived(step - 2);
	// let { isotopeCount = $bindable() } = $props();
	let isotopeCount = $state(0);
	// let isoRef: IsotopeInfo | undefined = $state(undefined);
	let isoRef: (IsotopeInfo | undefined)[] = $state([]);
	// let isotopeInfo = $state({ elementName: '', isotopeName: '', energy: 0, halfLife: 0 });
	let isotopeInfo: {
		elementName: string;
		isotopeName: string;
		energy: number;
		halfLife: number;
	}[] = $state([]);
	// let isoComp = $derived(isoGA(isotopeInfo));
	let isoComp = $derived(isotopeInfo.map(isoGA));

	let matRefs = $state({
		reference: undefined as RefMatInfo | undefined,
		unknown: undefined as MaterialInfo | undefined
	});
	let materials = $state({
		reference: {
			// inherited from MaterialInfo
			NETL_code: '',
			sampleName: '',
			mass: 0,
			irradiationTime: 0,
			decayTime: 0,
			liveTime: 0,
			realTime: 0,
			fluence: 0,
			counts: Array(isotopeCount).fill({ grossCounts: 0, netCounts: 0, uncertainty: 0 }),
			dtType: undefined,

			// specific to Reference Material
			knownConcentration: [],
			knownUncertainty: []
		},
		unknown: {
			NETL_code: '',
			sampleName: '',
			mass: 0,
			irradiationTime: 0,
			decayTime: 0,
			liveTime: 0,
			realTime: 0,
			fluence: 0,
			counts: Array(isotopeCount).fill({ grossCounts: 0, netCounts: 0, uncertainty: 0 }),
			dtType: undefined
		}
	});
	let matComp = $derived({
		reference: matGA(materials.reference),
		unknown: matGA(materials.unknown)
	});
	let matIsoComp = $derived(
		isotopeInfo.map((iso, index) => ({
			reference: matIsoGA(materials.reference, iso, index),
			unknown: matIsoGA(materials.unknown, iso, index)
		}))
	);
	let multiMatComp = $derived(MMGA(materials.reference, materials.unknown));
	// let everythingComp = $derived(EGA(materials.reference, materials.unknown, isotopeInfo));
	let everythingComp = $derived(
		isotopeInfo.map((iso, index) => EGA(materials.reference, materials.unknown, iso, index))
	);

	// const stepExit = (exitFxn: () => void, validateStep: () => boolean) => {
	// 	if (!validateStep()) {
	// 		alert('Please fill out all fields correctly before proceeding.');
	// 		return;
	// 	}
	// 	exitFxn();
	// };

	const next = () => step++;
	const prev = () => step--;

	const handleSubmit = () => {};
</script>

<div style="padding: 5%">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		{#if step === 0}
			<h1 class="text-3xl font-bold">NAA Analysis - Version 3.0 PREVIEW</h1>
			<p>
				This version includes a complete analysis process for a single isotope, a single standard,
				and a single unknown sample. It also includes uploading from a Maestro .rpt file to
				auto-fill gross counts, net counts, and uncertainty.
			</p>
			<p>Multiple isotopes are included in this release, but they are in preview.</p>
			<br />
			<h2 class="text-2xl font-bold">Future plans:</h2>
			<ol class="list-inside list-decimal">
				<li>Version 4.0: Multiple Unknowns</li>
			</ol>
			<br />
			<h2 class="text-2xl font-bold">Future additions, not planned yet:</h2>
			<ul class="list-inside list-disc">
				<li>Fluence correction</li>
				<li>Uncertainty & relevant calculations</li>
				<li>Multiple standards</li>
				<li>Multiple unknowns</li>
				<li>Exporting reports</li>
				<li>
					Additional option: Use net count / third factor (third factor from short dead time
					correction) for dead time correction
				</li>
				<li>Font size adjustment</li>
				<li>Half life in seconds, minutes, hours, days, years (using 1 yr = 365 days)</li>
			</ul>
			<br />
			<button type="button" onclick={next}>Get Started</button>
		{:else if step === 1}
			<!--How many isotopes do you want?-->
			<h2 class="text-2xl font-bold">Step 1: Number of Isotopes</h2>
			<label class="label">
				<span>How many isotopes do you want to analyze?</span>
				<input
					class="input w-20"
					type="number"
					min="1"
					bind:value={isotopeCount}
					onchange={() => {
						// if isotopeCount is not an integer, use the floor function & alert.
						if (!Number.isInteger(isotopeCount)) {
							alert(
								'You did not enter an integer. Using the floor of the value. Isotope count = ' +
									Math.floor(isotopeCount)
							);
							isotopeCount = Math.floor(isotopeCount);
						}
						if (isotopeCount < 1) {
							alert('Please enter a positive integer for the number of isotopes. Using 1 isotope.');
							isotopeCount = 1;
						}
						isotopeInfo = Array.from({ length: isotopeCount }, () => ({
							elementName: '',
							isotopeName: '',
							energy: 0,
							halfLife: 0
						}));
						isoRef = Array.from({ length: isotopeCount }, () => undefined);

						//change material
						materials.reference.counts = Array.from({ length: isotopeCount }, () => ({
							grossCounts: 0,
							netCounts: 0,
							uncertainty: 0
						}));
						materials.unknown.counts = Array.from({ length: isotopeCount }, () => ({
							grossCounts: 0,
							netCounts: 0,
							uncertainty: 0
						}));
					}}
				/>
			</label>
			<button type="button" onclick={next}> Next </button>
		{:else if isoIndex >= 0 && isoIndex < isotopeCount}
			<!--For each step, show this. All of this should be in step 2, but there should be an indication of which isotope is being filled out. Ensure that the forward and back buttons work correctly.-->
			<!-- {#each { length: isotopeCount } as _, index} -->
			<h2 class="text-2xl font-bold">
				Step {isoIndex + 2}: Isotope Information for Isotope: {isoIndex + 1}
			</h2>
			<p>
				This is where you enter information about isotope {isoIndex + 1}. This is used in the
				concentration calculations.
			</p>
			<br /><br />
			<IsotopeInfo bind:this={isoRef[isoIndex]} bind:isotopeInfo={isotopeInfo[isoIndex]} />
			<br />
			<h3 class="text-xl font-bold">Computed Isotope Information for Isotope {isoIndex + 1}</h3>
			<pre>{JSON.stringify(isoComp[isoIndex], null, 4)}</pre>

			<button type="button" onclick={prev}> Back </button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> Next </button>
			<br /><br />
			<!-- {/each} -->
		{:else if step === 2 + isotopeCount}
			<h2 class="text-2xl font-bold">Step {step}: Reference Material Information</h2>
			<p>
				This is where you enter information about the reference material. This is used when
				comparing to the unknown material to determine concentrations.
			</p>
			<br /><br />
			<RefMatInfo {isotopeCount} getRoiIndex={findIndex} bind:refMatInfo={materials.reference} />

			<br />
			<h3 class="text-xl font-bold">Reference Material Information</h3>
			<pre>{JSON.stringify(matComp.reference, null, 4)}</pre>
			<h3 class="text-xl font-bold">Reference and Isotope Information</h3>
			<!-- <pre>{JSON.stringify(matIsoComp.reference, null, 4)}</pre> -->
			<pre>{JSON.stringify(
					matIsoComp.map((item) => item.reference),
					null,
					4
				)}</pre>

			<button type="button" onclick={prev}> Back </button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> Next </button>
		{:else if step === 3 + isotopeCount}
			<h2 class="text-2xl font-bold">Step {step}: Unknown Material Information</h2>
			<p>
				This is where you enter information about the unknown material you are trying to understand.
			</p>
			<br /><br />
			<MaterialInfo
				{isotopeCount}
				getRoiIndex={findIndex}
				bind:this={matRefs.unknown}
				bind:materialInfo={materials.unknown}
			/>

			<br />
			<h3 class="text-xl font-bold">Unknown Material Information</h3>
			<pre>{JSON.stringify(matComp.unknown, null, 4)}</pre>
			<h3 class="text-xl font-bold">Unknown and Isotope Information</h3>
			<!-- <pre>{JSON.stringify(matIsoComp.unknown, null, 4)}</pre> -->
			<pre>{JSON.stringify(
					matIsoComp.map((item) => item.unknown),
					null,
					4
				)}</pre>

			<button type="button" onclick={prev}> Back </button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> Confirm and Review </button>
		{:else if step === 4 + isotopeCount}
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
