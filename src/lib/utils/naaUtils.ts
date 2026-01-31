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
		halfLife: 0
	};
}

/**
 * Creates a default count data object
 */
export function createCountData(): CountData {
	return {
		grossCounts: 0,
		netCounts: 0,
		uncertainty: 0
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
		irradiationTime: 0,
		decayTime: 0,
		liveTime: 0,
		realTime: 0,
		fluence: 0,
		counts: createCountDataArray(isotopeCount),
		dtType: undefined,
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
		irradiationTime: 0,
		decayTime: 0,
		liveTime: 0,
		realTime: 0,
		fluence: 0,
		counts: createCountDataArray(isotopeCount),
		dtType: undefined
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

export function truncateToSigFigs(value: number, sigFigs: number = 3): number {
	if (value === 0) {
		return 0;
	} else if (Math.abs(value) >= Math.pow(10, sigFigs - 1)) {
		return Math.round(value);
	} else {
		const bitShift = Math.ceil(Math.log10(Math.abs(value)));
		const factor = Math.pow(10, sigFigs - bitShift);
		return Math.round(value * factor) / factor;
	}
}