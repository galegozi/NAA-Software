const DEFAULT_AUTHENTICATED_ROLE = 'authenticated';

function decodeClientPrincipal(encodedPrincipal) {
	if (!encodedPrincipal) {
		return null;
	}

	try {
		const json = Buffer.from(encodedPrincipal, 'base64').toString('utf8');
		const parsed = JSON.parse(json);
		return typeof parsed === 'object' && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}

export function getClientPrincipal(request) {
	return decodeClientPrincipal(request.headers.get('x-ms-client-principal'));
}

export function getRequiredRole() {
	return process.env.ISOTOPE_WRITE_ROLE?.trim() || 'isotope_writer';
}

export function canWriteIsotopes(request) {
	const principal = getClientPrincipal(request);
	if (!principal) {
		return {
			authorized: false,
			status: 401,
			message: 'Authentication is required to write isotope data.'
		};
	}

	const roles = Array.isArray(principal.userRoles) ? principal.userRoles : [];
	const requiredRole = getRequiredRole();
	const isAuthenticated = roles.includes(DEFAULT_AUTHENTICATED_ROLE) || roles.length > 0;

	if (!isAuthenticated || !roles.includes(requiredRole)) {
		return {
			authorized: false,
			status: 403,
			message: `The '${requiredRole}' role is required to write isotope data.`
		};
	}

	return {
		authorized: true,
		principal,
		requiredRole
	};
}