<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import type { ReferenceMaterialCatalogItem } from '$lib/types.js';
	import { getReferenceMaterialCatalogAccessMessage } from '$lib/utils/authEnvironment.js';

	let {
		onSelectItem = (_item: ReferenceMaterialCatalogItem) => {}
	} = $props();

	let isLoading = $state(false);
	let errorMessage = $state('');
	let searchTerm = $state('');
	let lastFetchedSearch = '';
	let lastFetchSequence = 0;
	let cachedItems: ReferenceMaterialCatalogItem[] = $state([]);

	function normalizeItems(payload: unknown): ReferenceMaterialCatalogItem[] {
		if (Array.isArray(payload)) {
			return payload as ReferenceMaterialCatalogItem[];
		}

		if (
			typeof payload === 'object' &&
			payload !== null &&
			'items' in payload &&
			Array.isArray((payload as { items: unknown[] }).items)
		) {
			return (payload as { items: ReferenceMaterialCatalogItem[] }).items;
		}

		return [];
	}

	function getSearchText(item: ReferenceMaterialCatalogItem): string {
		const material = item.latestCounting?.referenceMaterial;
		return [
			item.referenceKey,
			material?.NETL_code,
			material?.sampleName,
			item.notes
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();
	}

	function matchesSearch(item: ReferenceMaterialCatalogItem, query: string): boolean {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return true;
		}

		return getSearchText(item).includes(normalizedQuery);
	}

	function getFetchSearch(query: string): string {
		return query.trim();
	}

	async function loadItems(search: string) {
		const apiUrl = env.PUBLIC_REFERENCE_MATERIAL_API_URL?.trim() || '/api/reference-materials';
		const requestUrl = new URL(apiUrl, window.location.origin);
		const trimmedSearch = search.trim();
		requestUrl.searchParams.set('limit', trimmedSearch ? '25' : '100');
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
				throw new Error(getReferenceMaterialCatalogAccessMessage(hostname));
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
					: 'Unable to load reference material catalog from the configured API.';
		} finally {
			if (fetchSequence === lastFetchSequence) {
				isLoading = false;
			}
		}
	}

	let filteredItems = $derived(cachedItems.filter((item) => matchesSearch(item, searchTerm)));
	let sortedItems = $derived(
		[...filteredItems].sort((a, b) => {
			const materialA = a.latestCounting?.referenceMaterial;
			const materialB = b.latestCounting?.referenceMaterial;
			const keyA = `${materialA?.NETL_code ?? ''} ${materialA?.sampleName ?? ''}`.trim();
			const keyB = `${materialB?.NETL_code ?? ''} ${materialB?.sampleName ?? ''}`.trim();

			if (keyA !== keyB) {
				return keyA.localeCompare(keyB);
			}

			return a.referenceKey.localeCompare(b.referenceKey);
		})
	);
	let visibleItems = $derived(sortedItems.slice(0, 25));

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
</script>

<div class="space-y-4">
	<div class="rounded border border-gray-300 p-4">
		<div class="space-y-3">
			<h3 class="text-xl font-bold">Browse reference material catalog</h3>
			<label class="label">
				<span>Search reference materials</span>
				<input
					class="input w-full"
					type="search"
					placeholder="Search by NETL code, sample name, or reference key"
					bind:value={searchTerm}
				/>
			</label>

			<div class="max-h-80 space-y-2 overflow-y-auto rounded border border-gray-300 p-2">
				{#if isLoading && cachedItems.length === 0}
					<p class="p-2">Loading reference material catalog...</p>
				{:else if errorMessage && cachedItems.length === 0}
					<p class="p-2">Unable to load reference material catalog: {errorMessage}</p>
				{:else if visibleItems.length > 0}
					{#each visibleItems as item (item.id)}
						{@const material = item.latestCounting?.referenceMaterial}
						<div class="rounded border border-gray-200 p-3 transition hover:border-gray-400">
							<div class="flex items-start justify-between gap-4">
								<div class="space-y-1">
									<div class="font-bold">
										{material?.NETL_code || 'Unknown code'} ({material?.sampleName || 'Unknown sample'})
									</div>
									<div class="text-sm">Reference key: {item.referenceKey}</div>
									<div class="text-sm">Countings saved: {item.countingCount}</div>
									<div class="text-sm">Isotopes saved: {item.isotopes.length}</div>
								</div>
								<button
									class="rounded border border-gray-300 px-3 py-2 text-sm font-bold transition hover:border-gray-400"
									type="button"
									onclick={() => onSelectItem(item)}
								>
									Load
								</button>
							</div>
						</div>
					{/each}
				{:else if searchTerm.trim()}
					<p class="p-2">No reference materials match your search.</p>
				{:else}
					<p class="p-2">No reference materials are available yet.</p>
				{/if}
			</div>

			{#if sortedItems.length > visibleItems.length}
				<p>Showing the first {visibleItems.length} matches. Keep typing to narrow the list.</p>
			{/if}
		</div>
	</div>
</div>
