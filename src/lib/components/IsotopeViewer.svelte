<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import type { IsotopeCatalogItem, IsotopeInfo } from '$lib/types.js';
	import { getIsotopeCatalogAccessMessage } from '$lib/utils/authEnvironment.js';

	let {
		selectedIsotopes = $bindable<IsotopeInfo[]>([])
	} = $props();

	let isLoading = $state(false);
	let errorMessage = $state('');
	let searchTerm = $state('');
	let lastFetchedSearch = '';
	let lastFetchSequence = 0;
	let cachedItems: IsotopeCatalogItem[] = $state([]);

	type EnergyResultRow = {
		id: string;
		item: IsotopeCatalogItem;
		energy: number;
	};

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
			elementName: item.elementName,
			isotopeName: getIsotopeName(item),
			energy,
			halfLife: item.halfLife.number || item.halfLifeSeconds,
			linkedReference: 0,
			unit: item.halfLife.unit
		};
	}

	async function loadItems(search: string) {
		const apiUrl = env.PUBLIC_ISOTOPE_API_URL?.trim() || '/api/isotopes';
		const requestUrl = new URL(apiUrl, window.location.origin);
		const trimmedSearch = search.trim();
		requestUrl.searchParams.set('limit', trimmedSearch ? '25' : '100');
		if (search.trim()) {
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

			const nextItems = normalizeItems(await response.json());
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
			if (item.energies.length === 0) {
				rows.push({
					id: `${item.id}-no-energy`,
					item,
					energy: 0
				});
				continue;
			}

			for (const energy of item.energies) {
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
		energyRows.filter((row) => matchesSearch(row.item, row.energy, searchTerm))
	);
	let visibleRows = $derived(filteredRows.slice(0, 25));

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

	function addSelectedIsotope(item: IsotopeCatalogItem, energy: number) {
		selectedIsotopes = [...selectedIsotopes, toIsotopeInfo(item, energy)];
		searchTerm = '';
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

			<div class="max-h-80 space-y-2 overflow-y-auto rounded border border-gray-300 p-2">
				{#if isLoading && cachedItems.length === 0}
					<p class="p-2">Loading isotope catalog...</p>
				{:else if errorMessage && cachedItems.length === 0}
					<p class="p-2">Unable to load isotope catalog: {errorMessage}</p>
				{:else if visibleRows.length > 0}
					{#each visibleRows as row (row.id)}
						<div class="rounded border border-gray-200 p-3 transition hover:border-gray-400">
							<div class="flex items-start justify-between gap-4">
								<div class="space-y-1">
									<div class="font-bold">{row.item.elementName} ({getIsotopeName(row.item)})</div>
									<div class="text-sm">Energy: {row.energy} keV</div>
									<div class="text-sm">Half-life: {row.item.halfLife.number || row.item.halfLifeSeconds} {row.item.halfLife.unit}</div>
								</div>
								<button
									class="rounded border border-gray-300 px-3 py-2 text-sm font-bold transition hover:border-gray-400"
									type="button"
									onclick={() => addSelectedIsotope(row.item, row.energy)}
								>
									Add
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

			{#if filteredRows.length > visibleRows.length}
				<p>Showing the first {visibleRows.length} matches. Keep typing to narrow the list.</p>
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
			{/if}
		</div>
</div>
