/**
 * Type definitions for NAA Analysis application
 */

export interface IsotopeInfo {
	elementName: string;
	isotopeName: string;
	energy: number;
	halfLife: number;
}

export interface CountData {
	grossCounts: number;
	netCounts: number;
	uncertainty: number;
}

/**
 * Dead time correction model type.
 *
 * Note: the `'mixed'` option is deprecated and kept only for backward compatibility.
 * Avoid using `'mixed'` in new code and prefer `'short'` or `'simple'` instead.
 */
export type DeadTimeType = 'short' | 'simple' | 'mixed' | undefined;

export interface BaseMaterialInfo {
	NETL_code: string;
	sampleName: string;
	mass: number;
	irradiationTime: number;
	decayTime: number;
	liveTime: number;
	realTime: number;
	fluence: number;
	counts: CountData[];
	dtType: DeadTimeType;
}

export interface ReferenceMaterial extends BaseMaterialInfo {
	knownConcentration: number[];
	knownUncertainty: number[];
}

export interface UnknownMaterial extends BaseMaterialInfo {}

export interface Materials {
	reference: ReferenceMaterial;
	unknown: UnknownMaterial[];
}

export interface RoiData {
	centroid: number;
}
