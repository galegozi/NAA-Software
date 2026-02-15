/**
 * Type definitions for NAAMath modules
 * Eliminates 'any' type casting throughout the codebase
 */

import type {
	IsotopeInfo,
	BaseMaterialInfo,
	ReferenceMaterial,
	UnknownMaterial
} from '../types.js';

/**
 * Result from isotope computations
 */
export interface IsotopeComputed {
	decayConstant: number;
}

/**
 * Result from material computations
 */
export interface MaterialComputed {
	deadTime: number;
	deadTimeFraction: number;
	backgroundCounts: number[];
	detectionLimit: number[];
	countUncertaintyPercent: number[];
}

/**
 * Result from material-isotope computations
 */
export interface MaterialIsotopeComputed {
	saturationFactor: number;
	decayCorrectionFactor: number;
	shortDeadTimeCorrection: number;
	mixedDeadTimeCorrection: number;
	simpleDeadTimeCorrection: number;
	funcDeadTimeCorrection: number;
}

/**
 * Result from multi-material computations
 */
export interface MultiMaterialComputed {
	massCorrection: number;
	fluenceCorrection: number;
}

/**
 * Result from everything computation
 */
export interface EverythingComputed {
	saturationFactorRatio: number;
	deadTimeCorrectionRatio: number;
	decayCorrectionFactorRatio: number;
	unknownConcentration: number;
	unknownConcentrationUncertainty: number;
}

/**
 * ROI data from Maestro file
 */
export interface MaestroRoiEntry {
	roi: number;
	energyRange: [number, number];
	grossCounts: number;
	netCounts: number;
	uncertainty: number;
	centroid: number;
}

/**
 * Parsed Maestro data
 */
export interface MaestroParsedData {
	roiData: MaestroRoiEntry[];
	realTime: number;
	liveTime: number;
}
