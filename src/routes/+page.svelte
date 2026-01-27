<script lang="ts">
	import IsotopeInfo from '$lib/components/isotopeInfo.svelte';
	import MaterialInfo from '$lib/components/materialInfo.svelte';
	import RefMatInfo from '$lib/components/refMatInfo.svelte';
	import PageCounter from '$lib/components/pageCounter.svelte';
	import ComputedDisplay from '$lib/components/ComputedDisplay.svelte';
	import ProgressIndicator from '$lib/components/ProgressIndicator.svelte';

	import { getAll as isoGA } from '../lib/NAAMath/isotopeMath.ts';
	import { getAll as matGA } from '../lib/NAAMath/MaterialMath.ts';
	import { getAll as matIsoGA } from '../lib/NAAMath/MaterialIsotopeMath.ts';
	import { getAll as MMGA } from '../lib/NAAMath/MultiMaterialMath.ts';
	import { getAll as EGA } from '../lib/NAAMath/everythingMath.ts';

	import type { IsotopeInfo as IsotopeInfoType, ReferenceMaterial } from '$lib/types.js';
	import {
		createIsotopeInfo,
		createReferenceMaterial,
		createUnknownMaterial,
		findRoiIndices
	} from '$lib/utils/naaUtils.js';
	import {
		APP_VERSION,
		getIsotopeIndex,
		getUnknownIndex,
		getNextButtonText,
		getBackButtonText,
		getStepTitle,
		StepType,
		getStepType,
		getProgressPercentage,
		getReviewStep
	} from '$lib/utils/stepUtils.js';

	// Using findRoiIndices from naaUtils

	function updateIsotopeData(newCount: number) {
		isotopeCount = newCount;
		isotopeInfo = Array.from({ length: isotopeCount }, createIsotopeInfo);
		isoRef = Array.from({ length: isotopeCount }, () => undefined);

		// Update reference material counts, preserving existing knownConcentration and knownUncertainty
		const currentReference = materials.reference;
		const newReferenceBase = createReferenceMaterial(isotopeCount);

		// Preserve scalar / non-array properties from the current reference material
		const updatedReference: ReferenceMaterial = {
			...newReferenceBase,
			...currentReference
		};

		// Carefully merge knownConcentration and knownUncertainty arrays so existing values are preserved
		const existingKnownConcentration =
			currentReference && Array.isArray(currentReference.knownConcentration)
				? currentReference.knownConcentration
				: [];
		const existingKnownUncertainty =
			currentReference && Array.isArray(currentReference.knownUncertainty)
				? currentReference.knownUncertainty
				: [];

		updatedReference.knownConcentration = Array.from({ length: isotopeCount }, (_, i) =>
			existingKnownConcentration[i] !== undefined
				? existingKnownConcentration[i]
				: newReferenceBase.knownConcentration[i]
		);

		updatedReference.knownUncertainty = Array.from({ length: isotopeCount }, (_, i) =>
			existingKnownUncertainty[i] !== undefined
				? existingKnownUncertainty[i]
				: newReferenceBase.knownUncertainty[i]
		);

		materials.reference = updatedReference;
		// Update unknown materials counts
		materials.unknown = materials.unknown.map((unk) => ({
			...unk,
			counts: Array.from({ length: isotopeCount }, () => ({
				grossCounts: 0,
				netCounts: 0,
				uncertainty: 0
			}))
		}));
	}

	function updateUnknownData(newCount: number) {
		unknownCount = newCount;
		matRefs.unknown = Array.from({ length: unknownCount }, () => undefined);
		materials.unknown = Array.from({ length: unknownCount }, () =>
			createUnknownMaterial(isotopeCount)
		);
	}

	let step = $state(0);

	// isotope information
	let isoIndex = $derived(getIsotopeIndex(step));
	let isotopeCount = $state(1);
	// holds the reference to each isotope info component
	let isoRef: (IsotopeInfo | undefined)[] = $state([undefined]);
	// array of isotope information
	let isotopeInfo: IsotopeInfoType[] = $state([createIsotopeInfo()]);
	// computed isotope information
	let isoComp = $derived(isotopeInfo.map(isoGA));

	//step 1 : number of isotopes
	//step 2 to 1 + isotopeCount  : isotope information
	//step 2 + isotopeCount : reference material information
	//step 3 + isotope count: how many unknowns
	//step 4 + isotope count to 3 + isotope count + unknownCount : unknown material information
	//step 4 + isotope count + unknownCount : review
	let unknownIdx = $derived(getUnknownIndex(step, isotopeCount));
	let unknownCount = $state(1);
	let matRefs = $state({
		reference: undefined as RefMatInfo | undefined,
		unknown: [undefined] as (MaterialInfo | undefined)[]
	});
	let materials = $state({
		reference: createReferenceMaterial(1),
		unknown: [createUnknownMaterial(1)]
	});
	let matComp = $derived({
		reference: matGA(materials.reference),
		unknown: materials.unknown.map((unk) => matGA(unk))
	});
	let matIsoComp = $derived(
		isotopeInfo.map((iso, index) => ({
			reference: matIsoGA(materials.reference, iso, index),
			unknown: materials.unknown.map((unk) => matIsoGA(unk, iso, index))
		}))
	);
	let multiMatComp = $derived(materials.unknown.map((unk) => MMGA(materials.reference, unk)));
	let everythingComp = $derived(
		isotopeInfo.map((iso, index) =>
			materials.unknown.map((unk) => EGA(materials.reference, unk, iso, index))
		)
	);

	let nextButtonText = $derived(getNextButtonText(step, isotopeCount, unknownCount));
	let backButtonText = $derived(getBackButtonText(step, isotopeCount, unknownCount));
	let stepTitle = $derived(getStepTitle(step, isotopeCount, unknownCount));
	let stepType = $derived(getStepType(step, isotopeCount, unknownCount));
	let progressPercentage = $derived(getProgressPercentage(step, isotopeCount, unknownCount));
	let totalSteps = $derived(getReviewStep(isotopeCount, unknownCount));
	let showProgress = $derived(step > 0);

	// Memoized function to prevent recreation on every render
	let getRoiIndexFn = $derived((roiData: { centroid: number }[]) =>
		findRoiIndices(isotopeInfo, roiData)
	);

	// Validation state
	let validationErrors: string[] = $state([]);

	function validateCurrentStep(): boolean {
		validationErrors = [];

		// Validate isotope info steps
		if (isoIndex >= 0 && isoIndex < isotopeCount) {
			if (isoRef[isoIndex] && typeof isoRef[isoIndex]?.validateIsotopeInfo === 'function') {
				const isValid = isoRef[isoIndex]!.validateIsotopeInfo();
				if (!isValid) {
					if (typeof isoRef[isoIndex]?.showValidationErrors === 'function') {
						isoRef[isoIndex]!.showValidationErrors();
					}
					const errors = isoRef[isoIndex]!.getValidationErrors?.() || [
						'Please fill in all required fields'
					];
					validationErrors = errors;
					return false;
				}
			}
		}

		// Validate reference material step
		if (step === 2 + isotopeCount) {
			if (matRefs.reference && typeof matRefs.reference.validateRefMatInfo === 'function') {
				const isValid = matRefs.reference.validateRefMatInfo();
				if (!isValid) {
					if (typeof matRefs.reference.showValidationErrors === 'function') {
						matRefs.reference.showValidationErrors();
					}
					const errors = matRefs.reference.getValidationErrors?.() || [
						'Please fill in all required fields'
					];
					validationErrors = errors;
					return false;
				}
			}
		}

		// Validate unknown material steps
		if (unknownIdx >= 0 && unknownIdx < unknownCount) {
			if (
				matRefs.unknown[unknownIdx] &&
				typeof matRefs.unknown[unknownIdx]?.validateMaterialInfo === 'function'
			) {
				const isValid = matRefs.unknown[unknownIdx]!.validateMaterialInfo();
				if (!isValid) {
					if (typeof matRefs.unknown[unknownIdx]?.showValidationErrors === 'function') {
						matRefs.unknown[unknownIdx]!.showValidationErrors();
					}
					const errors = matRefs.unknown[unknownIdx]!.getValidationErrors?.() || [
						'Please fill in all required fields'
					];
					validationErrors = errors;
					return false;
				}
			}
		}

		return true;
	}

	const next = () => {
		// Clear previous errors
		validationErrors = [];

		// Validate before proceeding (skip validation for welcome and count steps)
		if (step > 1 && step < totalSteps) {
			if (!validateCurrentStep()) {
				// Show error message
				alert('Please complete all required fields before proceeding.');
				return;
			}
		}

		step++;
	};
	const prev = () => {
		if (step > 0) step--;
	};

	const handleSubmit = () => {};

	// Keyboard navigation
	const handleKeyPress = (e: KeyboardEvent) => {
		if (e.ctrlKey || e.metaKey) {
			if (e.key === 'ArrowRight' && step < totalSteps) {
				e.preventDefault();
				next();
			} else if (e.key === 'ArrowLeft' && step > 0) {
				e.preventDefault();
				prev();
			}
		}
	};
