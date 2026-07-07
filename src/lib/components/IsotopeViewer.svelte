<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import type { IsotopeCatalogItem, IsotopeInfo } from '$lib/types.js';
	import { getIsotopeCatalogAccessMessage } from '$lib/utils/authEnvironment.js';

	let {
		selectedIsotopes = $bindable<IsotopeInfo[]>([]),
		singleEntryPerIsotope = false,
		allowedElementNames = [] as string[]
	} = $props();

	let isLoading = $state(false);
	let errorMessage = $state('');
	let searchTerm = $state('');
	let lastFetchedSearch = '';
	let lastFetchSequence = 0;
	let cachedItems: IsotopeCatalogItem[] = $state([]);

	const CATALOG_BATCH_SIZE = 24;
	let visibleCount = $state(CATALOG_BATCH_SIZE);
	let hasMoreServerItems = $state(false);
	let serverOffset = 0;
	let catalogPane: HTMLDivElement | null = null;
	let lastBatchResetSearch = '';

	type EnergyResultRow = {
		id: string;
		item: IsotopeCatalogItem;
		energy: number;
	};

	function normalizeEnergy(value: unknown): number | null {
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed < 0) {
			return null;
		}

		return parsed;
	}

	function getDistinctEnergies(item: IsotopeCatalogItem): number[] {
		const energies = Array.isArray(item.energies) ? item.energies : [];
		const distinct: number[] = [];

		for (const rawEnergy of energies) {
			const energy = normalizeEnergy(rawEnergy);
			if (energy === null || distinct.includes(energy)) {
				continue;
			}

			distinct.push(energy);
		}

		return distinct;
	}

	function getSelectionKey(item: IsotopeCatalogItem, energy: number): string {
		const halfLife = item.halfLife.number || item.halfLifeSeconds;
		return `${item.id}|${item.elementName}|${getIsotopeName(item)}|${energy}|${halfLife}|${item.halfLife.unit}`;
	}

	function getIsotopeIdSelectionKey(item: IsotopeCatalogItem): string {
		return `${item.id}`;
	}

	function getIsotopeSelectionKey(isotope: IsotopeInfo): string {
		return `${isotope.id ?? ''}|${isotope.elementName}|${isotope.isotopeName}|${isotope.energy}|${isotope.halfLife}|${isotope.unit}`;
	}

	function getSelectedIsotopeIdKey(isotope: IsotopeInfo): string {
		return `${isotope.id ?? ''}`;
	}

	function normalizeItems(payload: unknown): IsotopeCatalogItem[] {
		if (Array.isArray(payload)) {
			return payload as IsotopeCatalogItem[];
		}

		if (
			typeof payload === 'object' &&
			payload !== null &&
			'items' in payload &&
			Array.isArray((payload as { items: unknown[] }).items)
		) {
			return (payload as { items: IsotopeCatalogItem[] }).items;
		}

		return [];
	}

	function readHasMore(payload: unknown, fallback: boolean): boolean {
		if (
			typeof payload === 'object' &&
			payload !== null &&
			'hasMore' in payload &&
			typeof (payload as { hasMore: unknown }).hasMore === 'boolean'
		) {
			return (payload as { hasMore: boolean }).hasMore;
		}

		return fallback;
	}

	function getIsotopeName(item: IsotopeCatalogItem): string {
		return `${item.shortName}-${item.massNumber}${item.suffix}`;
	}

	function matchesSearch(item: IsotopeCatalogItem, energy: number, query: string): boolean {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return true;
		}

		const searchHaystack = [
			item.elementName,
			item.shortName,
			String(item.massNumber),
			getIsotopeName(item),
			String(energy),
			`${energy} kev`
		]
			.join(' ')
			.toLowerCase();

		return searchHaystack.includes(normalizedQuery);
	}

	function isEnergySearch(query: string): boolean {
		return /^\d+(\.\d+)?(?:\s*kev)?$/i.test(query.trim());
	}

	function getFetchSearch(query: string): string {
		const trimmedQuery = query.trim();
		if (!trimmedQuery || isEnergySearch(trimmedQuery)) {
			return '';
		}

		return trimmedQuery;
	}

	function toIsotopeInfo(item: IsotopeCatalogItem, energy: number): IsotopeInfo {
		return {
			id: item.id,
			elementName: item.elementName,
			isotopeName: getIsotopeName(item),
			energy,
			halfLife: item.halfLife.number || item.halfLifeSeconds,
			linkedReference: 0,
			unit: item.halfLife.unit
		};
	}

	function isExactIsotopeSelected(item: IsotopeCatalogItem, energy: number): boolean {
		if (singleEntryPerIsotope) {
			return selectedIsotopeIdKeys.has(getIsotopeIdSelectionKey(item));
		}
		return selectedIsotopeKeys.has(getSelectionKey(item, energy));
	}

	async function loadItems(search: string, offset = 0) {
		const apiUrl = env.PUBLIC_ISOTOPE_API_URL?.trim() || '/api/isotopes';
		const requestUrl = new URL(apiUrl, window.location.origin);
		const trimmedSearch = search.trim();
		const batchLimit = trimmedSearch ? 25 : 100;
		requestUrl.searchParams.set('limit', String(batchLimit));
		if (offset > 0) {
			requestUrl.searchParams.set('offset', String(offset));
		}
		if (trimmedSearch) {
			requestUrl.searchParams.set('q', trimmedSearch);
		}

		const fetchSequence = ++lastFetchSequence;
		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch(requestUrl, {
				headers: {
					accept: 'application/json'
				}
			});

			if (response.status === 401 || response.status === 403) {
				const hostname = browser ? window.location.hostname : '';
				throw new Error(getIsotopeCatalogAccessMessage(hostname));
			}

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}

			const payload: unknown = await response.json();
			const nextItems = normalizeItems(payload);
			if (fetchSequence !== lastFetchSequence) {
				return;
			}

			cachedItems = [
				...cachedItems.filter(
					(cachedItem) => !nextItems.some((item) => item.id === cachedItem.id)
				),
				...nextItems
			];
			lastFetchedSearch = trimmedSearch;
			serverOffset = offset + nextItems.length;
			hasMoreServerItems = readHasMore(payload, nextItems.length === batchLimit);
		} catch (error) {
			if (fetchSequence !== lastFetchSequence) {
				return;
			}

			errorMessage =
				error instanceof Error
					? error.message
					: 'Unable to load isotope catalog from the configured API.';
		} finally {
			if (fetchSequence === lastFetchSequence) {
				isLoading = false;
			}
		}
	}

	let energyRows = $derived.by(() => {
		const rows: EnergyResultRow[] = [];

		for (const item of cachedItems) {
			const distinctEnergies = getDistinctEnergies(item);

			if (singleEntryPerIsotope) {
				rows.push({
					id: `${item.id}-single`,
					item,
					energy: distinctEnergies.length > 0 ? distinctEnergies[0] : 0
				});
				continue;
			}

			if (distinctEnergies.length === 0) {
				rows.push({
					id: `${item.id}-no-energy`,
					item,
					energy: 0
				});
				continue;
			}

			for (const energy of distinctEnergies) {
				rows.push({
					id: `${item.id}-${energy}`,
					item,
					energy
				});
			}
		}

		return rows;
	});

	let filteredRows = $derived(
		energyRows.filter((row) => {
			if (!matchesSearch(row.item, row.energy, searchTerm)) return false;
			if (allowedElementNames.length > 0) {
				return allowedElementNames.includes(row.item.elementName);
			}
			return true;
		})
	);
	let sortedRows = $derived(
		[...filteredRows].sort((a, b) => {
			const isotopeNameA = getIsotopeName(a.item);
			const isotopeNameB = getIsotopeName(b.item);
			if (isotopeNameA !== isotopeNameB) {
				return isotopeNameA.localeCompare(isotopeNameB);
			}
			return a.energy - b.energy;
		})
	);
	let visibleRows = $derived(sortedRows.slice(0, visibleCount));
	let selectedIsotopeKeys = $derived(new Set(selectedIsotopes.map(getIsotopeSelectionKey)));
	let selectedIsotopeIdKeys = $derived(new Set(selectedIsotopes.map(getSelectedIsotopeIdKey)));

	$effect(() => {
		const nextSearch = searchTerm.trim();
		const nextFetchSearch = getFetchSearch(nextSearch);
		if (nextFetchSearch === lastFetchedSearch && cachedItems.length > 0) {
			return;
		}

		const shouldFetchImmediately =
			cachedItems.length === 0 ||
			nextFetchSearch.length === 0 ||
			Math.abs(nextFetchSearch.length - lastFetchedSearch.length) >= 3 ||
			nextFetchSearch.length < lastFetchedSearch.length;

		if (shouldFetchImmediately) {
			void loadItems(nextFetchSearch);
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void loadItems(nextFetchSearch);
		}, 100);

		return () => {
			window.clearTimeout(timeoutId);
		};
	});

	$effect(() => {
		if (searchTerm !== lastBatchResetSearch) {
			lastBatchResetSearch = searchTerm;
			visibleCount = CATALOG_BATCH_SIZE;
			if (catalogPane) {
				catalogPane.scrollTop = 0;
			}
		}
	});

	function showNextBatch() {
		if (visibleCount < sortedRows.length) {
			visibleCount += CATALOG_BATCH_SIZE;
			return;
		}

		if (hasMoreServerItems && !isLoading) {
			visibleCount += CATALOG_BATCH_SIZE;
			void loadItems(lastFetchedSearch, serverOffset);
		}
	}

	function handleCatalogScroll() {
		if (!catalogPane) {
			return;
		}

		const distanceFromBottom =
			catalogPane.scrollHeight - catalogPane.scrollTop - catalogPane.clientHeight;
		if (distanceFromBottom <= 48) {
			showNextBatch();
		}
	}

	// If the pane cannot scroll yet (short or heavily filtered list) the scroll
	// event never fires, so keep loading batches until it can or nothing is left.
	$effect(() => {
		void sortedRows.length;
		void visibleCount;
		void hasMoreServerItems;
		if (isLoading) {
			return;
		}

		handleCatalogScroll();
	});

	function addSelectedIsotope(item: IsotopeCatalogItem, energy: number) {
		if (isExactIsotopeSelected(item, energy)) {
			return;
		}

		selectedIsotopes = [...selectedIsotopes, toIsotopeInfo(item, energy)];
	}

	function removeSelectedIsotope(index: number) {
		selectedIsotopes = selectedIsotopes.filter((_, isotopeIndex) => isotopeIndex !== index);
	}

