// This is all computations that derive purely from isotope attributes.

import type { IsotopeInfo } from '../types.js';
import type { IsotopeComputed } from './types.js';

function getDecayConstant(halfLife: number): number {
	return Math.log(2) / halfLife;
}

export function convertHalfLifeToSeconds(halfLife: number, unit: string): number {
	switch (unit) {
		case 'seconds':
			return halfLife;
		case 'minutes':
			return halfLife * 60;
		case 'hours':
			return convertHalfLifeToSeconds(halfLife, 'minutes') * 60;
		case 'days':
			return convertHalfLifeToSeconds(halfLife, 'hours') * 24;
		case 'weeks':
			return convertHalfLifeToSeconds(halfLife, 'days') * 7;
		case 'years':
			return convertHalfLifeToSeconds(halfLife, 'days') * 365;
		default:
			throw new Error(`Unknown time unit: ${unit}`);
	}
}

export function getAll(isotope: IsotopeInfo): IsotopeComputed {
	const HLS = convertHalfLifeToSeconds(isotope.halfLife, isotope.unit);
	return {
		halfLifeSeconds: HLS,
		decayConstant: getDecayConstant(HLS)
	};
}
