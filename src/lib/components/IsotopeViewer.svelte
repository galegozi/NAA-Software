<script lang="ts">
	import { env } from '$env/dynamic/public';
	import type { IsotopeCatalogItem, IsotopeInfo } from '$lib/types.js';

	let {
		selectedIsotopes = $bindable<IsotopeInfo[]>([])
	} = $props();

	let items: IsotopeCatalogItem[] = $state([]);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let searchTerm = $state('');
	let selectedCatalogId = $state('');
	let isDropdownExpanded = $state(false);
	let activeSearch = $state('');
	let lastFetchedSearch = '';
	let lastFetchSequence = 0;
	let cachedItems: IsotopeCatalogItem[] = $state([]);

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

	function matchesSearch(item: IsotopeCatalogItem, query: string): boolean {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return true;
		}

		const searchHaystack = [
			item.elementName,
			item.shortName,
			String(item.massNumber),
			getIsotopeName(item),
			...item.energies.map(String)
		]
			.join(' ')
			.toLowerCase();

		return searchHaystack.includes(normalizedQuery);
	}

	function toIsotopeInfo(item: IsotopeCatalogItem): IsotopeInfo {
		return {
			elementName: item.elementName,
			isotopeName: getIsotopeName(item),
			energy: item.energies[0] ?? 0,
			halfLife: item.halfLife.number || item.halfLifeSeconds,
			linkedReference: 0,
			unit: item.halfLife.unit
		};
	}

	function getCatalogItem(isotope: IsotopeInfo): IsotopeCatalogItem | undefined {
		return cachedItems.find(
			(item) =>
				item.elementName === isotope.elementName &&
				getIsotopeName(item) === isotope.isotopeName
		);
	}

	async function loadItems(search: string) {
		const apiUrl = env.PUBLIC_ISOTOPE_API_URL?.trim() || '/api/isotopes';
		const requestUrl = new URL(apiUrl, window.location.origin);
		requestUrl.searchParams.set('limit', '25');
		if (search.trim()) {
			requestUrl.searchParams.set('q', search.trim());
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
				throw new Error(
					'Sign in with an account that has been assigned the Static Web Apps role required to view isotope data.'
				);
			}

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}

			const nextItems = normalizeItems(await response.json());
			if (fetchSequence !== lastFetchSequence) {
				return;
			}

			items = nextItems;
			cachedItems = [...cachedItems.filter((cachedItem) => !nextItems.some((item) => item.id === cachedItem.id)), ...nextItems];
			activeSearch = search;
			lastFetchedSearch = search;
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

	let filteredItems = $derived(items.filter((item) => matchesSearch(item, activeSearch)));
	let selectedCatalogItem = $derived(
		filteredItems.find((item) => item.id === selectedCatalogId) ?? filteredItems[0]
	);
	let selectedCatalogIsAlreadyAdded = $derived(
		selectedCatalogItem
			? selectedIsotopes.some((isotope) => isotope.isotopeName === getIsotopeName(selectedCatalogItem))
			: false
	);

	$effect(() => {
		if (!filteredItems.length) {
			selectedCatalogId = '';
			return;
		}

		const hasSelectedItem = filteredItems.some((item) => item.id === selectedCatalogId);
		if (!hasSelectedItem) {
			selectedCatalogId = filteredItems[0].id;
		}
	});

	$effect(() => {
		if (!isDropdownExpanded) {
			return;
		}

		const nextSearch = searchTerm.trim();
		if (nextSearch === lastFetchedSearch && items.length > 0) {
			activeSearch = nextSearch;
			return;
		}

		const shouldFetchImmediately =
			items.length === 0 ||
			Math.abs(nextSearch.length - lastFetchedSearch.length) >= 3 ||
			nextSearch.length < lastFetchedSearch.length;

		if (shouldFetchImmediately) {
			void loadItems(nextSearch);
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void loadItems(nextSearch);
		}, 100);

		return () => {
			window.clearTimeout(timeoutId);
		};
	});

	function addSelectedIsotope() {
		if (!selectedCatalogItem || selectedCatalogIsAlreadyAdded) {
			return;
		}

		selectedIsotopes = [...selectedIsotopes, toIsotopeInfo(selectedCatalogItem)];
		searchTerm = '';
	}

	function removeSelectedIsotope(index: number) {
		selectedIsotopes = selectedIsotopes.filter((_, isotopeIndex) => isotopeIndex !== index);
	}

	function updateSelectedEnergy(index: number, energyValue: string) {
		const parsedEnergy = Number(energyValue);
		selectedIsotopes = selectedIsotopes.map((isotope, isotopeIndex) =>
			isotopeIndex === index
				? {
					...isotope,
					energy: Number.isFinite(parsedEnergy) ? parsedEnergy : isotope.energy
				}
				: isotope
		);
	}
