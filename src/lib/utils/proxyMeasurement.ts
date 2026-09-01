/**
 * Proxy-measurement ("A measures B") resolution for the analysis pipeline.
 *
 * The user picks the *target* isotope B (what they want to quantify) in Step 1.
 * When a relationship says "A measures B", the decay / saturation / dead-time
 * corrections must run on **A**'s half-life (A is what actually decays during
 * irradiation, decay and counting) while the result is still reported for B.
 * ROI matching uses A's gamma line.
 *
 * Relationships come from two places, both handled here:
 *  - `localLinks` — recorded this session, carry a full `IsotopeInfo` per side.
 *  - `catalogLinks` — loaded from `GET /api/isotope-measurements`, carry only
 *    isotope ids; A's nuclear data is looked up in the isotope catalog.
 */
import type { IsotopeCatalogItem, IsotopeInfo } from '$lib/types.js';
import { isotopeIdentityKey, parseIsotopeName } from '$lib/utils/catalogWrite.js';

export type ProxyMeasured = {
	/** Display label for A, e.g. "Np-239 @ 277.6 keV". */
	label: string;
	/** A's gamma line, if known. */
	energy: number | null;
	/** A's half-life in seconds, if known. */
	halfLifeSeconds: number | null;
	source: 'local' | 'catalog';
};

export type ProxyLocalLink = { measured: IsotopeInfo; target: IsotopeInfo };
export type ProxyCatalogLink = {
	measuredIsotope: { isotopeId?: string; id?: string };
	targetIsotope: { isotopeId?: string; id?: string };
};

export type ProxyContext = {
	localLinks: ProxyLocalLink[];
	catalogLinks: ProxyCatalogLink[];
	catalogById: Record<string, IsotopeCatalogItem>;
};

const HALF_LIFE_UNIT_SECONDS: Record<string, number> = {
	seconds: 1,
	minutes: 60,
	hours: 3600,
	days: 86400,
	weeks: 604800,
	years: 365 * 86400
};

function toHalfLifeSeconds(value: number, unit: string): number | null {
	const factor = HALF_LIFE_UNIT_SECONDS[unit];
	if (!factor || !Number.isFinite(value) || value <= 0) {
		return null;
	}
	return value * factor;
}

function finiteOrNull(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when two isotopes are the same nuclide — by catalog id, else by parsed name. */
function sameIsotope(a: IsotopeInfo, b: IsotopeInfo): boolean {
	const aId = a.id?.trim();
	const bId = b.id?.trim();
	if (aId && bId) {
		return aId === bId;
	}
	const aParsed = parseIsotopeName(a.isotopeName ?? '');
	const bParsed = parseIsotopeName(b.isotopeName ?? '');
	if (aParsed && bParsed) {
		return isotopeIdentityKey(aParsed) === isotopeIdentityKey(bParsed);
	}
	return false;
}

function isotopeLabel(iso: { isotopeName?: string; elementName?: string }): string {
	return iso.isotopeName?.trim() || iso.elementName?.trim() || 'isotope';
}

function catalogIsotopeName(item: IsotopeCatalogItem): string {
	return `${item.shortName}-${item.massNumber}${item.suffix ?? ''}`;
}

function fromLocalLink(link: ProxyLocalLink): ProxyMeasured {
	const energy = finiteOrNull(link.measured.energy);
	return {
		label: describeParts(isotopeLabel(link.measured), energy),
		energy,
		halfLifeSeconds: toHalfLifeSeconds(link.measured.halfLife, link.measured.unit),
		source: 'local'
	};
}

function fromCatalogItem(item: IsotopeCatalogItem): ProxyMeasured {
	const energy = Array.isArray(item.energies)
		? (item.energies.map(Number).find((n) => Number.isFinite(n) && n > 0) ?? null)
		: null;
	const halfLifeSeconds =
		finiteOrNull(item.halfLifeSeconds) ??
		(item.halfLife ? toHalfLifeSeconds(item.halfLife.number, item.halfLife.unit) : null);
	return {
		label: describeParts(catalogIsotopeName(item), energy),
		energy,
		halfLifeSeconds,
		source: 'catalog'
	};
}

function describeParts(name: string, energy: number | null): string {
	return energy !== null ? `${name} @ ${energy.toLocaleString()} keV` : name;
}

/**
 * The measured isotope A for a target isotope B, or null when no relationship
 * applies. A local relationship wins over a catalog one (it carries the exact
 * gamma line the user recorded).
 */
export function resolveProxyMeasured(target: IsotopeInfo, ctx: ProxyContext): ProxyMeasured | null {
	for (const link of ctx.localLinks) {
		if (sameIsotope(link.target, target) && !sameIsotope(link.measured, target)) {
			return fromLocalLink(link);
		}
	}

	const targetId = target.id?.trim();
	if (targetId) {
		for (const link of ctx.catalogLinks) {
			const linkTargetId = (link.targetIsotope?.isotopeId ?? link.targetIsotope?.id ?? '').trim();
			const measuredId = (link.measuredIsotope?.isotopeId ?? link.measuredIsotope?.id ?? '').trim();
			if (linkTargetId !== targetId || !measuredId || measuredId === targetId) {
				continue;
			}
			const item = ctx.catalogById[measuredId];
			if (item) {
				return fromCatalogItem(item);
			}
		}
	}

	return null;
}

/**
 * Substitute A's nuclear data onto B for the computation. Half-life is replaced
 * only when A's is known; the user's own energy on the row is kept when set,
 * otherwise A's line fills in. Returns `isotope` untouched when `proxy` is null.
 */
export function applyProxyMeasured(isotope: IsotopeInfo, proxy: ProxyMeasured | null): IsotopeInfo {
	if (!proxy) {
		return isotope;
	}
	const next: IsotopeInfo = { ...isotope };
	if (proxy.halfLifeSeconds !== null) {
		next.halfLife = proxy.halfLifeSeconds;
		next.unit = 'seconds';
	}
	if (!(Number(isotope.energy) > 0) && proxy.energy !== null) {
		next.energy = proxy.energy;
	}
	return next;
}

/** Short label for A, e.g. "Np-239 @ 277.6 keV". */
export function describeProxyMeasured(proxy: ProxyMeasured): string {
	return proxy.label;
}
