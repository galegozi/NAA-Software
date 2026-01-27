<script lang="ts">
	/**
	 * Component for displaying computed values in a consistent format
	 */
	interface Props {
		title: string;
		data: unknown;
		level?: 3 | 4;
	}

	let { title, data, level = 3 }: Props = $props();
</script>

{#if level === 3}
	<h3 class="text-xl font-bold">{title}</h3>
{:else}
	<h4 class="text-lg font-semibold">{title}</h4>
{/if}
<pre>{JSON.stringify(data, null, 4)}</pre>
