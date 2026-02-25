// These are computations that derive from everywhere, so multiple materials and isotopes.

import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '../types.js';
import type { EverythingComputed } from './types.js';
import { getAll as matIsoGA } from './MaterialIsotopeMath.ts';
import { getAll as MMGA } from './MultiMaterialMath.ts';
import { getAll as matGA } from './MaterialMath.ts';

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
		multimaterial.massCorrection *
		multimaterial.fluenceCorrection;
	return result;
}

function getUnknownConcentrationUncertainty(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	// sqrt(R18^2 + CONST(R16)^2 + CONST(L5)^2)
	// R18 is count uncertainty
	// R16 is reference material count uncertainty
	// L5 is reference material known concentration uncertainty
	let refComp = matGA(refMaterial);
	let unkComp = matGA(unkMaterial);

	let rawKnownUncertainty = refMaterial.knownUncertainty[isotopeIndex];
	if (refMaterial.concentrationUnits[isotopeIndex] === 'ppm') {
		// convert to percent
		rawKnownUncertainty = rawKnownUncertainty / 1000000 * 100;
	}

	return Math.sqrt(
		Math.pow(refComp.countUncertaintyPercent[isotopeIndex], 2) +
		Math.pow(unkComp.countUncertaintyPercent[isotopeIndex], 2) +
		Math.pow(rawKnownUncertainty, 2)
	);
}

function getNumUnknownConcUncertainty(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
) : number {
	const percUncertainty = getUnknownConcentrationUncertainty(refMaterial, unkMaterial, isotope, isotopeIndex);
	const unkConc = getUnknownConcentration(refMaterial, unkMaterial, isotope, isotopeIndex);
	return (percUncertainty / 100) * unkConc;
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
		unknownConcentration: getUnknownConcentration(refMaterial, unkMaterial, isotope, isotopeIndex),
		unknownConcentrationUncertainty: getUnknownConcentrationUncertainty(
			refMaterial,
			unkMaterial,
			isotope,
			isotopeIndex
		),
		unknownConcentrationUncertaintyAbsolute: getNumUnknownConcUncertainty(
			refMaterial,
			unkMaterial,
			isotope,
			isotopeIndex
		)
	};
}
