export function isEnvironmentWithoutSignIn(hostname: string): boolean {
	const normalizedHostname = hostname.toLowerCase();
	return (
		normalizedHostname === 'localhost' ||
		normalizedHostname === '127.0.0.1' ||
		normalizedHostname === '::1' ||
		normalizedHostname.endsWith('.localhost') ||
		normalizedHostname.endsWith('.github.io')
	);
}

export function getSignInErrorMessage(hostname: string): string {
	if (isEnvironmentWithoutSignIn(hostname)) {
		return 'This feature is not available in this environment.';
	}

	return 'There was an issue signing you in. Please try again later, or contact support if issues persist';
}

export function getIsotopeCatalogAccessMessage(hostname: string): string {
	if (isEnvironmentWithoutSignIn(hostname)) {
		return 'The isotope catalog is not available in this environment.';
	}

	return 'Could not load the isotope catalog. If this deployment is access-restricted, sign in and try again.';
}

export function getReferenceMaterialCatalogAccessMessage(hostname: string): string {
	if (isEnvironmentWithoutSignIn(hostname)) {
		return 'The reference material catalog is not available in this environment.';
	}

	return 'Could not load the reference material catalog. If this deployment is access-restricted, sign in and try again.';
}
