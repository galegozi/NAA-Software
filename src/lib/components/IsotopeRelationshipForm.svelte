<script module lang="ts">
	import type { IsotopeInfo } from '$lib/types.js';

	export type RelationshipPick = {
		label: string;
		/** Set when the isotope is already in the catalog; null means "publish it first". */
		catalogId: string | null;
		isotope: IsotopeInfo;
	};
	export type RelationshipSelection = {
		measured: RelationshipPick;
		target: RelationshipPick;
		notes: string;
	};
</script>

<script lang="ts">
	// Records a proxy-measurement relationship: the *measured* isotope (whose
	// gamma lines you detect) is used to quantify the *target* isotope. Each side
	// can be picked from the shared catalog, from an isotope already in the
	// analysis, or entered as a custom isotope. The parent owns publishing.
	import { createIsotopeInfo } from '$lib/utils/naaUtils.js';
	import IsotopeViewer from '$lib/components/IsotopeViewer.svelte';
	import IsotopeInfoForm from '$lib/components/isotopeInfo.svelte';

	type Mode = 'catalog' | 'analysis' | 'custom';

	let { analysisIsotopes = [] as IsotopeInfo[], catalogAvailable = false } = $props();

	let measuredMode = $state<Mode>('analysis');
	let targetMode = $state<Mode>('analysis');
	let measuredAnalysisIdx = $state<number | ''>('');
	let targetAnalysisIdx = $state<number | ''>('');
	let measuredCatalog = $state<IsotopeInfo[]>([]);
	let targetCatalog = $state<IsotopeInfo[]>([]);
	let measuredCustom = $state<IsotopeInfo>(createIsotopeInfo());
	let targetCustom = $state<IsotopeInfo>(createIsotopeInfo());
	let notes = $state('');
	let error = $state('');

	export function reset() {
		measuredMode = 'analysis';
		targetMode = 'analysis';
		measuredAnalysisIdx = '';
		targetAnalysisIdx = '';
		measuredCatalog = [];
		targetCatalog = [];
		measuredCustom = createIsotopeInfo();
		targetCustom = createIsotopeInfo();
		notes = '';
		error = '';
	}

	export function preset(side: 'measured' | 'target', analysisIndex: number) {
		if (side === 'measured') {
			measuredMode = 'analysis';
			measuredAnalysisIdx = analysisIndex;
		} else {
			targetMode = 'analysis';
			targetAnalysisIdx = analysisIndex;
		}
	}

	function pick(
		mode: Mode,
		analysisIdx: number | '',
		catalog: IsotopeInfo[],
		custom: IsotopeInfo
	): RelationshipPick | null {
		if (mode === 'analysis') {
			const iso = analysisIdx === '' ? undefined : analysisIsotopes[analysisIdx];
			if (!iso) return null;
			return {
				label: iso.isotopeName?.trim() || iso.elementName?.trim() || 'isotope',
				catalogId: iso.id?.trim() || null,
				isotope: iso
			};
		}
		if (mode === 'catalog') {
			const iso = catalog[0];
			if (!iso?.id) return null;
			return {
				label: iso.isotopeName?.trim() || iso.elementName?.trim() || 'isotope',
				catalogId: iso.id,
				isotope: iso
			};
		}
		if (!custom.isotopeName?.trim()) return null;
		return { label: custom.isotopeName.trim(), catalogId: null, isotope: custom };
	}

	function customProblem(p: RelationshipPick | null, mode: Mode): string {
		if (!p || mode !== 'custom') return '';
		if (!(p.isotope.energy > 0)) return 'needs an energy value';
		if (!(p.isotope.halfLife > 0)) return 'needs a half-life value';
		return '';
	}

	export function getSelection(): RelationshipSelection | null {
		error = '';
		const m = pick(measuredMode, measuredAnalysisIdx, measuredCatalog, measuredCustom);
		const t = pick(targetMode, targetAnalysisIdx, targetCatalog, targetCustom);
		if (!m) {
			error = 'Choose the measured isotope.';
			return null;
		}
		if (!t) {
			error = 'Choose the target isotope.';
			return null;
		}
		const mp = customProblem(m, measuredMode);
		if (mp) {
			error = `The custom measured isotope ${mp}.`;
			return null;
		}
		const tp = customProblem(t, targetMode);
		if (tp) {
			error = `The custom target isotope ${tp}.`;
			return null;
		}
		if (m.isotope === t.isotope || (m.catalogId !== null && m.catalogId === t.catalogId)) {
			error = 'The measured and target isotope must be different.';
			return null;
		}
		return { measured: m, target: t, notes };
	}

	const namedAnalysisIsotopes = $derived(
		analysisIsotopes
			.map((iso, index) => ({ iso, index }))
			.filter(({ iso }) => Boolean(iso.isotopeName?.trim() || iso.elementName?.trim()))
	);
