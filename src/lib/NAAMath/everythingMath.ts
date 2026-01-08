// These are computations that derive from everywhere, so multiple materials and isotopes.

import { getAll as matIsoGA } from './MaterialIsotopeMath.ts';
import { getAll as MMGA } from './MultiMaterialMath.ts';

function getSaturationFactorRatio(
    refMaterial: object,
    unkMaterial: object,
    isotope: object
): number {
    const isoMat = {
        reference: matIsoGA(refMaterial, isotope),
        unknown: matIsoGA(unkMaterial, isotope)
    };
    return (isoMat.reference as any).saturationFactor / (isoMat.unknown as any).saturationFactor;
}

function getDecayCorrectionFactorRatio(
    refMaterial: object,
    unkMaterial: object,
    isotope: object
): number {
    const isoMat = {
        reference: matIsoGA(refMaterial, isotope),
        unknown: matIsoGA(unkMaterial, isotope)
    };
    return (isoMat.reference as any).decayCorrectionFactor / (isoMat.unknown as any).decayCorrectionFactor;
}

function getDeadTimeCorrectionRatio(
    refMaterial: object,
    unkMaterial: object,
    isotope: object
): number {
    const isoMat = {
        reference: matIsoGA(refMaterial, isotope),
        unknown: matIsoGA(unkMaterial, isotope)
    };
    return (isoMat.unknown as any).funcDeadTimeCorrection / (isoMat.reference as any).funcDeadTimeCorrection;
}

function getUnknownConcentration(
    refMaterial: object,
    unkMaterial: object,
    isotope: object
): number {
    let multimaterial = MMGA(refMaterial, unkMaterial);
    let isoMat = {
        reference: matIsoGA(refMaterial, isotope),
        unknown: matIsoGA(unkMaterial, isotope)
    };
    return (refMaterial as any).knownConcentration *
        getDeadTimeCorrectionRatio(refMaterial, unkMaterial, isotope) *
        getSaturationFactorRatio(refMaterial, unkMaterial, isotope)
        * getDecayCorrectionFactorRatio(refMaterial, unkMaterial, isotope)
        * multimaterial.massCorrection
        // fluence correction
        ;
}

export function getAll(refMaterial: object, unkMaterial: object, isotope: object): object {
    return {
        saturationFactorRatio: getSaturationFactorRatio(
            refMaterial,
            unkMaterial,
            isotope
        ),
        deadTimeCorrectionRatio: getDeadTimeCorrectionRatio(
            refMaterial,
            unkMaterial,
            isotope
        ),
        decayCorrectionFactorRatio: getDecayCorrectionFactorRatio(
            refMaterial,
            unkMaterial,
            isotope
        ),
        unknownConcentration: getUnknownConcentration(
            refMaterial,
            unkMaterial,
            isotope
        )
    };
}