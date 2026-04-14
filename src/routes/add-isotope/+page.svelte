<script lang="ts">
	import { browser } from '$app/environment';
	import IsotopeInfo from '$lib/components/isotopeInfo.svelte';
	import type { IsotopeInfo as IsotopeInfoType } from '$lib/types.js';
	import { createIsotopeInfo } from '$lib/utils/naaUtils.js';
	import {
		getSignInErrorMessage,
		isEnvironmentWithoutSignIn
	} from '$lib/utils/authEnvironment.js';

	type ClientPrincipal = {
		identityProvider?: string;
		userId?: string;
		userDetails?: string;
		userRoles?: string[];
	};

	type AuthEnvelope = {
		clientPrincipal?: ClientPrincipal | null;
	};

	const WRITER_ROLE = 'isotope_writer';

	let isotopeForm = $state<IsotopeInfoType>(createIsotopeInfo());
	let isotopeFormRef = $state<IsotopeInfo | null>(null);
	let isCheckingAuth = $state(true);
	let isSubmitting = $state(false);
	let authMessage = $state('');
	let submitMessage = $state('');
	let submitError = $state('');
	let currentHostname = $state('');
	let authSupported = $state(false);
	let principal = $state<ClientPrincipal | null>(null);

	let isSignedIn = $derived(principal !== null);
	let writerAccess = $derived(
		principal !== null && Array.isArray(principal.userRoles) && principal.userRoles.includes(WRITER_ROLE)
	);
	let signInAvailable = $derived(
		currentHostname !== '' && !isEnvironmentWithoutSignIn(currentHostname)
	);

	function parseIsotopeName(isotopeName: string) {
		const normalizedName = isotopeName.trim();
		const match = normalizedName.match(/^([A-Za-z]{1,3})\s*-\s*(\d{1,3})([A-Za-z0-9]*)$/);

		if (!match) {
			throw new Error(
				'Isotope must use the format Symbol-Mass, for example Au-198 or Tc-99m.'
			);
		}

		return {
			shortName: match[1],
			massNumber: Number(match[2]),
			suffix: match[3] ?? ''
		};
	}

	function isClientPrincipal(value: unknown): value is ClientPrincipal {
		return typeof value === 'object' && value !== null;
	}

	function extractClientPrincipal(payload: unknown): ClientPrincipal | null {
		if (Array.isArray(payload)) {
			for (const entry of payload) {
				if (isClientPrincipal(entry) && isClientPrincipal((entry as AuthEnvelope).clientPrincipal)) {
					return (entry as AuthEnvelope).clientPrincipal ?? null;
				}

				if (isClientPrincipal(entry) && ('userId' in entry || 'userDetails' in entry || 'userRoles' in entry)) {
					return entry as ClientPrincipal;
				}
			}

			return null;
		}

		if (isClientPrincipal(payload) && isClientPrincipal((payload as AuthEnvelope).clientPrincipal)) {
			return (payload as AuthEnvelope).clientPrincipal ?? null;
		}

		if (
			isClientPrincipal(payload) &&
			('userId' in payload || 'userDetails' in payload || 'userRoles' in payload)
		) {
			return payload as ClientPrincipal;
		}

		return null;
	}

	async function refreshAuthState() {
		if (!browser) {
			return;
		}

		isCheckingAuth = true;
		authMessage = '';
		currentHostname = window.location.hostname;

		if (isEnvironmentWithoutSignIn(currentHostname)) {
			authSupported = false;
			principal = null;
			isCheckingAuth = false;
			return;
		}

		try {
			const response = await fetch('/.auth/me', {
				method: 'GET',
				cache: 'no-store',
				headers: {
					accept: 'application/json'
				}
			});

			if (response.status === 404) {
				authSupported = false;
				principal = null;
				return;
			}

			if (!response.ok) {
				authSupported = true;
				principal = null;
				authMessage = getSignInErrorMessage(currentHostname);
				return;
			}

			authSupported = true;
			const payload = await response.json();
			principal = extractClientPrincipal(payload);
		} catch {
			authSupported = true;
			principal = null;
			authMessage = getSignInErrorMessage(currentHostname);
		} finally {
			isCheckingAuth = false;
		}
	}

	async function handleSignIn() {
		if (!browser) {
			return;
		}

		authMessage = '';
		const currentUrl = new URL(window.location.href);
		const unavailableMessage = getSignInErrorMessage(currentUrl.hostname);
		const loginUrl = new URL('/.auth/login/aad', currentUrl.origin);
		loginUrl.searchParams.set(
			'post_login_redirect_uri',
			currentUrl.pathname + currentUrl.search + currentUrl.hash
		);

		try {
			const authAvailabilityResponse = await fetch('/.auth/me', {
				method: 'GET',
				cache: 'no-store',
				headers: {
					accept: 'application/json'
				}
			});

			if (authAvailabilityResponse.status === 404 || !authAvailabilityResponse.ok) {
				authMessage = unavailableMessage;
				return;
			}
		} catch {
			authMessage = unavailableMessage;
			return;
		}

		window.location.assign(loginUrl.toString());
	}

	async function submitIsotope() {
		submitMessage = '';
		submitError = '';

		if (!writerAccess) {
			submitError = `Your account is signed in, but it does not have the '${WRITER_ROLE}' role required to save isotope data.`;
			return;
		}

		if (!isotopeFormRef?.validateIsotopeInfo()) {
			isotopeFormRef?.showValidationErrors();
			submitError = isotopeFormRef?.getValidationErrors()?.join('. ') || 'Please correct the form.';
			return;
		}

		let isotopeParts;
		try {
			isotopeParts = parseIsotopeName(isotopeForm.isotopeName);
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Invalid isotope name.';
			return;
		}

		isSubmitting = true;

		try {
			const response = await fetch('/api/isotopes', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json'
				},
				body: JSON.stringify({
					elementName: isotopeForm.elementName,
					shortName: isotopeParts.shortName,
					massNumber: isotopeParts.massNumber,
					suffix: isotopeParts.suffix,
					energies: [isotopeForm.energy],
					halfLife: {
						number: isotopeForm.halfLife,
						unit: isotopeForm.unit
					}
				})
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				if (response.status === 401 || response.status === 403) {
					await refreshAuthState();
				}

				throw new Error(payload?.error || `Request failed with status ${response.status}`);
			}

			submitMessage = payload?.created
				? 'Isotope added successfully.'
				: 'Existing isotope updated successfully. Any new energy was appended.';
			isotopeForm = createIsotopeInfo();
			isotopeFormRef?.hideValidationErrors();
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Unable to save isotope.';
		} finally {
			isSubmitting = false;
		}
	}

	$effect(() => {
		void refreshAuthState();
	});
