<!--This component displays all isotopes. This must be modified before release.-->
<script lang="ts">
	let {data} = $props();
</script>

<h1>Items</h1>
<div>
	{#if data.items.length > 0}
		{#each data.items as item (item.id)}
			<div>
				<div>
					<div>{item.elementName} ({item.shortName}-{item.massNumber})</div>
					<div>{item.energies.length} energies</div>
					<input hidden name="id" value={item.id} />
				</div>
			</div>
		{/each}
	{:else}
		<p>No items found.</p>
	{/if}
</div>
