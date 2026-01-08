<script lang="ts">
	let files: FileList | undefined = $state(undefined);
	let fileContent = $state('');
	let fileLines: string[] = $state([]);
	let detectorInfo: string[] = $state([]);
	let dataLines: string[] = $state([]);
	let roiData: object[] = $state([]);
	let realTime: number = $state(0);
	let liveTime: number = $state(0);

	async function handleFileChange() {
		if (files && files.length > 0) {
			const file = files[0];
			fileContent = await file.text(); // Read plain text content
			fileLines = fileContent.split('\n'); // Split content into lines
			// check for empty lines & lines with pure whitespace.
			fileLines = fileLines.filter((line) => line.trim() !== '');
			// all lines before the line that starts with ROI are detector information.
			detectorInfo = [];
			for (const line of fileLines) {
				if (line.trim().startsWith('ROI')) {
					break;
				}
				detectorInfo.push(line.trim());
			}
			// look for RT = and LT = in detectorInfo
			for (const line of detectorInfo) {
				if (line.includes('RT =')) {
					let parts = line.split('RT =');
					if (parts.length > 1) {
						realTime = parseFloat(parts[1].trim());
					}
				}
				if (line.includes('LT =')) {
					let parts = line.split('LT =');
					if (parts.length > 1) {
						liveTime = parseFloat(parts[1].trim());
					}
				}
			}
			// all lines after the line that starts with ROI are data lines.
			dataLines = [];
			let roiFound = false;
			for (const line of fileLines) {
				if (roiFound) {
					dataLines.push(line.trim());
				}
				if (line.trim().startsWith('ROI')) {
					roiFound = true;
				}
			}
			for (const line of dataLines) {
				let parts = line.split(/\s+/);
				let roiEntry = {
					roi: parseInt(parts[0]),
					// parts 1 & 2 are for min and max energy
					energyRange: [parseFloat(parts[1]), parseFloat(parts[2])],
					grossCounts: parseFloat(parts[3]),
					netCounts: parseFloat(parts[4]),
					uncertainty: parseFloat(parts[5]),
					centroid: parseFloat(parts[6])
				};
				roiData.push(roiEntry);
			}
		}
	}
</script>

<label for="rpt-upload">Optional: Auto-fill some details by uploading a roi file. This is a text file with a .rpt extension.</label>
<br />
<input id="rpt-upload" type="file" accept=".rpt" bind:files onchange={handleFileChange} />

<!-- {#if fileContent}
		<pre>{JSON.stringify(fileLines, null, 4)}</pre>
	{/if}

	<pre>{JSON.stringify(detectorInfo, null, 4)}</pre>
	<pre>{JSON.stringify(dataLines, null, 4)}</pre> -->
<pre>{JSON.stringify(roiData, null, 4)}</pre>
<pre>Real Time: {realTime} seconds</pre>
<pre>Live Time: {liveTime} seconds</pre>
