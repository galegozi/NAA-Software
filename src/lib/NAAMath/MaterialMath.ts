// These are computations that derive from purely material attributes.

import type { BaseMaterialInfo } from '../types.js';
import type { MaterialComputed } from './types.js';

function computeDeadTime(material: BaseMaterialInfo): number {
	const liveTime = material.liveTime;
	const realTime = material.realTime;
	return realTime - liveTime;
}

function computeDeadTimeFraction(material: BaseMaterialInfo): number {
	const deadTime = computeDeadTime(material);
	const realTime = material.realTime;
	return deadTime / realTime;
}

function computeBackgroundCounts(material: BaseMaterialInfo): number[] {
	return material.counts.map((c) => c.grossCounts - c.netCounts);
}

function computeDetectionLimit(material: BaseMaterialInfo): number[] {
	const backgroundCounts = computeBackgroundCounts(material);
	return backgroundCounts.map((bc) => 2.71 + 4.65 * Math.sqrt(bc));
}

export function getAll(material: BaseMaterialInfo): MaterialComputed {
	return {
		deadTime: computeDeadTime(material),
		deadTimeFraction: computeDeadTimeFraction(material),
		backgroundCounts: computeBackgroundCounts(material),
		detectionLimit: computeDetectionLimit(material)
	};
}