</script>

<div class="space-y-3">
	<fieldset class="space-y-2 rounded border border-surface-300-700 p-3">
		<legend class="px-1 text-sm font-bold">Measured isotope — the one you detect</legend>
		<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
			<label class="inline-flex items-center gap-1">
				<input type="radio" value="analysis" bind:group={measuredMode} /> One of my analysis isotopes
			</label>
			{#if catalogAvailable}
				<label class="inline-flex items-center gap-1">
					<input type="radio" value="catalog" bind:group={measuredMode} /> From the catalog
				</label>
			{/if}
			<label class="inline-flex items-center gap-1">
				<input type="radio" value="custom" bind:group={measuredMode} /> A custom isotope
			</label>
		</div>
		{#if measuredMode === 'analysis'}
			<select class="select" bind:value={measuredAnalysisIdx}>
				<option value="">— Select an isotope —</option>
				{#each namedAnalysisIsotopes as entry (entry.index)}
					<option value={entry.index}>
						{entry.iso.isotopeName || entry.iso.elementName}
						{entry.iso.id ? '(in catalog)' : '(not yet in catalog)'}
					</option>
				{/each}
			</select>
		{:else if measuredMode === 'catalog' && catalogAvailable}
			<IsotopeViewer
				bind:selectedIsotopes={measuredCatalog}
				singleEntryPerIsotope
				showSelectionList={false}
			/>
			{#if measuredCatalog[0]}
				<p class="text-sm">Selected: <strong>{measuredCatalog[0].isotopeName}</strong></p>
			{/if}
		{:else}
			<IsotopeInfoForm bind:isotopeInfo={measuredCustom} />
		{/if}
	</fieldset>

	<fieldset class="space-y-2 rounded border border-surface-300-700 p-3">
		<legend class="px-1 text-sm font-bold">Target isotope — the one you are quantifying</legend>
		<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
			<label class="inline-flex items-center gap-1">
				<input type="radio" value="analysis" bind:group={targetMode} /> One of my analysis isotopes
			</label>
			{#if catalogAvailable}
				<label class="inline-flex items-center gap-1">
					<input type="radio" value="catalog" bind:group={targetMode} /> From the catalog
				</label>
			{/if}
			<label class="inline-flex items-center gap-1">
				<input type="radio" value="custom" bind:group={targetMode} /> A custom isotope
			</label>
		</div>
		{#if targetMode === 'analysis'}
			<select class="select" bind:value={targetAnalysisIdx}>
				<option value="">— Select an isotope —</option>
				{#each namedAnalysisIsotopes as entry (entry.index)}
					<option value={entry.index}>
						{entry.iso.isotopeName || entry.iso.elementName}
						{entry.iso.id ? '(in catalog)' : '(not yet in catalog)'}
					</option>
				{/each}
			</select>
		{:else if targetMode === 'catalog' && catalogAvailable}
			<IsotopeViewer
				bind:selectedIsotopes={targetCatalog}
				singleEntryPerIsotope
				showSelectionList={false}
			/>
			{#if targetCatalog[0]}
				<p class="text-sm">Selected: <strong>{targetCatalog[0].isotopeName}</strong></p>
			{/if}
		{:else}
			<IsotopeInfoForm bind:isotopeInfo={targetCustom} />
		{/if}
	</fieldset>

	<label class="label">
		<span>Notes (optional)</span>
		<input
			class="input"
			type="text"
			bind:value={notes}
			placeholder="e.g. via neutron capture on U-238"
		/>
	</label>

	{#if error}
		<p class="text-sm text-error-500">{error}</p>
	{/if}
</div>