</script>

<div class="space-y-4">
	<details bind:open={isDropdownExpanded} class="rounded border border-gray-300 p-4">
		<summary class="cursor-pointer font-bold">Browse isotope catalog</summary>

		<div class="mt-4 space-y-2">
			<label class="label">
				<span>Search isotope catalog</span>
				<input
					class="input w-full"
					type="search"
					placeholder="Search by element, isotope, mass number, or suffix"
					bind:value={searchTerm}
				/>
			</label>

			{#if isLoading}
				<p>Loading isotope catalog...</p>
			{:else if errorMessage}
				<p>Unable to load isotope catalog: {errorMessage}</p>
			{:else if items.length > 0}
				<label class="label">
					<span>Available isotopes</span>
					<select class="select input w-full bg-surface-50-950 text-surface-950-50" bind:value={selectedCatalogId}>
						{#each filteredItems as item (item.id)}
							<option value={item.id}>
								{item.elementName} ({getIsotopeName(item)}) - {item.energies.length} energ{item.energies.length === 1 ? 'y' : 'ies'}
							</option>
						{/each}
					</select>
				</label>

				<button
					type="button"
					onclick={addSelectedIsotope}
					disabled={!selectedCatalogItem || selectedCatalogIsAlreadyAdded}
				>
					{selectedCatalogIsAlreadyAdded ? 'Already Added' : 'Add Isotope'}
				</button>
			{:else if searchTerm.trim() || activeSearch}
				<p>No isotope matches your search.</p>
			{:else}
				<p>Start typing to search the database-backed isotope catalog.</p>
			{/if}
		</div>
	</details>

		<div class="space-y-3">
			<h3 class="text-xl font-bold">Selected isotopes</h3>
			{#if selectedIsotopes.length === 0}
				<p>Select one or more isotopes to continue.</p>
			{:else}
				{#each selectedIsotopes as isotope, index (`${isotope.isotopeName}-${index}`)}
					{@const catalogItem = getCatalogItem(isotope)}
					<div class="rounded border border-gray-300 p-4">
						<div class="flex items-start justify-between gap-4">
							<div>
								<div class="font-bold">{isotope.elementName} ({isotope.isotopeName})</div>
								<div>Half-life: {isotope.halfLife} {isotope.unit}</div>
							</div>
							<button type="button" onclick={() => removeSelectedIsotope(index)}>Remove</button>
						</div>

						{#if catalogItem && catalogItem.energies.length > 0}
							<label class="label mt-3 block">
								<span>Energy</span>
								<select
									class="select input w-full bg-surface-50-950 text-surface-950-50"
									value={String(isotope.energy)}
									onchange={(event) =>
										updateSelectedEnergy(index, (event.currentTarget as HTMLSelectElement).value)}
								>
									{#each catalogItem.energies as energy (`${catalogItem.id}-${energy}`)}
										<option value={energy}>{energy} keV</option>
									{/each}
								</select>
							</label>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
</div>
