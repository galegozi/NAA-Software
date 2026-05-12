<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { getSignInErrorMessage, isEnvironmentWithoutSignIn } from '$lib/utils/authEnvironment.js';
	import type { Snippet } from 'svelte';

	type ClientPrincipal = {
		identityProvider?: string;
		userId?: string;
		userDetails?: string;
		userRoles?: string[];
	};

	type AuthEnvelope = {
		clientPrincipal?: ClientPrincipal | null;
	};

	type AuthContext = {
		principal: ClientPrincipal;
		writerAccess: boolean;
	};

	type Props = {
		requiredRole: string;
		children: Snippet<[AuthContext]>;
	};

	let { requiredRole, children }: Props = $props();

	let isCheckingAuth = $state(true);
	let authMessage = $state('');
	let authSupported = $state(false);
	let principal = $state<ClientPrincipal | null>(null);
	let currentHostname = $state('');
	let hasInitializedAuth = $state(false);

	let isSignedIn = $derived(principal !== null);
	let writerAccess = $derived(
		principal !== null &&
			Array.isArray(principal.userRoles) &&
			principal.userRoles.includes(requiredRole)
	);
	let signInAvailable = $derived(
		currentHostname !== '' && !isEnvironmentWithoutSignIn(currentHostname)
	);

	function isClientPrincipal(value: unknown): value is ClientPrincipal {
		return typeof value === 'object' && value !== null;
	}

	function extractClientPrincipal(payload: unknown): ClientPrincipal | null {
		if (Array.isArray(payload)) {
			for (const entry of payload) {
				if (
					isClientPrincipal(entry) &&
					isClientPrincipal((entry as AuthEnvelope).clientPrincipal)
				) {
					return (entry as AuthEnvelope).clientPrincipal ?? null;
				}

				if (
					isClientPrincipal(entry) &&
					('userId' in entry || 'userDetails' in entry || 'userRoles' in entry)
				) {
					return entry as ClientPrincipal;
				}
			}

			return null;
		}

		if (
			isClientPrincipal(payload) &&
			isClientPrincipal((payload as AuthEnvelope).clientPrincipal)
		) {
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

	export async function refreshAuthState() {
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
			const controller = new AbortController();
			const timeoutId = window.setTimeout(() => controller.abort(), 5000);
			const response = await fetch('/.auth/me', {
				method: 'GET',
				cache: 'no-store',
				signal: controller.signal,
				headers: {
					accept: 'application/json'
				}
			});
			window.clearTimeout(timeoutId);

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
			const data = await response.json();
			principal = extractClientPrincipal(data);
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
		const loginUrl = new URL('/.auth/login/aad', currentUrl.origin);
		loginUrl.searchParams.set(
			'post_login_redirect_uri',
			currentUrl.pathname + currentUrl.search + currentUrl.hash
		);

		window.location.assign(loginUrl.toString());
	}

	onMount(() => {
		if (!browser || hasInitializedAuth) {
			return;
		}

		hasInitializedAuth = true;
		const watchdogId = window.setTimeout(() => {
			if (!isCheckingAuth) {
				return;
			}

			currentHostname = window.location.hostname;
			authSupported = !isEnvironmentWithoutSignIn(currentHostname);
			principal = null;
			authMessage = getSignInErrorMessage(currentHostname);
			isCheckingAuth = false;
		}, 6000);

		void refreshAuthState().finally(() => {
			window.clearTimeout(watchdogId);
		});
	});
</script>

{#if isCheckingAuth}
	<div class="auth-gate__card">
		<p>Checking sign-in status...</p>
	</div>
{:else if !signInAvailable || !authSupported}
	<div class="auth-gate__card auth-gate__card--warning">
		<h2>Azure deployment required</h2>
		<p>This route is only available when the app is running behind Azure Static Web Apps sign-in.</p>
	</div>
{:else if !isSignedIn}
	<div class="auth-gate__card auth-gate__card--warning">
		<h2>Sign in required</h2>
		<p>Sign in with an account that has the required role to access this page.</p>
		<button type="button" class="btn variant-filled-primary" onclick={handleSignIn}>Sign In</button>
		{#if authMessage}
			<p class="auth-gate__notice">{authMessage}</p>
		{/if}
	</div>
{:else}
	{@render children({ principal: principal!, writerAccess })}
{/if}

<style>
	.auth-gate__card {
		background: var(--writer-card-bg);
		border: 1px solid var(--writer-card-border);
		border-radius: 1.5rem;
		padding: 1.5rem;
		box-shadow: var(--writer-card-shadow);
		inline-size: max-content;
		min-inline-size: min(100%, 52rem);
		color: var(--writer-text);
	}

	.auth-gate__card--warning {
		border-color: var(--writer-warning-border);
	}

	.auth-gate__card h2 {
		margin: 0;
	}

	.auth-gate__card p {
		margin: 0.5rem 0 0;
	}

	.auth-gate__notice {
		margin-top: 0.85rem;
		font-size: 0.95rem;
		color: var(--writer-notice-text);
	}
</style>
