/**
 * Utility functions for creating and managing NAA data structures
 */

import type { IsotopeInfo, CountData, ReferenceMaterial, UnknownMaterial } from '../types.js';

/**
 * Creates a default isotope info object
 */
export function createIsotopeInfo(): IsotopeInfo {
	return {
		elementName: '',
		isotopeName: '',
		energy: 0,
		halfLife: 0,
		linkedReference: 0,
		unit: 'seconds'
	};
}

/**
 * Creates a default count data object
 */
export function createCountData(): CountData {
	return {
		grossCounts: 0,
		netCounts: 0,
		uncertainty: 0,
		grossCountsPositionalCorrectionFactor: 1,
		netCountsPositionalCorrectionFactor: 1,
		uncertaintyPositionalCorrectionFactor: 1
	};
}

/**
 * Creates an array of count data objects
 */
export function createCountDataArray(length: number): CountData[] {
	return Array.from({ length }, createCountData);
}

/**
 * Creates a default reference material object
 */
export function createReferenceMaterial(isotopeCount: number): ReferenceMaterial {
	return {
		NETL_code: '',
		sampleName: '',
		mass: 0,
		reactorPower: 0,
		irradiationTime: 0,
		irradiationEnd: '',
		measurementStartTime: '',
		decayTime: 0,
		liveTime: 0,
		realTime: 0,
		fluence: 0,
		counts: createCountDataArray(isotopeCount),
		irradiationType: 'total',
		dtType: undefined,
		countingMode: 'normal',
		concentrationUnits: Array.from({ length: isotopeCount }, () => undefined),
		knownConcentration: Array.from({ length: isotopeCount }, () => 0),
		knownUncertainty: Array.from({ length: isotopeCount }, () => 0)
	};
}

/**
 * Creates a default unknown material object
 */
export function createUnknownMaterial(isotopeCount: number): UnknownMaterial {
	return {
		NETL_code: '',
		sampleName: '',
		mass: 0,
		reactorPower: 0,
		irradiationTime: 0,
		irradiationEnd: '',
		measurementStartTime: '',
		decayTime: 0,
		liveTime: 0,
		realTime: 0,
		fluence: 0,
		counts: createCountDataArray(isotopeCount),
		irradiationType: 'total',
		dtType: undefined,
		countingMode: 'normal'
	};
}

/**
 * Finds the index of the closest ROI centroid to each isotope energy
 */
export function findRoiIndices(
	isotopeInfo: IsotopeInfo[],
	roiData: { centroid: number }[]
): number[] {
	return isotopeInfo.map((iso) => {
		let closestIndex = -1;
		let closestDiff = Infinity;

		for (let j = 0; j < roiData.length; j++) {
			const diff = Math.abs(iso.energy - roiData[j].centroid);
			if (diff < closestDiff) {
				closestDiff = diff;
				closestIndex = j;
			}
		}

		return closestIndex;
	});
}

/**
 * Number of decimal places a final result of the given magnitude is shown to:
 *
 *  - |x| < 1   → 2 decimal places
 *  - |x| < 20  → 1 decimal place
 *  - otherwise → 0 (nearest integer)
 *
 * Non-finite values fall back to 0.
 */
export function resultDecimalPlaces(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	const magnitude = Math.abs(value);
	if (magnitude < 1) {
		return 2;
	}
	if (magnitude < 20) {
		return 1;
	}
	return 0;
}

/** Rounds `value` to `decimals` decimal places. Always rounds, never truncates. */
function roundToPlaces(value: number, decimals: number): number {
	if (decimals <= 0) {
		return Math.round(value);
	}
	return Number(value.toFixed(decimals));
}

/**
 * Rounding applied to the final computed results (concentration, detection
 * limit) for display and CSV export. Precision is chosen from the value's own
 * magnitude — see {@link resultDecimalPlaces}.
 *
 * Always rounds (never truncates). Non-finite values pass through unchanged.
 */
export function roundResult(value: number): number {
	if (!Number.isFinite(value)) {
		return value;
	}
	return roundToPlaces(value, resultDecimalPlaces(value));
}

/**
 * Rounds a companion quantity (an uncertainty) to the same number of decimal
 * places as the value it is displayed next to, per the usual convention:
 * `7.234 ± 0.567` is shown as `7.2 ± 0.6`, not `7.2 ± 0.57`.
 *
 * Non-finite values pass through unchanged.
 */
export function roundToMatch(value: number, reference: number): number {
	if (!Number.isFinite(value)) {
		return value;
	}
	return roundToPlaces(value, resultDecimalPlaces(reference));
}
