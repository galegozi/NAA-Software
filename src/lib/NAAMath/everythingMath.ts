// These are computations that derive from everywhere, so multiple materials and isotopes.

import { getAll as matIsoGA } from './MaterialIsotopeMath.ts';
import { getAll as MMGA } from './MultiMaterialMath.ts';

function getSaturationFactorRatio(
    refMaterial: object,
    unkMaterial: object,
    isotope: object,
    isotopeIndex: number
): number {
    const isoMat = {
        reference: matIsoGA(refMaterial, isotope, isotopeIndex),
        unknown: matIsoGA(unkMaterial, isotope, isotopeIndex)
    };
    return (isoMat.reference as any).saturationFactor / (isoMat.unknown as any).saturationFactor;
}

function getDecayCorrectionFactorRatio(
    refMaterial: object,
    unkMaterial: object,
    isotope: object,
    isotopeIndex: number
): number {
    const isoMat = {
        reference: matIsoGA(refMaterial, isotope, isotopeIndex),
        unknown: matIsoGA(unkMaterial, isotope, isotopeIndex)
    };
    return (isoMat.reference as any).decayCorrectionFactor / (isoMat.unknown as any).decayCorrectionFactor;
}

function getDeadTimeCorrectionRatio(
    refMaterial: object,
    unkMaterial: object,
    isotope: object,
    isotopeIndex: number
): number {
    const isoMat = {
        reference: matIsoGA(refMaterial, isotope, isotopeIndex),
        unknown: matIsoGA(unkMaterial, isotope, isotopeIndex)
    };
    return (isoMat.unknown as any).funcDeadTimeCorrection / (isoMat.reference as any).funcDeadTimeCorrection;
}

function getUnknownConcentration(
    refMaterial: object,
    unkMaterial: object,
    isotope: object,
    isotopeIndex: number
): number {
    let multimaterial = MMGA(refMaterial, unkMaterial);
    console.log(JSON.stringify(multimaterial));
    let isoMat = {
        reference: matIsoGA(refMaterial, isotope, isotopeIndex),
        unknown: matIsoGA(unkMaterial, isotope, isotopeIndex)
    };
    console.log(JSON.stringify(isoMat));
    console.log(`Known concentration: ${(refMaterial as any).knownConcentration}`);
    let result = (refMaterial as any).knownConcentration[isotopeIndex] *
        getDeadTimeCorrectionRatio(refMaterial, unkMaterial, isotope, isotopeIndex) *
        getSaturationFactorRatio(refMaterial, unkMaterial, isotope, isotopeIndex)
        * getDecayCorrectionFactorRatio(refMaterial, unkMaterial, isotope, isotopeIndex)
        * multimaterial.massCorrection
        // fluence correction
        ;
    console.log(`Unknown concentration computed as: ${result}`);
    return result;
}

export function getAll(refMaterial: object, unkMaterial: object, isotope: object, isotopeIndex: number): object {
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
        unknownConcentration: getUnknownConcentration(
            refMaterial,
            unkMaterial,
            isotope,
            isotopeIndex
        )
    };
}