import { describe, expect, it } from 'vitest';
import { diagonalResultOrder } from './resultOrder.js';

describe('diagonalResultOrder', () => {
	it('puts each unknown on the diagonal of the element it was measured for', () => {
		// Isotopes entered La, Fe, Ce; unknowns entered Ce-sample, La-sample, Fe-sample.
		const { columns, rows } = diagonalResultOrder(
			[
				[false, false, true],
				[true, false, false],
				[false, true, false]
			],
			['La', 'Fe', 'Ce']
		);
		expect(columns).toEqual([2, 0, 1]); // Ce, La, Fe
		expect(rows).toEqual([0, 1, 2]);
	});

	it('orders rows to follow the columns when columns are already fixed by an earlier row', () => {
		// Unknown 0 measured La + Ce, unknown 1 only Ce, unknown 2 only La.
		const { columns, rows } = diagonalResultOrder(
			[
				[true, true],
				[false, true],
				[true, false]
			],
			['La', 'Ce']
		);
		expect(columns).toEqual([0, 1]);
		// Row 0 spans both; row 2 (La) starts at column 0 and ends there, row 1 (Ce) starts at 1.
		expect(rows).toEqual([2, 0, 1]);
	});

	it('keeps isotopes of the same element side by side', () => {
		const { columns } = diagonalResultOrder([[true, true, true]], ['Ce', 'La', 'Ce']);
		expect(columns).toEqual([0, 2, 1]);
	});

	it('leaves a fully measured table in entry order (apart from element grouping)', () => {
		const measured = [
			[true, true],
			[true, true]
		];
		expect(diagonalResultOrder(measured, ['Fe', 'La'])).toEqual({ columns: [0, 1], rows: [0, 1] });
	});

	it('sends unmeasured isotopes and unknowns to the end', () => {
		const { columns, rows } = diagonalResultOrder(
			[
				[false, false],
				[false, true]
			],
			['La', 'Ce']
		);
		expect(columns).toEqual([1, 0]);
		expect(rows).toEqual([1, 0]);
	});
});
