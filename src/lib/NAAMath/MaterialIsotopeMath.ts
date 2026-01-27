// These are computations that derive from attributes of an isotope and a single material.

import type { IsotopeInfo, BaseMaterialInfo } from '../types.js';
import type { MaterialIsotopeComputed } from './types.js';
import { getAll as isoGA } from './isotopeMath.ts';
import { getAll as matGA } from './MaterialMath.ts';

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
	const first_factor = Math.exp(decayConst * deadTimeSeconds) - 1;
	const second_factor = material.counts[isoIndex].netCounts / deadTimeSeconds;
	const third_factor = 1 - Math.exp(-decayConst * material.liveTime);
	return (first_factor * second_factor) / third_factor;
}

function getMixedDD(material: BaseMaterialInfo, isotope: IsotopeInfo, isoIndex: number): number {
	const isoAll = isoGA(isotope);
	// a = net counts * decay constant
	const a = material.counts[isoIndex].netCounts * isoAll.decayConstant;
	// b = real time / live time
	const b = material.realTime / material.liveTime;
	// c = 1 - EXP(-decay constant * real time)
	const c = 1 - Math.exp(-isoAll.decayConstant * material.realTime);
	return (a * b) / c;
}

function getSimpleDD(material: BaseMaterialInfo, isotope: IsotopeInfo, isoIndex: number): number {
	// (net counts)/(1-e^(-decay constant * live time))
	const isoAll = isoGA(isotope);
	const decayConst = isoAll.decayConstant;
	const denominator = 1 - Math.exp(-decayConst * material.liveTime);
	return material.counts[isoIndex].netCounts / denominator;
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
		return 0;
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