</script>

<div class="space-y-4">
	<div class="rounded border border-gray-300 p-4">
		<div class="space-y-3">
			<h3 class="text-xl font-bold">Browse isotope catalog</h3>
			<label class="label">
				<span>Search isotope catalog</span>
				<input
					class="input w-full"
					type="search"
					placeholder="Search by element, isotope, mass number, suffix, or energy"
					bind:value={searchTerm}
				/>
			</label>

			<div
				bind:this={catalogPane}
				onscroll={handleCatalogScroll}
				class="isotope-grid max-h-80 overflow-y-auto rounded border border-gray-300 p-2"
			>
				{#if isLoading && cachedItems.length === 0}
					<p class="p-2">Loading isotope catalog...</p>
				{:else if errorMessage && cachedItems.length === 0}
					<p class="p-2">Unable to load isotope catalog: {errorMessage}</p>
				{:else if visibleRows.length > 0}
					{#each visibleRows as row (row.id)}
					{@const isAlreadySelected = selectedIsotopeKeys.has(getSelectionKey(row.item, row.energy))}
					<div class="rounded border border-gray-200 p-3 transition hover:border-gray-400">
						<div class="flex items-start justify-between gap-4">
							<div class="space-y-1">
								<div class="font-bold">{row.item.elementName} ({getIsotopeName(row.item)})</div>
								<div class="text-sm">Energy: {row.energy} keV</div>
								<div class="text-sm">Half-life: {row.item.halfLife.number || row.item.halfLifeSeconds} {row.item.halfLife.unit}</div>
							</div>
							<button
								class="rounded border border-gray-300 px-3 py-2 text-sm font-bold transition hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
								type="button"
								onclick={() => addSelectedIsotope(row.item, row.energy)}
								disabled={isAlreadySelected}
							>
								{isAlreadySelected ? 'Added' : 'Add'}
								</button>
							</div>
						</div>
					{/each}
				{:else if searchTerm.trim()}
					<p class="p-2">No isotope matches your search.</p>
				{:else}
					<p class="p-2">No isotopes are available yet.</p>
				{/if}
			</div>

			{#if sortedRows.length > visibleRows.length || hasMoreServerItems}
				<p>Showing {visibleRows.length} matches. Scroll the list to load more.</p>
			{/if}

			{#if isLoading && cachedItems.length > 0}
				<p>Refreshing isotope catalog...</p>
			{/if}

			{#if errorMessage && cachedItems.length > 0}
				<p>Unable to refresh isotope catalog: {errorMessage}</p>
			{/if}
		</div>
	</div>

		<div class="space-y-3">
			<h3 class="text-xl font-bold">Selected isotopes</h3>
			{#if selectedIsotopes.length === 0}
				<p>Select one or more isotopes to continue.</p>
			{:else}
				<div class="isotope-grid">
					{#each selectedIsotopes as isotope, index (`${isotope.isotopeName}-${index}`)}
						<div class="rounded border border-gray-300 p-4">
							<div class="flex items-start justify-between gap-4">
								<div>
									<div class="font-bold">{isotope.elementName} ({isotope.isotopeName})</div>
									<div>Energy: {isotope.energy} keV</div>
									<div>Half-life: {isotope.halfLife} {isotope.unit}</div>
								</div>
								<button type="button" onclick={() => removeSelectedIsotope(index)}>Remove</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
</div>

<style>
	.isotope-grid {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 768px) {
		.isotope-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 1280px) {
		.isotope-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
