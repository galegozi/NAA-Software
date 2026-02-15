// These are computations that derive from attributes of multiple materials.

import type { BaseMaterialInfo } from '../types.js';
import type { MultiMaterialComputed } from './types.js';

function getMassCorrection(reference: BaseMaterialInfo, unknown: BaseMaterialInfo): number {
	return reference.mass / unknown.mass;
}

function getFluenceCorrection(reference: BaseMaterialInfo, unknown: BaseMaterialInfo): number {
	return reference.fluence / unknown.fluence;
}

export function getAll(
	reference: BaseMaterialInfo,
	unknown: BaseMaterialInfo
): MultiMaterialComputed {
	return {
		massCorrection: getMassCorrection(reference, unknown),
		fluenceCorrection: getFluenceCorrection(reference, unknown)
	};
}
