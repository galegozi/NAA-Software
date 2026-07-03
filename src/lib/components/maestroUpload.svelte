<script lang="ts">
	import type { MaestroRoiEntry, MaestroParsedData } from '$lib/NAAMath/types.js';

	let files: FileList | undefined = $state(undefined);
	let fileContent = $state('');
	let fileLines: string[] = $state([]);
	let detectorInfo: string[] = $state([]);
	let dataLines: string[] = $state([]);
	let parsedRealTime: number = $state(0);
	let parsedLiveTime: number = $state(0);
	let parsedStartTime: Date | null = $state(null);
	let parseError = $state('');
	let { onParsed }: { onParsed?: (data: MaestroParsedData) => void } = $props();

	function parseFirstNumber(value: string): number {
		const match = value.match(/[-+]?\d[\d,]*(?:\.\d+)?(?:[eE][-+]?\d+)?/);
		if (!match) {
			return NaN;
		}

		return Number.parseFloat(match[0].replace(/,/g, ''));
	}

	function parseRoiLine(line: string): MaestroRoiEntry | null {
		const trimmed = line.trim();
		if (!trimmed) {
			return null;
		}

		const isRoiLikeLine = /^(?:ROI\s*)?\d+[:.)]?\s+/i.test(trimmed);
		if (!isRoiLikeLine) {
			return null;
		}

		const numericTokens = trimmed
			.replace(/,/g, '')
			.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);

		if (!numericTokens || numericTokens.length < 7) {
			throw new Error(`Unable to read ROI values from line: '${trimmed}'`);
		}

		const roi = Number.parseInt(numericTokens[0], 10);
		const minEnergy = Number.parseFloat(numericTokens[1]);
		const maxEnergy = Number.parseFloat(numericTokens[2]);
		const grossCounts = Number.parseFloat(numericTokens[3]);
		const netCounts = Number.parseFloat(numericTokens[4]);
		const uncertainty = Number.parseFloat(numericTokens[5]);
		const centroid = Number.parseFloat(numericTokens[6]);

		if (
			![roi, minEnergy, maxEnergy, grossCounts, netCounts, uncertainty, centroid].every(Number.isFinite)
		) {
			throw new Error(`Unable to read gross/net counts from line: '${trimmed}'`);
		}

		return {
			roi,
			energyRange: [minEnergy, maxEnergy],
			grossCounts,
			netCounts,
			uncertainty,
			centroid
		};
	}

	function parseMaestroStartTime(line: string): Date | null {
		const match = line.match(
			/acq\s+(.+?)\s+at\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)(?:\s+|$)/i
		);
		if (!match) {
			return null;
		}

		const datePart = match[1].trim();
		const timePart = match[2].trim();

		const directParse = new Date(`${datePart} ${timePart}`);
		if (!isNaN(directParse.getTime())) {
			return directParse;
		}

		const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
		if (!timeMatch) {
			return null;
		}

		let hours = Number(timeMatch[1]);
		const minutes = Number(timeMatch[2]);
		const seconds = Number(timeMatch[3] ?? '0');
		const meridiem = timeMatch[4]?.toUpperCase();

		if (meridiem === 'PM' && hours < 12) {
			hours += 12;
		}
		if (meridiem === 'AM' && hours === 12) {
			hours = 0;
		}

		const numericDateMatch = datePart.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
		if (numericDateMatch) {
			const month = Number(numericDateMatch[1]);
			const day = Number(numericDateMatch[2]);
			let year = Number(numericDateMatch[3]);
			if (year < 100) {
				year += year >= 70 ? 1900 : 2000;
			}
			const parsed = new Date(year, month - 1, day, hours, minutes, seconds);
			return isNaN(parsed.getTime()) ? null : parsed;
		}

		const namedDateMatch = datePart.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2}|\d{4})$/);
		if (namedDateMatch) {
			const day = Number(namedDateMatch[1]);
			const monthToken = namedDateMatch[2].slice(0, 3).toLowerCase();
			const monthMap: Record<string, number> = {
				jan: 0,
				feb: 1,
				mar: 2,
				apr: 3,
				may: 4,
				jun: 5,
				jul: 6,
				aug: 7,
				sep: 8,
				oct: 9,
				nov: 10,
				dec: 11
			};
			const month = monthMap[monthToken];
			if (month === undefined) {
				return null;
			}
			let year = Number(namedDateMatch[3]);
			if (year < 100) {
				year += year >= 70 ? 1900 : 2000;
			}
			const parsed = new Date(year, month, day, hours, minutes, seconds);
			return isNaN(parsed.getTime()) ? null : parsed;
		}

		return null;
	}

	async function handleFileChange() {
		if (files && files.length > 0) {
			parseError = '';
			const file = files[0];

			try {
				parsedRealTime = 0;
				parsedLiveTime = 0;
				parsedStartTime = null;
				const roiData: MaestroRoiEntry[] = [];
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
						const parts = line.split('RT =');
						if (parts.length > 1) {
							parsedRealTime = parseFirstNumber(parts[1].trim());
						}
					}
					if (line.includes('LT =')) {
						const parts = line.split('LT =');
						if (parts.length > 1) {
							parsedLiveTime = parseFirstNumber(parts[1].trim());
						}
					}
				}

				// look for acq <DATE> at <TIME> in detectorInfo and parse the date and time if found
				for (const line of detectorInfo) {
					const parsedDate = parseMaestroStartTime(line);
					if (parsedDate) {
						parsedStartTime = parsedDate;
						break;
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
					const roiEntry = parseRoiLine(line);
					if (roiEntry) {
						roiData.push(roiEntry);
					}
				}

				if (roiData.length === 0) {
					throw new Error(
						'Unable to parse ROI rows from this file. Please verify it contains a Maestro ROI table with gross and net counts.'
					);
				}

				if (onParsed) {
					const parsedData: MaestroParsedData = {
						roiData: roiData,
						realTime: parsedRealTime,
						liveTime: parsedLiveTime,
						startTime: parsedStartTime
					};
					onParsed(parsedData);
				}
			} catch (error) {
				parseError =
					error instanceof Error
						? error.message
						: 'Unable to parse this .rpt file. Please verify the ROI table format.';
			}
		}
	}
</script>

<label for="rpt-upload">
	Optional: Auto-fill some details by uploading an roi file. This is a text file with a .rpt
	extension.
</label>
<br />
<input id="rpt-upload" type="file" accept=".rpt" bind:files onchange={handleFileChange} />
<br />

{#if parseError}
	<p class="upload-error">{parseError}</p>
{/if}

<!-- {#if parseCompleted} -->
<!-- <pre>{JSON.stringify(roiData, null, 4)}</pre>
<pre>Real Time: {parsedRealTime} seconds</pre>
<pre>Live Time: {parsedLiveTime} seconds</pre> -->
<!-- <pre>{fileContent}</pre> -->
<!-- {/if} -->

<style>
	.upload-error {
		color: #ef4444;
		font-size: 0.9rem;
		margin-top: 0.5rem;
	}
</style>
