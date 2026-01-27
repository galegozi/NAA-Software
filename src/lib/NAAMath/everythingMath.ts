// These are computations that derive from everywhere, so multiple materials and isotopes.

import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '../types.js';
import type { EverythingComputed } from './types.js';
import { getAll as matIsoGA } from './MaterialIsotopeMath.ts';
import { getAll as MMGA } from './MultiMaterialMath.ts';

function getSaturationFactorRatio(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	const isoMat = {
		reference: matIsoGA(refMaterial, isotope, isotopeIndex),
		unknown: matIsoGA(unkMaterial, isotope, isotopeIndex)
	};
	return isoMat.reference.saturationFactor / isoMat.unknown.saturationFactor;
}

function getDecayCorrectionFactorRatio(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	const isoMat = {
		reference: matIsoGA(refMaterial, isotope, isotopeIndex),
		unknown: matIsoGA(unkMaterial, isotope, isotopeIndex)
	};
	return isoMat.reference.decayCorrectionFactor / isoMat.unknown.decayCorrectionFactor;
}

function getDeadTimeCorrectionRatio(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	const isoMat = {
		reference: matIsoGA(refMaterial, isotope, isotopeIndex),
		unknown: matIsoGA(unkMaterial, isotope, isotopeIndex)
	};
	return isoMat.unknown.funcDeadTimeCorrection / isoMat.reference.funcDeadTimeCorrection;
}

function getUnknownConcentration(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	const multimaterial = MMGA(refMaterial, unkMaterial);
	const result =
		refMaterial.knownConcentration[isotopeIndex] *
		getDeadTimeCorrectionRatio(refMaterial, unkMaterial, isotope, isotopeIndex) *
		getSaturationFactorRatio(refMaterial, unkMaterial, isotope, isotopeIndex) *
		getDecayCorrectionFactorRatio(refMaterial, unkMaterial, isotope, isotopeIndex) *
		multimaterial.massCorrection;
	// fluence correction would go here
	return result;
}

export function getAll(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): EverythingComputed {
	return {
		saturationFactorRatio: getSaturationFactorRatio(
			refMaterial,
			unkMaterial,
			isotope,
			isotopeIndex
		),
		deadTimeCorrectionRatio: getDeadTimeCorrectionRatio(
			refMaterial,
			unkMaterial,
			isotope,
			isotopeIndex
		),
		decayCorrectionFactorRatio: getDecayCorrectionFactorRatio(
			refMaterial,
			unkMaterial,
			isotope,
			isotopeIndex
		),
		unknownConcentration: getUnknownConcentration(refMaterial, unkMaterial, isotope, isotopeIndex)
	};
}
