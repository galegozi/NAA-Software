<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { isEnvironmentWithoutSignIn } from '$lib/utils/authEnvironment.js';
	import './layout.css';

	const { children } = $props();

	let currentHostname = $state('');
	let showWriterNavigation = $derived(
		currentHostname !== '' && !isEnvironmentWithoutSignIn(currentHostname)
	);

	$effect(() => {
		if (!browser) {
			return;
		}

		currentHostname = window.location.hostname;
	});
</script>

<div class="app-shell">
	<nav class="top-nav" aria-label="Primary">
		<a class:active={page.url.pathname === '/'} class="top-nav__link" href={resolve('/')}>
			<span>Analyze</span>
		</a>
		{#if showWriterNavigation}
			<a
				class:active={page.url.pathname.startsWith('/add-isotope')}
				class="top-nav__link"
				href={resolve('/add-isotope')}
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
				class:active={page.url.pathname.startsWith('/add-reference-material')}
				class="top-nav__link"
				href={resolve('/add-reference-material')}
			>
				<span class="top-nav__icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" focusable="false">
						<path
							d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v12a2 2 0 002 2h7v-2H5V10h14v1h2V6a2 2 0 00-2-2zm0 4H5V6h14v2zm-3.24 4.34l-1.41 1.41 2.24 2.24-4.24 4.24H10.1v-2.24h2.24l3.42-3.42-2.24-2.23z"
						></path>
					</svg>
				</span>
				<span>Add Reference</span>
			</a>
		{/if}
	</nav>

	<main class="page-shell">
		{@render children()}
	</main>
</div>