</script>

<svelte:head>
	<title>Write Isotope</title>
</svelte:head>

<section class="writer-page">
	<div class="writer-page__hero">
		<p class="writer-page__eyebrow">Isotope Catalog</p>
		<h1 class="writer-page__title">
			<span class="writer-page__title-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" focusable="false">
					<path
						d="M17 9h-1V7a4 4 0 10-8 0v2H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-8a2 2 0 00-2-2zm-6 6.73V17a1 1 0 002 0v-1.27a2 2 0 10-2 0zM10 9V7a2 2 0 114 0v2h-4z"
					></path>
				</svg>
			</span>
			<span>Write isotope data</span>
		</h1>
		<p class="writer-page__summary">
			Use this page to add a new isotope or append a new energy to an existing isotope record.
			The write endpoint stays locked to Azure-authenticated users with the writer role.
		</p>
	</div>

	{#if isCheckingAuth}
		<div class="writer-card">
			<p>Checking sign-in status...</p>
		</div>
	{:else if !signInAvailable || !authSupported}
		<div class="writer-card writer-card--warning">
			<h2>Azure deployment required</h2>
			<p>This route is only available when the app is running behind Azure Static Web Apps sign-in.</p>
		</div>
	{:else if !isSignedIn}
		<div class="writer-card writer-card--warning">
			<h2>Sign in required</h2>
			<p>Sign in with an account that has the isotope writer role to access this page.</p>
			<button type="button" class="btn variant-filled-primary" onclick={handleSignIn}>
				Sign In
			</button>
			{#if authMessage}
				<p class="writer-page__notice">{authMessage}</p>
			{/if}
		</div>
	{:else}
		<div class="writer-card">
			<div class="writer-card__header">
				<div>
					<h2>Add or update an isotope</h2>
					<p>
						If the isotope already exists, the API will keep the existing record and append any
						new energy value.
					</p>
				</div>
				<div class="writer-card__identity">
					<span>Signed in as</span>
					<strong>{principal?.userDetails || principal?.userId || 'Unknown user'}</strong>
				</div>
			</div>

			{#if !writerAccess}
				<div class="writer-page__feedback writer-page__feedback--warning" role="status">
					This account is signed in, but it does not have the <code>{WRITER_ROLE}</code> role.
					You can view and fill out the form, but saving is disabled until that role is assigned.
				</div>
			{/if}

			<form
				class="writer-form"
				onsubmit={(event) => {
					event.preventDefault();
					void submitIsotope();
				}}
			>
				<IsotopeInfo bind:this={isotopeFormRef} bind:isotopeInfo={isotopeForm} />

				<div class="writer-page__helper">
					<p>Use isotope names like <strong>Au-198</strong> or <strong>Tc-99m</strong>.</p>
					<p>Submitting the same isotope with a new energy will append that energy to the stored list.</p>
				</div>

				{#if submitError}
					<p class="writer-page__feedback writer-page__feedback--error">{submitError}</p>
				{/if}

				{#if submitMessage}
					<p class="writer-page__feedback writer-page__feedback--success">{submitMessage}</p>
				{/if}

				<div class="writer-form__actions">
					<button
						type="submit"
						class="btn variant-filled-primary"
						disabled={isSubmitting || !writerAccess}
					>
						{isSubmitting ? 'Saving...' : 'Save Isotope'}
					</button>
				</div>
			</form>
		</div>
	{/if}
</section>

<style>
	.writer-page {
		--writer-text: rgb(15 23 42);
		--writer-muted: rgb(51 65 85);
		--writer-accent: rgb(71 85 105);
		--writer-card-bg: rgb(255 252 245 / 0.96);
		--writer-card-border: rgb(15 23 42 / 0.08);
		--writer-card-shadow: 0 28px 60px rgb(15 23 42 / 0.12);
		--writer-warning-border: rgb(245 158 11 / 0.28);
		--writer-identity-bg: rgb(15 23 42 / 0.05);
		--writer-helper-bg: #fff7e7;
		--writer-helper-border: rgb(245 158 11 / 0.18);
		--writer-error-bg: rgb(254 242 242);
		--writer-error-text: rgb(153 27 27);
		--writer-error-border: rgb(248 113 113 / 0.28);
		--writer-success-bg: rgb(240 253 244);
		--writer-success-text: rgb(22 101 52);
		--writer-success-border: rgb(74 222 128 / 0.25);
		--writer-notice-text: rgb(180 83 9);
		--writer-code-bg: rgb(15 23 42 / 0.08);
		--writer-code-text: inherit;
		padding: 3rem 5% 0;
		display: grid;
		gap: 1.5rem;
	}

	.writer-page__hero {
		color: var(--writer-text);
		max-width: 42rem;
	}

	.writer-page__eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--writer-accent);
	}

	.writer-page__title {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: clamp(2.2rem, 5vw, 3.75rem);
		line-height: 0.95;
	}

	.writer-page__title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.1em;
		height: 1.1em;
		color: var(--writer-accent);
	}

	.writer-page__title-icon svg {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	.writer-page__summary {
		margin: 1rem 0 0;
		font-size: 1rem;
		color: var(--writer-muted);
	}

	.writer-card {
		background: var(--writer-card-bg);
		border: 1px solid var(--writer-card-border);
		border-radius: 1.5rem;
		padding: 1.5rem;
		box-shadow: var(--writer-card-shadow);
		max-width: 52rem;
		color: var(--writer-text);
	}

	.writer-card--warning {
		border-color: var(--writer-warning-border);
	}

	.writer-card__header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: start;
		margin-bottom: 1.25rem;
	}

	.writer-card__header h2,
		.writer-card--warning h2 {
		margin: 0;
	}

	.writer-card__header p,
		.writer-card--warning p,
		.writer-card > p {
		margin: 0.5rem 0 0;
	}

	.writer-card__identity {
		display: grid;
		gap: 0.25rem;
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		background: var(--writer-identity-bg);
		font-size: 0.9rem;
	}

	.writer-form {
		display: grid;
		gap: 1rem;
	}

	.writer-page__helper {
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		background: var(--writer-helper-bg);
		border: 1px solid var(--writer-helper-border);
		font-size: 0.95rem;
	}

	.writer-page__helper p {
		margin: 0;
	}

	.writer-page__helper p + p {
		margin-top: 0.4rem;
	}

	.writer-page__feedback {
		margin: 0;
		padding: 0.9rem 1rem;
		border-radius: 1rem;
		font-size: 0.95rem;
	}

	.writer-page__feedback--error {
		background: var(--writer-error-bg);
		color: var(--writer-error-text);
		border: 1px solid var(--writer-error-border);
	}

	.writer-page__feedback--success {
		background: var(--writer-success-bg);
		color: var(--writer-success-text);
		border: 1px solid var(--writer-success-border);
	}

	.writer-page__feedback--warning {
		background: var(--writer-helper-bg);
		color: var(--writer-text);
		border: 1px solid var(--writer-helper-border);
	}

	.writer-page__notice {
		margin-top: 0.85rem;
		font-size: 0.95rem;
		color: var(--writer-notice-text);
	}

	.writer-form__actions {
		display: flex;
		justify-content: flex-start;
	}

	code {
		padding: 0.1rem 0.35rem;
		border-radius: 0.4rem;
		background: var(--writer-code-bg);
		color: var(--writer-code-text);
		font-size: 0.92em;
	}

	@media (prefers-color-scheme: dark) {
		.writer-page {
			--writer-text: rgb(226 232 240);
			--writer-muted: rgb(203 213 225);
			--writer-accent: rgb(148 163 184);
			--writer-card-bg: rgb(15 23 42 / 0.82);
			--writer-card-border: rgb(148 163 184 / 0.18);
			--writer-card-shadow: 0 20px 48px rgb(0 0 0 / 0.28);
			--writer-warning-border: rgb(245 158 11 / 0.34);
			--writer-identity-bg: rgb(255 255 255 / 0.06);
			--writer-helper-bg: rgb(120 53 15 / 0.22);
			--writer-helper-border: rgb(245 158 11 / 0.3);
			--writer-error-bg: rgb(69 10 10 / 0.45);
			--writer-error-text: rgb(254 202 202);
			--writer-error-border: rgb(248 113 113 / 0.3);
			--writer-success-bg: rgb(20 83 45 / 0.4);
			--writer-success-text: rgb(187 247 208);
			--writer-success-border: rgb(74 222 128 / 0.28);
			--writer-notice-text: rgb(253 230 138);
			--writer-code-bg: rgb(255 255 255 / 0.08);
			--writer-code-text: rgb(241 245 249);
		}
	}

	@media (max-width: 640px) {
		.writer-page {
			padding: 2rem 1rem 0;
		}

		.writer-card {
			padding: 1.1rem;
		}

		.writer-card__header {
			flex-direction: column;
		}
	}
</style>