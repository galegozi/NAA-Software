<script lang="ts">
	import { browser } from '$app/environment';
	import { env } from '$env/dynamic/public';
	import type { ReferenceMaterialCatalogItem, ReferenceMaterial } from '$lib/types.js';
	import { getReferenceMaterialCatalogAccessMessage } from '$lib/utils/authEnvironment.js';

	let {
		isotopeIds = [] as string[],
		selectedItemIds = [] as string[],
		currentSelectionId = null as string | null,
		onSelectItem = (_item: ReferenceMaterialCatalogItem) => {}
	} = $props();

	function formatDatetime(str: string | undefined): string {
		if (!str) return '—';
		const d = new Date(str);
		return Number.isNaN(d.getTime()) ? str : d.toLocaleString();
	}

	function formatDuration(seconds: number | undefined): string {
		if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.round(seconds % 60);
		const parts: string[] = [];
		if (h > 0) parts.push(`${h}h`);
		if (m > 0) parts.push(`${m}m`);
		if (s > 0 || parts.length === 0) parts.push(`${s}s`);
		return parts.join(' ');
	}

	function getIrradiationStart(rm: ReferenceMaterial | undefined): string {
		if (!rm?.irradiationEnd || !rm?.irradiationTime) return '—';
		const endMs = new Date(rm.irradiationEnd).getTime();
		if (Number.isNaN(endMs)) return '—';
		return formatDatetime(new Date(endMs - rm.irradiationTime * 1000).toISOString());
	}

	function getIrradiationStartIso(rm: ReferenceMaterial | undefined): string {
		if (!rm?.irradiationEnd || !rm?.irradiationTime) return '';
		const endMs = new Date(rm.irradiationEnd).getTime();
		if (Number.isNaN(endMs)) return '';
		return new Date(endMs - rm.irradiationTime * 1000).toISOString();
	}

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
		const latestCounting = item.latestCounting;
		return [
			item.referenceKey,
			material?.NETL_code,
			material?.sampleName,
			item.notes,
			latestCounting?.countingLabel,
			latestCounting?.createdAt,
			material?.referenceDatasheetId,
			material?.irradiationEnd,
			material?.measurementStartTime,
			material?.irradiationType,
			material?.dtType,
			material?.irradiationTime,
			material?.decayTime,
			material?.liveTime,
			material?.realTime,
			material?.fluence,
			material?.mass,
			formatDatetime(material?.irradiationEnd),
			formatDatetime(material?.measurementStartTime),
			getIrradiationStart(material),
			getIrradiationStartIso(material),
			formatDuration(material?.irradiationTime)
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

	let filteredItems = $derived(
		cachedItems.filter((item) => {
			if (!matchesSearch(item, searchTerm)) return false;
			if (isotopeIds.length > 0) {
				return item.isotopes.some((iso) => isotopeIds.includes(iso.isotopeId));
			}
			return true;
		})
	);
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
					placeholder="Search by code, sample, irradiation start/end, measurement start, mode, and more"
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
						{@const isUsedByAnotherReference =
							selectedItemIds.includes(item.id) && item.id !== currentSelectionId}
						<div class="rounded border border-gray-200 p-3 transition hover:border-gray-400">
							<div class="flex items-start justify-between gap-4">
								<div class="space-y-1">
									<div class="font-bold">
										{material?.NETL_code || 'Unknown code'} ({material?.sampleName || 'Unknown sample'})
									</div>
								{#if material?.irradiationEnd || material?.irradiationTime}
									<div class="text-sm">Irradiation start: {getIrradiationStart(material)}</div>
									<div class="text-sm">Irradiation end: {formatDatetime(material?.irradiationEnd)}</div>
									<div class="text-sm">Duration: {formatDuration(material?.irradiationTime)}</div>
								{/if}
								{#if material?.irradiationType}
									<div class="text-sm">Mode: {material.irradiationType}</div>
								{/if}
								{#if material?.dtType}
									<div class="text-sm">Dead time correction: {material.dtType}</div>
								{/if}
									<div class="text-sm">Countings saved: {item.countingCount}</div>
									<div class="text-sm">Isotopes saved: {item.isotopes.length}</div>
								</div>
								<button
									class="rounded border border-gray-300 px-3 py-2 text-sm font-bold transition hover:border-gray-400"
									type="button"
									disabled={isUsedByAnotherReference}
									onclick={() => onSelectItem(item)}
								>
									{isUsedByAnotherReference ? 'Already selected' : 'Load'}
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
