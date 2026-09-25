/**
 * Well-known primary nuclear interferences in reactor NAA: another element
 * produces the *same* nuclide as the target's (n,γ) reaction, through a
 * fast-neutron threshold reaction. Used to flag an analysis isotope for review;
 * it lists relationships only — the factor depends on the irradiation
 * position's fast/thermal flux ratio and must be measured or taken from the
 * catalog. Not exhaustive. Fission interferences live in `fissionInterference.ts`.
 *
 * PROVISIONAL: compiled from general NAA knowledge, not yet checked against the
 * project's primary source (Landsberger's interference papers). Replace / cite
 * entries from those papers before relying on this list.
 */
import type { IsotopeInfo } from '$lib/types.js';
import { fissionIsotopeKey } from '$lib/utils/fissionInterference.js';
import { isotopeIdentityKey, parseIsotopeName } from '$lib/utils/catalogWrite.js';

export type PrimaryInterference = {
	/** Product nuclide both reactions make, e.g. "Mg-27". */
	product: string;
	/** Element symbol of the interfering element, e.g. "Al". */
	interferingElement: string;
	/** Reaction that makes the product from the interferent, e.g. "Al-27(n,p)Mg-27". */
	reaction: string;
};

export const PRIMARY_INTERFERENCES: readonly PrimaryInterference[] = [
	{ product: 'Na-24', interferingElement: 'Mg', reaction: 'Mg-24(n,p)Na-24' },
	{ product: 'Na-24', interferingElement: 'Al', reaction: 'Al-27(n,α)Na-24' },
	{ product: 'Mg-27', interferingElement: 'Al', reaction: 'Al-27(n,p)Mg-27' },
	{ product: 'Al-28', interferingElement: 'Si', reaction: 'Si-28(n,p)Al-28' },
	{ product: 'Al-28', interferingElement: 'P', reaction: 'P-31(n,α)Al-28' },
	{ product: 'P-32', interferingElement: 'S', reaction: 'S-32(n,p)P-32' },
	{ product: 'P-32', interferingElement: 'Cl', reaction: 'Cl-35(n,α)P-32' },
	{ product: 'K-42', interferingElement: 'Ca', reaction: 'Ca-42(n,p)K-42' },
	{ product: 'Sc-46', interferingElement: 'Ti', reaction: 'Ti-46(n,p)Sc-46' },
	{ product: 'Ti-51', interferingElement: 'V', reaction: 'V-51(n,p)Ti-51' },
	{ product: 'V-52', interferingElement: 'Cr', reaction: 'Cr-52(n,p)V-52' },
	{ product: 'Cr-51', interferingElement: 'Fe', reaction: 'Fe-54(n,α)Cr-51' },
	{ product: 'Mn-56', interferingElement: 'Fe', reaction: 'Fe-56(n,p)Mn-56' },
	{ product: 'Mn-56', interferingElement: 'Co', reaction: 'Co-59(n,α)Mn-56' },
	{ product: 'Fe-59', interferingElement: 'Co', reaction: 'Co-59(n,p)Fe-59' },
	{ product: 'Co-60', interferingElement: 'Ni', reaction: 'Ni-60(n,p)Co-60' },
	{ product: 'Co-60', interferingElement: 'Cu', reaction: 'Cu-63(n,α)Co-60' },
	{ product: 'Cu-64', interferingElement: 'Zn', reaction: 'Zn-64(n,p)Cu-64' },
	{ product: 'As-76', interferingElement: 'Se', reaction: 'Se-76(n,p)As-76' }
];

function keyFor(name: string): string {
	const parsed = parseIsotopeName(name);
	return parsed ? isotopeIdentityKey(parsed) : `raw:-${name.toLowerCase()}`;
}

const BY_PRODUCT = new Map<string, PrimaryInterference[]>();
for (const entry of PRIMARY_INTERFERENCES) {
	const key = keyFor(entry.product);
	BY_PRODUCT.set(key, [...(BY_PRODUCT.get(key) ?? []), entry]);
}

/** Known primary interferences for an analysis isotope (empty when none). */
export function primaryInterferencesFor(
	isotope: Pick<IsotopeInfo, 'elementName' | 'isotopeName'>
): PrimaryInterference[] {
	return BY_PRODUCT.get(fissionIsotopeKey(isotope)) ?? [];
}
