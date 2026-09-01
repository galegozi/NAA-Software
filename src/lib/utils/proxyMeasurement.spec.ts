import { describe, expect, it } from 'vitest';
import type { IsotopeCatalogItem, IsotopeInfo } from '$lib/types.js';
import { applyProxyMeasured, resolveProxyMeasured, type ProxyContext } from './proxyMeasurement.js';

function iso(partial: Partial<IsotopeInfo>): IsotopeInfo {
	return {
		elementName: '',
		isotopeName: '',
		energy: 0,
		halfLife: 0,
		linkedReference: 0,
		unit: 'seconds',
		...partial
	};
}

const emptyCtx: ProxyContext = { localLinks: [], catalogLinks: [], catalogById: {} };

describe('resolveProxyMeasured', () => {
	it('matches a local link by catalog id', () => {
		const target = iso({ id: 'u238', elementName: 'Uranium', isotopeName: 'U-238' });
		const ctx: ProxyContext = {
			...emptyCtx,
			localLinks: [
				{
					target: iso({ id: 'u238', isotopeName: 'U-238' }),
					measured: iso({
						id: 'np239',
						isotopeName: 'Np-239',
						energy: 277.6,
						halfLife: 2.355,
						unit: 'days'
					})
				}
			]
		};
		const result = resolveProxyMeasured(target, ctx);
		expect(result?.source).toBe('local');
		expect(result?.energy).toBe(277.6);
		expect(result?.halfLifeSeconds).toBeCloseTo(2.355 * 86400);
		expect(result?.label).toBe('Np-239 @ 277.6 keV');
	});

	it('matches a local link by parsed name when ids are absent', () => {
		const target = iso({ elementName: 'Uranium', isotopeName: 'U-238' });
		const ctx: ProxyContext = {
			...emptyCtx,
			localLinks: [
				{
					target: iso({ isotopeName: 'U238' }),
					measured: iso({ isotopeName: 'Np-239', energy: 277.6, halfLife: 56.5, unit: 'hours' })
				}
			]
		};
		expect(resolveProxyMeasured(target, ctx)?.halfLifeSeconds).toBeCloseTo(56.5 * 3600);
	});

	it('falls back to a catalog link and reads half-life from the catalog', () => {
		const target = iso({ id: 'u238', isotopeName: 'U-238' });
		const catalogItem: IsotopeCatalogItem = {
			id: 'np239',
			elementName: 'Neptunium',
			shortName: 'Np',
			massNumber: 239,
			suffix: '',
			energies: [277.6, 106.1],
			halfLife: { number: 2.355, unit: 'days' },
			halfLifeSeconds: 203472
		};
		const ctx: ProxyContext = {
			localLinks: [],
			catalogLinks: [
				{ measuredIsotope: { isotopeId: 'np239' }, targetIsotope: { isotopeId: 'u238' } }
			],
			catalogById: { np239: catalogItem }
		};
		const result = resolveProxyMeasured(target, ctx);
		expect(result?.source).toBe('catalog');
		expect(result?.halfLifeSeconds).toBe(203472);
		expect(result?.energy).toBe(277.6);
	});

	it('prefers a local link over a catalog link', () => {
		const target = iso({ id: 'u238', isotopeName: 'U-238' });
		const ctx: ProxyContext = {
			localLinks: [
				{
					target: iso({ id: 'u238', isotopeName: 'U-238' }),
					measured: iso({
						id: 'np239',
						isotopeName: 'Np-239',
						energy: 300,
						halfLife: 1,
						unit: 'days'
					})
				}
			],
			catalogLinks: [
				{ measuredIsotope: { isotopeId: 'np239' }, targetIsotope: { isotopeId: 'u238' } }
			],
			catalogById: {
				np239: {
					id: 'np239',
					elementName: 'Neptunium',
					shortName: 'Np',
					massNumber: 239,
					suffix: '',
					energies: [277.6],
					halfLife: { number: 2.355, unit: 'days' },
					halfLifeSeconds: 203472
				}
			}
		};
		expect(resolveProxyMeasured(target, ctx)?.source).toBe('local');
	});

	it('returns null when nothing matches', () => {
		expect(resolveProxyMeasured(iso({ id: 'au198', isotopeName: 'Au-198' }), emptyCtx)).toBeNull();
	});
});

describe('applyProxyMeasured', () => {
	const proxy = {
		label: 'Np-239 @ 277.6 keV',
		energy: 277.6,
		halfLifeSeconds: 203472,
		source: 'local' as const
	};

	it('is a no-op for a null proxy', () => {
		const original = iso({ isotopeName: 'U-238', halfLife: 99, unit: 'years' });
		expect(applyProxyMeasured(original, null)).toBe(original);
	});

	it('swaps the half-life to seconds', () => {
		const result = applyProxyMeasured(
			iso({ isotopeName: 'U-238', halfLife: 4.5e9, unit: 'years' }),
			proxy
		);
		expect(result.halfLife).toBe(203472);
		expect(result.unit).toBe('seconds');
	});

	it('keeps a user-entered energy but fills a blank one', () => {
		expect(applyProxyMeasured(iso({ energy: 100 }), proxy).energy).toBe(100);
		expect(applyProxyMeasured(iso({ energy: 0 }), proxy).energy).toBe(277.6);
	});

	it('leaves the half-life alone when the proxy has none', () => {
		const result = applyProxyMeasured(iso({ halfLife: 5, unit: 'days' }), {
			...proxy,
			halfLifeSeconds: null
		});
		expect(result.halfLife).toBe(5);
		expect(result.unit).toBe('days');
	});
});
