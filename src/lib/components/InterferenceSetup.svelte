<script lang="ts">
	// Step 1: which elements interfere with which analysis isotopes, and by how
	// much. Known primary interferences are listed automatically (off until
	// ticked); any other interfering element can be added by hand. Concentrations
	// of the interfering element are resolved later, on the Review step.
	import type { IsotopeInfo } from '$lib/types.js';
	import {
		createInterferent,
		interferentErrors,
		settingFor,
		syncInterferenceSettings,
		type InterferenceSetting
	} from '$lib/utils/interferenceCorrection.js';
	import { analysisIsotopeKey } from '$lib/utils/primaryInterferences.js';
	import { lookupElementName, lookupElementSymbol } from '$lib/utils/elementNames.js';

	let {
		isotopes = [] as IsotopeInfo[],
		labels = [] as string[],
		settings = $bindable([] as InterferenceSetting[])
	} = $props();

	$effect(() => {
		const next = syncInterferenceSettings(isotopes, settings);
		if (next !== settings) {
			settings = next;
		}
	});

	let rows = $derived(
		isotopes
			.map((isotope, index) => ({ index, setting: settingFor(settings, isotope) }))
			.filter((row) => (row.setting?.interferents.length ?? 0) > 0)
	);

	let addIsotopeIndex = $state<number | ''>('');
	let addElement = $state('');
	let addError = $state('');

	function addInterferent() {
		addError = '';
		const symbol = lookupElementSymbol(addElement);
		if (addIsotopeIndex === '' || !isotopes[addIsotopeIndex]) {
			addError = 'Pick the isotope it interferes with.';
			return;
		}
		if (!symbol) {
			addError = 'Enter an element name or symbol, e.g. "Al" or "Aluminium".';
			return;
		}
		const isotope = isotopes[addIsotopeIndex];
		const existing = settingFor(settings, isotope);
		if (existing?.interferents.some((i) => i.element === symbol)) {
			addError = `${symbol} is already listed for ${labels[addIsotopeIndex]}.`;
			return;
		}
		if (existing) {
			existing.interferents.push(createInterferent(symbol));
		} else {
			settings.push({
				isotopeKey: analysisIsotopeKey(isotope),
				interferents: [createInterferent(symbol)]
			});
		}
		addElement = '';
	}

	function removeInterferent(setting: InterferenceSetting, index: number) {
		setting.interferents.splice(index, 1);
	}
</script>

<section class="space-y-3 rounded border border-surface-300-700 p-4">
	<h3 class="text-xl font-bold">Interference corrections</h3>
	<p class="text-sm">
		Some elements make the <em>same</em> nuclide you measure through a different reaction — for
		example aluminium makes Mg-27 by Al-27(n,p)Mg-27 — so part of the peak is not the target element
		at all. Tick each interference that applies and enter its <strong>interference factor</strong>:
		the apparent concentration of the target element produced per unit concentration of the
		interfering element, measured for your irradiation position (irradiate the interfering element
		on its own and read off the apparent target concentration). For example, a factor of 0.01 means
		1 % aluminium reads as 0.01 % magnesium.
	</p>

	{#if rows.length === 0}
		<p class="text-sm">
			None of your isotopes has a known primary interference. You can still add one below.
		</p>
	{/if}

	{#each rows as row (row.index)}
		{@const setting = row.setting!}
		<div class="space-y-2 rounded border border-surface-300-700 p-3">
			<p class="font-bold">{labels[row.index]}</p>
			{#each setting.interferents as interferent, j (interferent.element)}
				{@const errors = interferentErrors(interferent)}
				<div class="space-y-1">
					<div class="flex flex-wrap items-center gap-3">
						<label class="flex items-center gap-2">
							<input type="checkbox" class="checkbox" bind:checked={interferent.enabled} />
							<span>
								{lookupElementName(interferent.element) || interferent.element}
								{#if interferent.reaction}
									<span class="text-surface-600-400">— {interferent.reaction}</span>
								{:else}
									<span class="text-surface-600-400">— added by you</span>
								{/if}
							</span>
						</label>
						{#if !interferent.reaction}
							<button
								type="button"
								class="btn preset-tonal-surface btn-sm"
								onclick={() => removeInterferent(setting, j)}
							>
								Remove
							</button>
						{/if}
					</div>
					{#if interferent.enabled}
						<div class="ml-6 flex flex-wrap items-end gap-3">
							<label class="label w-40">
								<span class="text-sm">Interference factor</span>
								<input
									class="input"
									type="number"
									step="any"
									min="0"
									bind:value={interferent.factor}
								/>
							</label>
							<label class="label w-40">
								<span class="text-sm">± uncertainty (1σ)</span>
								<input
									class="input"
									type="number"
									step="any"
									min="0"
									bind:value={interferent.uncertainty}
								/>
							</label>
						</div>
						{#if errors.length > 0}
							<p class="ml-6 text-sm text-error-600-400">To apply this: {errors.join('; ')}.</p>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{/each}

	{#if isotopes.length > 0}
		<div class="flex flex-wrap items-end gap-3">
			<label class="label w-56">
				<span class="text-sm">Add an interfering element for</span>
				<select class="select" bind:value={addIsotopeIndex}>
					<option value="">Choose an isotope…</option>
					{#each labels as label, index (index)}
						<option value={index}>{label}</option>
					{/each}
				</select>
			</label>
			<label class="label w-48">
				<span class="text-sm">Interfering element</span>
				<input class="input" type="text" placeholder="e.g. Al" bind:value={addElement} />
			</label>
			<button type="button" class="btn preset-tonal-surface" onclick={addInterferent}>Add</button>
		</div>
		{#if addError}
			<p class="text-sm text-error-600-400">{addError}</p>
		{/if}
	{/if}
</section>
