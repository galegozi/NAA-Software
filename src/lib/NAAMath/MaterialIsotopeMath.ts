// These are computeations that derive from attributes of an isotope and a single material.

import { getAll as isoGA } from './isotopeMath.ts';
import { getAll as matGA } from './MaterialMath.ts';

// function getSaturationFactor(halfLife: number, irradiationTime: number): number {
// 	const decayConst = (isoGA({ halfLife }) as any).decayConstant;
// 	return 1 - Math.exp(-decayConst * irradiationTime);
// }

function getSaturationFactor(material: object, isotope: object): number {
    let isoAll = isoGA(isotope);
    return 1 - Math.exp(-(isoAll as any).decayConstant * (material as any).irradiationTime);
}

function getDecayCorrectionFactor(material: object, isotope: object): number {
    let isoAll = isoGA(isotope);
    return Math.exp(-(isoAll as any).decayConstant * (material as any).decayTime);
}

function getShortDD(material: object, isotope: object): number {
    //=(EXP(decay constant*dead time seconds)-1)*(net counts/dead time seconds)/(1-EXP(-decay constant*live time))
    let isoAll = isoGA(isotope);
    let matAll = matGA(material);
    const decayConst = (isoAll as any).decayConstant;
    const deadTimeSeconds = matAll.deadTime;
    let first_factor = Math.exp(decayConst * deadTimeSeconds) - 1;
    let second_factor = (matAll.backgroundCounts) / deadTimeSeconds;
    let third_factor = 1 - Math.exp(-decayConst * (material as any).liveTime);
    return first_factor * second_factor / third_factor;
}

function getMixedDD(material: object, isotope: object): number {
    let isoAll = isoGA(isotope);
    let matAll = matGA(material);
    // a = net counts * decay constant
    let a = (material as any).netCounts * (isoAll as any).decayConstant;
    // b = real time / live time
    let b = (material as any).realTime / (material as any).liveTime;
    // c = 1 - EXP(-decay constant * real time)
    let c = 1 - Math.exp(-(isoAll as any).decayConstant * (material as any).realTime);
    return a * b / c;
}

function getFuncDD(material: object, isotope: object): number {
    // This function uses the material's dead time property to decide which dead time correction to use.
    if ((material as any).deadTimeType === 'short') {
        return getShortDD(material, isotope);
    }
    else if ((material as any).deadTimeType === 'mixed') {
        return getMixedDD(material, isotope);
    }
    else if ((material as any).deadTimeType === undefined) {
        return 0;
    }
    else {
        throw new Error('Invalid dead time correction type specified in material.');
    }
}

export function getAll(material: object, isotope: object): object {
    return {
        saturationFactor: getSaturationFactor(material, isotope),
        decayCorrectionFactor: getDecayCorrectionFactor(material, isotope),
        shortDeadTimeCorrection: getShortDD(material, isotope),
        mixedDeadTimeCorrection: getMixedDD(material, isotope),
        funcDeadTimeCorrection: getFuncDD(material, isotope)
    };
}