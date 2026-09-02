// These are computations that derive from everywhere, so multiple materials and isotopes.

import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '../types.js';
import type { EverythingComputed } from './types.js';
import { getAll as matIsoGA } from './MaterialIsotopeMath.ts';
import { getAll as MMGA } from './MultiMaterialMath.ts';
import { getAll as matGA } from './MaterialMath.ts';

function getFactor(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}

function getNumberAtIndex(values: number[] | undefined, index: number): number {
	const value = values?.[index];
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getUnitAtIndex(
	values: ReferenceMaterial['concentrationUnits'] | undefined,
	index: number
): ReferenceMaterial['concentrationUnits'][number] {
	return values?.[index];
}

export function concentrationToMassFraction(
	concentration: number,
	unit: ReferenceMaterial['concentrationUnits'][number]
): number {
	if (!Number.isFinite(concentration)) {
		return 0;
	}

	if (unit === 'percentage') {
		return concentration / 100;
	}

	if (unit === 'ppm') {
		return concentration / 1_000_000;
	}

	return concentration;
}

export function massFractionToConcentration(
	massFraction: number,
	unit: ReferenceMaterial['concentrationUnits'][number]
): number {
	if (!Number.isFinite(massFraction)) {
		return 0;
	}

	if (unit === 'percentage') {
		return massFraction * 100;
	}

	if (unit === 'ppm') {
		return massFraction * 1_000_000;
	}

	return massFraction;
}

function getKnownConcentrationUncertaintyPercent(
	refMaterial: ReferenceMaterial,
	isotopeIndex: number
): number {
	const knownConcentration = getNumberAtIndex(refMaterial.knownConcentration, isotopeIndex);
	if (knownConcentration <= 0) {
		return 0;
	}
	const knownUncertainty = getNumberAtIndex(refMaterial.knownUncertainty, isotopeIndex);
	return (knownUncertainty / knownConcentration) * 100;
}

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

/**
 * The combined correction factor `k` for one (reference, unknown, isotope): the
 * product of the count ratio (dead-time / live-time normalised) and every
 * physics ratio between the two materials. The comparative-NAA result is
 * `unknownConcentration = k * knownConcentration`, and `k` does not depend on
 * the known concentration — it is the factor the fission-interference
 * correction multiplies the standard's *apparent* concentration by.
 */
function getCombinedCorrectionFactor(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	const multimaterial = MMGA(refMaterial, unkMaterial);
	return (
		getDeadTimeCorrectionRatio(refMaterial, unkMaterial, isotope, isotopeIndex) *
		getSaturationFactorRatio(refMaterial, unkMaterial, isotope, isotopeIndex) *
		getDecayCorrectionFactorRatio(refMaterial, unkMaterial, isotope, isotopeIndex) *
		multimaterial.massCorrection *
		multimaterial.fluenceCorrection
	);
}

function getUnknownConcentration(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	const outputUnit = getUnitAtIndex(refMaterial.concentrationUnits, isotopeIndex);
	const knownConcentrationMassFraction = concentrationToMassFraction(
		getNumberAtIndex(refMaterial.knownConcentration, isotopeIndex),
		outputUnit
	);
	const resultMassFraction =
		knownConcentrationMassFraction *
		getCombinedCorrectionFactor(refMaterial, unkMaterial, isotope, isotopeIndex);

	return massFractionToConcentration(resultMassFraction, outputUnit);
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
	const knownConcentrationUncertaintyPercent = getKnownConcentrationUncertaintyPercent(
		refMaterial,
		isotopeIndex
	);

	return Math.sqrt(
		Math.pow(getNumberAtIndex(refComp.countUncertaintyPercent, isotopeIndex), 2) +
			Math.pow(getNumberAtIndex(unkComp.countUncertaintyPercent, isotopeIndex), 2) +
			Math.pow(knownConcentrationUncertaintyPercent, 2)
	);
}

function getNumUnknownConcUncertainty(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	const percUncertainty = getUnknownConcentrationUncertainty(
		refMaterial,
		unkMaterial,
		isotope,
		isotopeIndex
	);
	const unkConc = getUnknownConcentration(refMaterial, unkMaterial, isotope, isotopeIndex);
	return (percUncertainty / 100) * unkConc;
}

function getConcentrationDetectionLimit(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): number {
	// predicted concentration * count detection limit (the detection limit already computed) / net counts
	let predConc = getUnknownConcentration(refMaterial, unkMaterial, isotope, isotopeIndex);
	let countDetLimit = matGA(unkMaterial).detectionLimit[isotopeIndex];
	const countData = unkMaterial.counts[isotopeIndex];
	let netCounts =
		(countData?.netCounts ?? 0) * getFactor(countData?.netCountsPositionalCorrectionFactor);
	return (predConc * countDetLimit) / netCounts;
}

export function getAll(
	refMaterial: ReferenceMaterial,
	unkMaterial: UnknownMaterial,
	isotope: IsotopeInfo,
	isotopeIndex: number
): EverythingComputed {
	return {
		combinedCorrectionFactor: getCombinedCorrectionFactor(
			refMaterial,
			unkMaterial,
			isotope,
			isotopeIndex
		),
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
		),
		concentrationDetectionLimit: getConcentrationDetectionLimit(
			refMaterial,
			unkMaterial,
			isotope,
			isotopeIndex
		)
	};
}
