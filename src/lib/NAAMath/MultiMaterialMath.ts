// These are computations that derive from attributes of multiple materials.

function getMassCorrection(reference: object, unknown: object): number {
    return (reference as any).mass / (unknown as any).mass
}

export function getAll(reference: object, unknown: object) {
    return {
        massCorrection: getMassCorrection(reference, unknown)
    }
}