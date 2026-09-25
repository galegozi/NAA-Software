<script lang="ts">
	// Review step: asks for any interfering-element concentration the analysis
	// can't supply, and shows how each interference-corrected result was built.
	import type { ConcUnitType, IsotopeInfo } from '$lib/types.js';
	import {
		settingFor,
		type InterferenceResult,
		type InterferenceSetting
	} from '$lib/utils/interferenceCorrection.js';
	import { roundResult } from '$lib/utils/naaUtils.js';

	let {
		results,
		isotopes = [] as IsotopeInfo[],
		labels = [] as string[],
		unknownLabels = [] as string[],
		settings = $bindable([] as InterferenceSetting[])
	}: {
		results: Map<string, InterferenceResult>;
		isotopes: IsotopeInfo[];
		labels: string[];
		unknownLabels: string[];
		settings: InterferenceSetting[];
	} = $props();

	let list = $derived([...results.values()]);

	type InputGroup = {
		key: string;
		isotopeIndex: number;
		settingIndex: number;
		element: string;
		needsStandard: boolean;
		unknowns: number[];
	};

	/** One input block per (target isotope, interfering element) that is missing a value. */
	let inputGroups = $derived.by(() => {
		const groups: Record<string, InputGroup> = {};
		for (const result of list) {
			for (const interferent of result.interferents) {
				const standardManual = interferent.standardSource === 'manual';
				const unknownManual = interferent.unknownSource === 'manual';
				if (!standardManual && !unknownManual) continue;
				const key = `${result.isotopeIndex}:${interferent.settingIndex}`;
				const group = groups[key] ?? {
					key,
					isotopeIndex: result.isotopeIndex,
					settingIndex: interferent.settingIndex,
					element: interferent.element,
					needsStandard: false,
					unknowns: []
				};
				group.needsStandard ||= standardManual;
				if (unknownManual) group.unknowns.push(result.unknownIndex);
				groups[key] = group;
			}
		}
		return Object.values(groups);
	});

	function interferentFor(group: InputGroup) {
		return settingFor(settings, isotopes[group.isotopeIndex])?.interferents[group.settingIndex];
	}

	function parse(value: string): number | null {
		const n = Number.parseFloat(value);
		return value.trim() === '' || !Number.isFinite(n) ? null : n;
	}

	function setUnknown(group: InputGroup, unknownIndex: number, value: string) {
		const interferent = interferentFor(group);
		if (!interferent) return;
		const next = [...interferent.manualInUnknown];
		while (next.length <= unknownIndex) next.push(null);
		next[unknownIndex] = parse(value);
		interferent.manualInUnknown = next;
	}

	function unitLabel(unit: ConcUnitType): string {
		return unit === 'ppm' ? 'µg/g' : unit === 'percentage' ? '%' : (unit ?? '');
	}

	function show(value: number | null): string {
		return value === null ? '—' : String(roundResult(value));
	}
</script>

