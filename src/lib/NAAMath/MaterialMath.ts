// These are computations that derive from purely material attributes.

import type { BaseMaterialInfo } from '../types.js';
import type { MaterialComputed } from './types.js';

function getFactor(value: number | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}

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
	return material.counts.map(
		(c) =>
			c.grossCounts * getFactor(c.grossCountsPositionalCorrectionFactor) -
			c.netCounts * getFactor(c.netCountsPositionalCorrectionFactor)
	);
}

function computeDetectionLimit(material: BaseMaterialInfo): number[] {
	const backgroundCounts = computeBackgroundCounts(material);
	return backgroundCounts.map((bc) => 2.71 + 4.65 * Math.sqrt(bc));
}

function computeCountUncertaintyPercent(material: BaseMaterialInfo): number[] {
	// uncertainty / net counts * 100
	return material.counts.map(
		(c) =>
			((c.uncertainty * getFactor(c.uncertaintyPositionalCorrectionFactor)) /
				(c.netCounts * getFactor(c.netCountsPositionalCorrectionFactor))) *
			100
	);
}

export function getAll(material: BaseMaterialInfo): MaterialComputed {
	return {
		deadTime: computeDeadTime(material),
		deadTimeFraction: computeDeadTimeFraction(material),
		backgroundCounts: computeBackgroundCounts(material),
		detectionLimit: computeDetectionLimit(material),
		countUncertaintyPercent: computeCountUncertaintyPercent(material)
	};
}
