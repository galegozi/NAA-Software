// This is all computations that derive purely from isotope attributes.

import type { IsotopeInfo } from '../types.js';
import type { IsotopeComputed } from './types.js';

function getDecayConstant(halfLife: number): number {
	return Math.log(2) / halfLife;
}

export function getAll(isotope: IsotopeInfo): IsotopeComputed {
	return {
		decayConstant: getDecayConstant(isotope.halfLife)
	};
}