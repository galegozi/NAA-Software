<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { theme } from '$lib/utils/theme.svelte.js';
	import { analysisMeta } from '$lib/utils/analysisMeta.svelte.js';
	import './layout.css';

	const { children } = $props();

	onMount(() => theme.init());
</script>

<div class="app-shell">
	<nav class="top-nav" aria-label="Primary">
		<span class="top-nav__wordmark">
			<span class="top-nav__brand">NAA Analysis</span>
			<span class="top-nav__experiment">{analysisMeta.title?.trim() || 'Untitled experiment'}</span>
		</span>

		<div class="top-nav__theme" role="group" aria-label="Color theme">
			<button
				type="button"
				class="top-nav__theme-option"
				class:active={theme.mode === 'light'}
				aria-pressed={theme.mode === 'light'}
				onclick={() => theme.set('light')}
			>
				<span class="top-nav__icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false">
						<path
							d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v2a1 1 0 11-2 0V3a1 1 0 011-1zm0 16a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM4.22 4.22a1 1 0 011.42 0l1.4 1.4A1 1 0 115.64 7.04l-1.42-1.4a1 1 0 010-1.42zm12.72 12.72a1 1 0 011.42 0l1.4 1.4a1 1 0 01-1.42 1.42l-1.4-1.4a1 1 0 010-1.42zM2 12a1 1 0 011-1h2a1 1 0 110 2H3a1 1 0 01-1-1zm16 0a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zM4.22 19.78a1 1 0 010-1.42l1.4-1.4a1 1 0 011.42 1.42l-1.4 1.4a1 1 0 01-1.42 0zM16.94 7.06a1 1 0 010-1.42l1.4-1.4a1 1 0 111.42 1.42l-1.4 1.4a1 1 0 01-1.42 0z"
						></path>
					</svg>
				</span>
				<span>Light</span>
			</button>
			<button
				type="button"
				class="top-nav__theme-option"
				class:active={theme.mode === 'dark'}
				aria-pressed={theme.mode === 'dark'}
				onclick={() => theme.set('dark')}
			>
				<span class="top-nav__icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false">
						<path
							d="M21.64 13a1 1 0 00-1.05-.14 8 8 0 01-3.37.73 8.15 8.15 0 01-8.14-8.1 8 8 0 01.25-2A1 1 0 007.05 2.1 10.14 10.14 0 1022 14.05a1 1 0 00-.36-1.05z"
						></path>
					</svg>
				</span>
				<span>Dark</span>
			</button>
		</div>
	</nav>

	<main class="page-shell">
		{#key `${$page.url.pathname}${$page.url.search}`}
			{@render children()}
		{/key}
	</main>
</div>
