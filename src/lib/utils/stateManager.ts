/**
 * Composable for managing NAA application state
 * This provides a cleaner interface for state management
 */

import type { IsotopeInfo, ReferenceMaterial, UnknownMaterial } from '../types.js';
import { createIsotopeInfo, createReferenceMaterial, createUnknownMaterial } from './naaUtils.js';

export interface NAAState {
	step: number;
	isotopeCount: number;
	unknownCount: number;
	isotopeInfo: IsotopeInfo[];
	materials: {
		reference: ReferenceMaterial;
		unknown: UnknownMaterial[];
	};
}

/**
 * Create initial state
 */
export function createInitialState(): NAAState {
	return {
		step: 0,
		isotopeCount: 1,
		unknownCount: 1,
		isotopeInfo: [createIsotopeInfo()],
		materials: {
			reference: createReferenceMaterial(1),
			unknown: []
		}
	};
}

/**
 * Update isotope count and reinitialize related data
 */
export function updateIsotopeCount(state: NAAState, newCount: number): Partial<NAAState> {
	return {
		isotopeCount: newCount,
		isotopeInfo: Array.from({ length: newCount }, createIsotopeInfo),
		materials: {
			reference: {
				...state.materials.reference,
				...createReferenceMaterial(newCount)
			},
			unknown: state.materials.unknown.map((unk) => ({
				...unk,
				counts: Array.from({ length: newCount }, () => ({
					grossCounts: 0,
					netCounts: 0,
					uncertainty: 0
				}))
			}))
		}
	};
}

/**
 * Update unknown count and reinitialize related data
 */
export function updateUnknownCount(state: NAAState, newCount: number): Partial<NAAState> {
	return {
		unknownCount: newCount,
		materials: {
			...state.materials,
			unknown: Array.from({ length: newCount }, () => createUnknownMaterial(state.isotopeCount))
		}
	};
}

/**
 * Navigate to next step
 */
export function nextStep(state: NAAState): Partial<NAAState> {
	return { step: state.step + 1 };
}

/**
 * Navigate to previous step
 */
export function prevStep(state: NAAState): Partial<NAAState> {
	return { step: state.step - 1 };
}
