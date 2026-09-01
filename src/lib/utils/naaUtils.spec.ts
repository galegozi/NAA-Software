import { describe, expect, it } from 'vitest';
import { roundResult } from './naaUtils.js';

describe('roundResult', () => {
	it('rounds magnitudes below 1 to 2 decimal places', () => {
		expect(roundResult(0.12345)).toBe(0.12);
		expect(roundResult(0.126)).toBe(0.13);
		expect(roundResult(-0.678)).toBe(-0.68);
		expect(roundResult(0)).toBe(0);
	});

	it('rounds magnitudes below 20 to 1 decimal place', () => {
		expect(roundResult(1)).toBe(1);
		expect(roundResult(3.14159)).toBe(3.1);
		expect(roundResult(3.16)).toBe(3.2);
		expect(roundResult(-12.55)).toBe(-12.6);
		expect(roundResult(19.94)).toBe(19.9);
	});

	it('rounds magnitudes of 20 or more to the nearest integer', () => {
		expect(roundResult(20)).toBe(20);
		expect(roundResult(25.4)).toBe(25);
		expect(roundResult(25.6)).toBe(26);
		expect(roundResult(-101.5)).toBe(-101);
		expect(roundResult(1234.9)).toBe(1235);
	});

	it('rounds at the bucket boundaries', () => {
		expect(roundResult(0.999)).toBe(1); // <1 bucket, 2dp rounds up
		expect(roundResult(19.96)).toBe(20); // <20 bucket, 1dp rounds up
	});

	it('passes non-finite values through', () => {
		expect(roundResult(Number.NaN)).toBeNaN();
		expect(roundResult(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
	});
});
