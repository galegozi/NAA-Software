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
 * Rounding applied to the final computed results (concentration, uncertainty,
 * detection limit) for display and CSV export:
 *
 *  - |x| < 1   → 2 decimal places
 *  - |x| < 20  → 1 decimal place
 *  - otherwise → nearest integer
 *
 * Always rounds (never truncates). Non-finite values pass through unchanged.
 */
export function roundResult(value: number): number {
	if (!Number.isFinite(value)) {
		return value;
	}
	const magnitude = Math.abs(value);
	if (magnitude < 1) {
		return Number(value.toFixed(2));
	}
	if (magnitude < 20) {
		return Number(value.toFixed(1));
	}
	return Math.round(value);
}
