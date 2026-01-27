<!--This component handles initializing the number of pages of a specific type to be used.-->
<!--isotopes are used here, but it should be generic. It should take a string, as well as a variable that it can access in +page.svelte-->
<script lang="ts">
	let { pageCount = $bindable(1), updateFxn, pageType } = $props();

	function validateAndUpdate() {
		// Ensure integer
		if (!Number.isInteger(pageCount)) {
			pageCount = Math.floor(pageCount);
			alert(
				`You did not enter an integer. Using the floor of the value. ${pageType} count = ${pageCount}`
			);
		}

		// Ensure positive
		if (pageCount < 1) {
			pageCount = 1;
			alert(`Please enter a positive integer for the number of ${pageType}. Using 1 as the count.`);
		}

		// Limit to reasonable maximum
		// if (pageCount > 100) {
		// 	pageCount = 100;
		// 	alert(`Maximum of 100 ${pageType} allowed. Setting count to 100.`);
		// }

		updateFxn(pageCount);
	}
</script>

<label class="label">
	<span>How many {pageType} do you want to analyze?</span>
	<input
		class="input w-20"
		type="number"
		min="1"
		step="1"
		bind:value={pageCount}
		onchange={validateAndUpdate}
	/>
</label>