</script>

<svelte:head>
	<title>NAA Analysis</title>
</svelte:head>

<svelte:window onkeydown={handleKeyPress} />

<div style="padding: 5%">
	<h1 class="text-3xl font-bold">NAA Analysis - Version {APP_VERSION}</h1>
	<br />

	{#if showProgress}
		<ProgressIndicator currentStep={step} {totalSteps} percentage={progressPercentage} />
	{/if}

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		{#if step === 0}
			<p>
				This version includes a complete analysis process for a single isotope, a single standard,
				and a single unknown sample. It also includes uploading from a Maestro .rpt file to
				auto-fill gross counts, net counts, and uncertainty.
			</p>
			<br />
			<p>Multiple isotopes and unknowns are in beta.</p>
			<br />
			<p>
				The mixed dead time correction is deprecated. The simple correction option to replace it is
				currently in beta.
			</p>
			<br />
			<p>Version 4.1.1 is a refactor to improve code organization and maintainability.</p>
			<br />
			<h2 class="text-2xl font-bold">Future plans:</h2>
			<ol class="list-inside list-decimal">
				<li>
					Version 4.2: Improved reporting with table at top. Should include units for concentration.
				</li>
			</ol>
			<br />
			<h2 class="text-2xl font-bold">Future additions, not planned yet:</h2>
			<ul class="list-inside list-disc">
				<li>Exporting reports</li>
				<li>Half life in seconds, minutes, hours, days, years (using 1 yr = 365 days)</li>
				<li>Correct the matching to ensure it works with interference</li>
				<li>Fluence correction</li>
				<li>Uncertainty & relevant calculations</li>
				<li>Multiple standards</li>
				<li>Font size adjustment</li>
			</ul>
			<br />
			<button type="button" onclick={next}>Get Started</button>
		{:else if step === 1}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<PageCounter pageType="isotopes" pageCount={isotopeCount} updateFxn={updateIsotopeData} />
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if isoIndex >= 0 && isoIndex < isotopeCount}
			<!--For each step, show this. All of this should be in step 2, but there should be an indication of which isotope is being filled out. Ensure that the forward and back buttons work correctly.-->
			<!-- {#each { length: isotopeCount } as _, index} -->
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>
				This is where you enter information about isotope {isoIndex + 1}. This is used in the
				concentration calculations.
			</p>
			<br /><br />
			<IsotopeInfo bind:this={isoRef[isoIndex]} bind:isotopeInfo={isotopeInfo[isoIndex]} />
			<br />
			<ComputedDisplay
				title="Computed Isotope Information for Isotope {isoIndex + 1}"
				data={isoComp[isoIndex]}
			/>

			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
			<br /><br />
			<!-- {/each} -->
		{:else if step === 2 + isotopeCount}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>
				This is where you enter information about the reference material. This is used when
				comparing to the unknown material to determine concentrations.
			</p>
			<br /><br />
			<!-- <pre>{JSON.stringify(materials, null, 4)}</pre> -->
			<RefMatInfo
				{isotopeCount}
				getRoiIndex={getRoiIndexFn}
				bind:refMatInfo={materials.reference}
				bind:this={matRefs.reference}
			/>

			<ComputedDisplay title="Reference Material Information" data={matComp.reference} />
			<ComputedDisplay
				title="Reference and Isotope Information"
				data={matIsoComp.map((item) => item.reference)}
			/>

			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if step === 3 + isotopeCount}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<PageCounter
				pageType="unknown materials"
				pageCount={unknownCount}
				updateFxn={updateUnknownData}
			/>
			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if unknownIdx >= 0 && unknownIdx < unknownCount}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>
				This is where you enter information about the unknown material you are trying to understand.
			</p>
			<br /><br />
			<MaterialInfo
				{isotopeCount}
				getRoiIndex={getRoiIndexFn}
				bind:this={matRefs.unknown[unknownIdx]}
				bind:materialInfo={materials.unknown[unknownIdx]}
			/>

			<br />
			<ComputedDisplay
				title="Unknown Material Information for Unknown {unknownIdx + 1}"
				data={matComp.unknown[unknownIdx]}
			/>
			<ComputedDisplay
				title="Unknown and Isotope Information for Unknown {unknownIdx + 1}"
				data={matIsoComp.map((item) => item.unknown[unknownIdx])}
			/>

			<button type="button" onclick={prev}>{backButtonText}</button>
			&nbsp;&nbsp;
			<button type="button" onclick={next}> {nextButtonText} </button>
		{:else if unknownIdx === unknownCount}
			<h2 class="text-2xl font-bold">{stepTitle}</h2>
			<p>Please review all information you entered and see computed values below.</p>

			<ComputedDisplay title="Isotope Information" data={isotopeInfo} />
			<br />
			<ComputedDisplay title="Material Information" data={materials} />
			<br /><br />

			<h3 class="text-xl font-bold">Computed Values:</h3>
			<ComputedDisplay level={4} title="Isotope Computed Values" data={isoComp} />
			<ComputedDisplay level={4} title="Material Computed Values" data={matComp} />
			<ComputedDisplay level={4} title="Material and Isotope Computed Values" data={matIsoComp} />
			<ComputedDisplay level={4} title="Multi Material Computed Values" data={multiMatComp} />
			<ComputedDisplay
				level={4}
				title="Computed Values that use everything"
				data={everythingComp}
			/>
			<br />
			<button type="button" onclick={prev}>{backButtonText}</button>
		{/if}
		<br />
	</form>
</div>
