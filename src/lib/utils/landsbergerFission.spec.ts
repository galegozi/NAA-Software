import { describe, expect, it } from 'vitest';
import {
	describeFissionChoice,
	describeFissionRow,
	fissileParentSymbol
} from './fissionInterference.js';
import {
	isBuiltinFissionRow,
	LANDSBERGER_1989_THERMAL,
	landsbergerFissionRows
} from './landsbergerFission.js';

describe('landsbergerFissionRows', () => {
	it('holds the 1989 abstract values (apparent ppm per ppm U, thermal)', () => {
		expect(LANDSBERGER_1989_THERMAL).toEqual({
			Ba: 0.64,
			Ce: 0.27,
			Mo: 1.6,
			Nd: 0.23,
			Ru: 0.13,
			Te: 0.8,
			Zr: 10
		});
	});

	it('offers the element factor for an element name + mass number', () => {
		const [row] = landsbergerFissionRows({ elementName: 'Cerium', isotopeName: '141' });
		expect(row.correctionFactor).toBe(0.27);
		expect(row.irradiationType).toBe('thermal');
		expect(row.uncertainty).toBe(0);
		expect(isBuiltinFissionRow(row)).toBe(true);
	});

	it('falls back to the isotope name when the element name is blank', () => {
		const rows = landsbergerFissionRows({ elementName: '', isotopeName: 'Ba-131' });
		expect(rows.map((r) => r.correctionFactor)).toEqual([0.64]);
	});

	it('has nothing for La (decay-time dependent) or unlisted elements', () => {
		expect(landsbergerFissionRows({ elementName: 'Lanthanum', isotopeName: 'La-140' })).toEqual([]);
		expect(landsbergerFissionRows({ elementName: 'Gold', isotopeName: 'Au-198' })).toEqual([]);
	});

	it('names total uranium as the fissile parent, so U concentrations are found', () => {
		const [row] = landsbergerFissionRows({ elementName: 'Zirconium', isotopeName: 'Zr-95' });
		expect(fissileParentSymbol(row.fissileNuclide)).toBe('U');
	});

	it('cites the source in the row and choice labels', () => {
		const [row] = landsbergerFissionRows({ elementName: 'Molybdenum', isotopeName: 'Mo-99' });
		expect(describeFissionRow(row)).toBe(
			'U · thermal → factor 1.6 — Landsberger, Chem. Geol. 77 (1989) 65–70 — thermal, apparent ppm per ppm U (abstract value)'
		);
		expect(
			describeFissionChoice({
				isotopeKey: 'x',
				factor: 1.6,
				uncertainty: 0,
				mode: 'table',
				fissileNuclide: 'U',
				irradiationType: 'thermal',
				sourceRowId: row.id
			})
		).toBe('Factor 1.6 (U, thermal, Landsberger 1989)');
	});
});
