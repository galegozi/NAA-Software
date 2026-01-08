// This is all computations that derive purely from isotope attributes.

function getDecayConstant(halfLife: number): number {
	return Math.log(2) / halfLife;
}

export function getAll(isotope: object): object {
    return {
        decayConstant: getDecayConstant((isotope as any).halfLife)
    };
}