{#if list.length > 0}
	<section class="space-y-3">
		<h3 class="text-xl font-bold">Interference corrections</h3>

		{#if inputGroups.length > 0}
			<div class="space-y-3 rounded border border-warning-500 preset-tonal-warning p-3">
				<p class="text-sm">
					These interfering elements aren't among your analysed isotopes (or the reference doesn't
					give a value), so enter their concentrations to apply the correction.
				</p>
				{#each inputGroups as group (group.key)}
					{@const interferent = interferentFor(group)}
					{#if interferent}
						<div class="space-y-2">
							<p class="font-bold">
								{group.element} (interferes with {labels[group.isotopeIndex]})
							</p>
							<div class="flex flex-wrap items-end gap-3">
								<label class="label w-32">
									<span class="text-sm">Unit</span>
									<select class="select" bind:value={interferent.unit}>
										<option value="ppm">µg/g</option>
										<option value="percentage">%</option>
									</select>
								</label>
								{#if group.needsStandard}
									<label class="label w-44">
										<span class="text-sm">In the standard</span>
										<input
											class="input"
											type="number"
											step="any"
											min="0"
											bind:value={interferent.manualInStandard}
										/>
									</label>
								{/if}
								{#each group.unknowns as u (u)}
									<label class="label w-44">
										<span class="text-sm">In {unknownLabels[u]}</span>
										<input
											class="input"
											type="number"
											step="any"
											min="0"
											value={interferent.manualInUnknown[u] ?? ''}
											oninput={(e) => setUnknown(group, u, e.currentTarget.value)}
										/>
									</label>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}

		<p class="text-sm">
			Corrected result = k·(C<sub>S</sub> + Σ f·C<sub>i,S</sub>) − Σ f·C<sub>i,U</sub>, where k is
			the combined correction factor, C<sub>S</sub> the target in the standard, f the interference
			factor and C<sub>i</sub> the interfering element in the standard (S) and unknown (U). Values are
			in the target's unit.
		</p>
		<div class="overflow-x-auto">
			<table class="table-auto border-collapse border border-surface-300-700 text-sm">
				<thead>
					<tr>
						{#each ['Isotope', 'Unknown', 'Interferent', 'f', 'In standard', 'In unknown', 'k', 'Uncorrected', 'Corrected', 'From interference'] as heading (heading)}
							<th class="border border-surface-300-700 px-3 py-2">{heading}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each list as result (`${result.isotopeIndex}:${result.unknownIndex}`)}
						{#each result.interferents as interferent, j (interferent.element)}
							<tr>
								{#if j === 0}
									<td
										class="border border-surface-300-700 px-3 py-2"
										rowspan={result.interferents.length}
									>
										{labels[result.isotopeIndex]} ({unitLabel(result.unit)})
									</td>
									<td
										class="border border-surface-300-700 px-3 py-2"
										rowspan={result.interferents.length}
									>
										{unknownLabels[result.unknownIndex]}
									</td>
								{/if}
								<td class="border border-surface-300-700 px-3 py-2">
									{interferent.element}{interferent.reaction ? ` — ${interferent.reaction}` : ''}
								</td>
								<td class="border border-surface-300-700 px-3 py-2">
									{interferent.factor}{interferent.factorUncertainty
										? ` ± ${interferent.factorUncertainty}`
										: ''}
								</td>
								<td class="border border-surface-300-700 px-3 py-2">
									{show(interferent.inStandard)}{interferent.inStandard !== null &&
									interferent.standardSource === 'manual'
										? ' (entered)'
										: ''}
								</td>
								<td class="border border-surface-300-700 px-3 py-2">
									{show(interferent.inUnknown)}{interferent.inUnknown !== null &&
									interferent.unknownSource === 'manual'
										? ' (entered)'
										: ''}
								</td>
								{#if j === 0}
									{@const span = result.interferents.length}
									<td class="border border-surface-300-700 px-3 py-2" rowspan={span}>
										{Number.isFinite(result.k) ? result.k.toPrecision(4) : '—'}
									</td>
									<td class="border border-surface-300-700 px-3 py-2" rowspan={span}>
										{roundResult(result.uncorrected)} ± {roundResult(result.uncorrectedUncertainty)}
									</td>
									<td class="border border-surface-300-700 px-3 py-2" rowspan={span}>
										{#if result.corrected === null}
											Needs {result.missing.join(', ')}
										{:else}
											{roundResult(result.corrected)} ± {roundResult(
												result.correctedUncertainty ?? 0
											)}
											{#if result.overCorrected}
												<span class="text-error-600-400"> ⚠ at or below zero</span>
											{/if}
										{/if}
									</td>
									<td class="border border-surface-300-700 px-3 py-2" rowspan={span}>
										{result.interferenceFraction === null ||
										!Number.isFinite(result.interferenceFraction)
											? '—'
											: `${roundResult(result.interferenceFraction * 100)} %`}
									</td>
								{/if}
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
		{#if list.some((r) => r.interferenceFraction !== null && r.interferenceFraction > 0.5)}
			<p class="text-sm text-warning-600-400">
				⚠ Where more than half the signal comes from interference, the corrected value is very
				sensitive to the factor — check it before relying on the result.
			</p>
		{/if}
	</section>
{/if}
