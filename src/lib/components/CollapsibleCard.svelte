<!--A titled card with Edit/Done + Remove controls in the header and a collapsible body.-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle = '',
		open = false,
		editLabel = 'Edit',
		onToggle,
		onRemove,
		children
	}: {
		title: string;
		subtitle?: string;
		open?: boolean;
		editLabel?: string;
		onToggle: () => void;
		onRemove: () => void;
		children: Snippet;
	} = $props();
</script>

<div class="rounded border border-gray-300 p-3">
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			<strong class="block truncate">{title}</strong>
			{#if subtitle}
				<span class="block truncate text-sm text-gray-500">{subtitle}</span>
			{/if}
		</div>
		<div class="flex shrink-0 gap-2">
			<button
				type="button"
				class="rounded border border-gray-300 px-2 py-1 text-sm"
				onclick={onToggle}
			>
				{open ? 'Done' : editLabel}
			</button>
			<button
				type="button"
				class="rounded border border-gray-300 px-2 py-1 text-sm"
				onclick={onRemove}
			>
				Remove
			</button>
		</div>
	</div>
	{#if open}
		<div class="mt-3">{@render children()}</div>
	{/if}
</div>
