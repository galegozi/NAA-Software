<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { isEnvironmentWithoutSignIn } from '$lib/utils/authEnvironment.js';
	import './layout.css';

	const { children } = $props();

	// The isotope/reference writer pages only work behind Azure Static Web Apps sign-in.
	// Hide their nav links on deployments that can't reach it (localhost, GitHub Pages).
	let writerPagesAvailable = $derived(
		!browser || !isEnvironmentWithoutSignIn(window.location.hostname)
	);
</script>

<div class="app-shell">
	<nav class="top-nav" aria-label="Primary">
		<a
			class:active={$page.url.pathname === '/'}
			class="top-nav__link"
			href={resolve('/')}
			data-sveltekit-reload
		>
			<span>Analyze</span>
		</a>
		{#if writerPagesAvailable}
			<a
				class:active={$page.url.pathname.startsWith('/add-isotope')}
				class="top-nav__link"
				href={resolve('/add-isotope')}
				data-sveltekit-reload
			>
				<span class="top-nav__icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false">
						<path
							d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-6 6.73V17a1 1 0 002 0v-1.27a2 2 0 10-2 0zM10 9V7a2 2 0 114 0v2h-4z"
						></path>
					</svg>
				</span>
				<span>Write Isotope</span>
			</a>
			<a
				class:active={$page.url.pathname.startsWith('/add-reference-material')}
				class="top-nav__link"
				href={resolve('/add-reference-material')}
				data-sveltekit-reload
			>
				<span class="top-nav__icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false">
						<path
							d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-6 6.73V17a1 1 0 002 0v-1.27a2 2 0 10-2 0zM10 9V7a2 2 0 114 0v2h-4z"
						></path>
					</svg>
				</span>
				<span>Add Reference</span>
			</a>
		{/if}
	</nav>

	<main class="page-shell">
		{#key `${$page.url.pathname}${$page.url.search}`}
			{@render children()}
		{/key}
	</main>
</div>
