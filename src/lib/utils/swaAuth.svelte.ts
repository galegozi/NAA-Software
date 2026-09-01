/**
 * Azure Static Web Apps auth state, shared across the app.
 *
 * SWA is the authenticating layer (see CLAUDE.md). This module reads
 * `/.auth/me` once on demand and exposes the signed-in principal plus a role
 * check, so the wizard can decide whether "Save to catalog" is actionable.
 */
import { browser } from '$app/environment';
import { getSignInErrorMessage, isEnvironmentWithoutSignIn } from '$lib/utils/authEnvironment.js';

export type ClientPrincipal = {
	identityProvider?: string;
	userId?: string;
	userDetails?: string;
	userRoles?: string[];
};

type AuthEnvelope = {
	clientPrincipal?: ClientPrincipal | null;
};

function isClientPrincipal(value: unknown): value is ClientPrincipal {
	return typeof value === 'object' && value !== null;
}

/** Pull the client principal out of the various shapes `/.auth/me` can return. */
export function extractClientPrincipal(payload: unknown): ClientPrincipal | null {
	if (Array.isArray(payload)) {
		for (const entry of payload) {
			if (isClientPrincipal(entry) && isClientPrincipal((entry as AuthEnvelope).clientPrincipal)) {
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

/** Send the browser to the AAD sign-in flow, returning to the current URL. */
export function redirectToSignIn(): void {
	if (!browser) {
		return;
	}
	const returnTo = window.location.pathname + window.location.search + window.location.hash;
	window.location.assign(
		`/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(returnTo)}`
	);
}

/** Sign the user out via the SWA logout endpoint and return to the home page. */
export function signOut(): void {
	if (!browser) {
		return;
	}
	window.location.assign('/.auth/logout?post_logout_redirect_uri=/');
}

class SwaAuth {
	/** True while the first/next `/.auth/me` probe is in flight. */
	checking = $state(false);
	/** Signed-in principal, or null. */
	principal = $state<ClientPrincipal | null>(null);
	/** False on deployments that can't reach SWA sign-in (localhost, GitHub Pages). */
	signInAvailable = $state(false);
	/** Non-empty when a probe failed in a way worth surfacing. */
	message = $state('');

	#requested = false;

	get signedIn(): boolean {
		return this.principal !== null;
	}

	hasRole(role: string): boolean {
		return (
			this.principal !== null &&
			Array.isArray(this.principal.userRoles) &&
			this.principal.userRoles.includes(role)
		);
	}

	/** Probe once unless `force`. */
	async refresh(force = false): Promise<void> {
		if (!browser) {
			return;
		}
		if (this.#requested && !force) {
			return;
		}
		this.#requested = true;

		const hostname = window.location.hostname;
		if (isEnvironmentWithoutSignIn(hostname)) {
			this.signInAvailable = false;
			this.principal = null;
			return;
		}
		this.signInAvailable = true;

		this.checking = true;
		this.message = '';
		try {
			const controller = new AbortController();
			const timeoutId = window.setTimeout(() => controller.abort(), 5000);
			const response = await fetch('/.auth/me', {
				method: 'GET',
				cache: 'no-store',
				signal: controller.signal,
				headers: { accept: 'application/json' }
			});
			window.clearTimeout(timeoutId);

			if (response.status === 404) {
				this.signInAvailable = false;
				this.principal = null;
				return;
			}
			if (!response.ok) {
				this.principal = null;
				this.message = getSignInErrorMessage(hostname);
				return;
			}
			this.principal = extractClientPrincipal(await response.json());
		} catch {
			this.principal = null;
			this.message = getSignInErrorMessage(hostname);
		} finally {
			this.checking = false;
		}
	}
}

export const swaAuth = new SwaAuth();
