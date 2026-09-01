/**
 * Type definitions for NAA Analysis application
 */

export interface IsotopeInfo {
	id?: string;
	elementName: string;
	isotopeName: string;
	energy: number;
	halfLife: number;
	linkedReference: number;
	unit: string;
}

export interface CountData {
	grossCounts: number;
	netCounts: number;
	uncertainty: number;
	grossCountsPositionalCorrectionFactor: number;
	netCountsPositionalCorrectionFactor: number;
	uncertaintyPositionalCorrectionFactor: number;
}

/**
 * Dead time correction model type.
 *
 * Note: the `'mixed'` option is deprecated and kept only for backward compatibility.
 * Avoid using `'mixed'` in new code and prefer `'short'` or `'simple'` instead.
 */
export type DeadTimeType = 'short' | 'simple' | 'mixed' | undefined;
export type IrradiationType = 'gated' | 'total' | undefined;
export type ConcUnitType = 'percentage' | 'ppm' | undefined;

/**
 * Detector counting mode. `'normal'` is singles counting; `'compton'` is
 * Compton-suppressed counting (anti-coincidence shield). A reference and the
 * unknown it is compared against must use the same mode. Absent means `'normal'`.
 */
export type CountingModeType = 'normal' | 'compton';

export interface BaseMaterialInfo {
	NETL_code: string;
	sampleName: string;
	mass: number;
	reactorPower: number;
	irradiationTime: number;
	irradiationEnd: string;
	measurementStartTime: string;
	decayTime: number;
	liveTime: number;
	realTime: number;
	fluence: number;
	counts: CountData[];
	irradiationType: IrradiationType;
	dtType: DeadTimeType;
	countingMode?: CountingModeType;
}

export interface ReferenceMaterial extends BaseMaterialInfo {
	referenceDatasheetId?: string;
	concentrationUnits: ConcUnitType[];
	knownConcentration: number[];
	knownUncertainty: number[];
}

export type UnknownMaterial = BaseMaterialInfo;

export interface Materials {
	reference: ReferenceMaterial[];
	unknown: UnknownMaterial[];
	// Optional: map each isotope to a reference index
	referenceIndexByIsotope?: number[];
}

export interface RoiData {
	centroid: number;
}

export interface HalfLife {
	number: number;
	unit: "seconds" | "minutes" | "hours" | "days" | "weeks" | "years";
}

export interface IsotopeCatalogItem {
	id: string;
	elementName: string;
	shortName: string;
	massNumber: number;
	suffix: string;
	energies: number[];
	halfLife: HalfLife;
	halfLifeSeconds: number;
}

export interface ReferenceMaterialCatalogIsotopeSelection {
	isotopeId: string;
	energy: number | null;
}

export interface ReferenceMaterialCatalogCounting {
	countingId: string;
	countingLabel: string;
	createdAt?: string;
	referenceMaterial: ReferenceMaterial;
}

export interface ReferenceMaterialCatalogItem {
	id: string;
	referenceKey: string;
	notes: string;
	isotopes: ReferenceMaterialCatalogIsotopeSelection[];
	countingCount: number;
	countings?: ReferenceMaterialCatalogCounting[];
	latestCounting: ReferenceMaterialCatalogCounting | null;
	createdAt?: string | null;
	updatedAt?: string | null;
}

export interface IsotopeWriteForm {
	elementName: string;
	shortName: string;
	massNumber: number;
	suffix: string;
	energy: number;
	halfLife: number;
	unit: HalfLife['unit'];
}
