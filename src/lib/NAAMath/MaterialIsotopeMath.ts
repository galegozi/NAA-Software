// These are computations that derive from attributes of an isotope and a single material.

import type { IsotopeInfo, BaseMaterialInfo } from '../types.js';
import type { MaterialIsotopeComputed } from './types.js';
import { getAll as isoGA } from './isotopeMath.ts';
import { getAll as matGA } from './MaterialMath.ts';

function getFactor(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}

function getNetCountsAtIndex(material: BaseMaterialInfo, isoIndex: number): number {
	const countData = material.counts?.[isoIndex];
	const netCounts = countData?.netCounts ?? 0;
	return netCounts * getFactor(countData?.netCountsPositionalCorrectionFactor);
}

function getSaturationFactor(
	material: BaseMaterialInfo,
	isotope: IsotopeInfo,
	isoIndex: number
): number {
	const isoAll = isoGA(isotope);
	return 1 - Math.exp(-isoAll.decayConstant * material.irradiationTime);
}

function getDecayCorrectionFactor(
	material: BaseMaterialInfo,
	isotope: IsotopeInfo,
	isoIndex: number
): number {
	const isoAll = isoGA(isotope);
	return Math.exp(-isoAll.decayConstant * material.decayTime);
}

function getShortDD(material: BaseMaterialInfo, isotope: IsotopeInfo, isoIndex: number): number {
	//=(EXP(decay constant*dead time seconds)-1)*(net counts/dead time seconds)/(1-EXP(-decay constant*live time))
	const isoAll = isoGA(isotope);
	const matAll = matGA(material);
	const decayConst = isoAll.decayConstant;
	const deadTimeSeconds = matAll.deadTime;
	if (deadTimeSeconds === 0) {
		return 0;
	}
	const first_factor = Math.exp(decayConst * deadTimeSeconds) - 1;
	const second_factor = getNetCountsAtIndex(material, isoIndex) / deadTimeSeconds;
	const third_factor = 1 - Math.exp(-decayConst * material.liveTime);
	if (third_factor === 0) {
		return 0;
	}
	return (first_factor * second_factor) / third_factor;
}

function getMixedDD(material: BaseMaterialInfo, isotope: IsotopeInfo, isoIndex: number): number {
	const isoAll = isoGA(isotope);
	// a = net counts * decay constant
	const a = getNetCountsAtIndex(material, isoIndex) * isoAll.decayConstant;
	// b = real time / live time
	if (material.liveTime === 0) {
		return 0;
	}
	const b = material.realTime / material.liveTime;
	// c = 1 - EXP(-decay constant * real time)
	const c = 1 - Math.exp(-isoAll.decayConstant * material.realTime);
	if (c === 0) {
		return 0;
	}
	return (a * b) / c;
}

function getSimpleDD(material: BaseMaterialInfo, isotope: IsotopeInfo, isoIndex: number): number {
	// (net counts)/(1-e^(-decay constant * live time))
	const isoAll = isoGA(isotope);
	const decayConst = isoAll.decayConstant;
	const denominator = 1 - Math.exp(-decayConst * material.liveTime);
	if (denominator === 0) {
		return 0;
	}
	return getNetCountsAtIndex(material, isoIndex) / denominator;
}

function getFuncDD(material: BaseMaterialInfo, isotope: IsotopeInfo, isoIndex: number): number {
	// This function uses the material's dead time property to decide which dead time correction to use.
	if (material.dtType === 'short') {
		return getShortDD(material, isotope, isoIndex);
	} else if (material.dtType === 'mixed') {
		return getMixedDD(material, isotope, isoIndex);
	} else if (material.dtType === 'simple') {
		return getSimpleDD(material, isotope, isoIndex);
	} else if (material.dtType === undefined) {
		// No dead time correction selected: use raw (positionally-corrected) net counts.
		// This is equivalent to applying a correction factor of 1, keeping the
		// comparative NAA formula well-defined when no correction type is chosen.
		return getNetCountsAtIndex(material, isoIndex);
	} else {
		throw new Error('Invalid dead time correction type specified in material.');
	}
}

export function getAll(
	material: BaseMaterialInfo,
	isotope: IsotopeInfo,
	isoIndex: number
): MaterialIsotopeComputed {
	return {
		saturationFactor: getSaturationFactor(material, isotope, isoIndex),
		decayCorrectionFactor: getDecayCorrectionFactor(material, isotope, isoIndex),
		shortDeadTimeCorrection: getShortDD(material, isotope, isoIndex),
		mixedDeadTimeCorrection: getMixedDD(material, isotope, isoIndex),
		simpleDeadTimeCorrection: getSimpleDD(material, isotope, isoIndex),
		funcDeadTimeCorrection: getFuncDD(material, isotope, isoIndex)
	};
}
