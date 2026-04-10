<!--This component displays all isotopes. This must be modified before release.-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import type { IsotopeCatalogItem } from '$lib/types.js';

	let items: IsotopeCatalogItem[] = [];
	let isLoading = false;
	let errorMessage = '';

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

	onMount(async () => {
		const apiUrl = env.PUBLIC_ISOTOPE_API_URL?.trim() || '/api/isotopes';

		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch(apiUrl, {
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

			items = normalizeItems(await response.json());
		} catch (error) {
			errorMessage =
				error instanceof Error
					? error.message
					: 'Unable to load isotope catalog from the configured API.';
		} finally {
			isLoading = false;
		}
	});
</script>

<h1>Available Isotopes</h1>
<div>
	{#if isLoading}
		<p>Loading isotope catalog...</p>
	{:else if errorMessage}
		<p>Unable to load isotope catalog: {errorMessage}</p>
	{:else if items.length > 0}
		{#each items as item (item.id)}
			<div>
				<div>
					<div>{item.elementName} ({item.shortName}-{item.massNumber}{item.suffix})</div>
					<div>{item.energies.length} energies</div>
					<input hidden name="id" value={item.id} />
				</div>
			</div>
		{/each}
	{:else}
		<p>
			No isotope data was returned. Configure the integrated Azure Function environment or set
			<code>PUBLIC_ISOTOPE_API_URL</code> to override the data source.
		</p>
	{/if}
</div>
