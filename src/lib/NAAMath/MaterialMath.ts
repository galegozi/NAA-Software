// These are computations that derive from purely material attributes.

function computeDeadTime(material: object): number {
    const liveTime = (material as any).liveTime;
    const realTime = (material as any).realTime;
    return realTime - liveTime;
}

function computeDeadTimeFraction(material: object): number {
    const deadTime = computeDeadTime(material);
    const realTime = (material as any).realTime;
    return deadTime / realTime;
}

function computeBackgroundCounts(material: object): number[] {
    return (material as any).counts.map((c: any) => c.grossCounts - c.netCounts);
}

function computeDetectionLimit(material: object): number[] {
    const backgroundCounts = computeBackgroundCounts(material);
    return backgroundCounts.map(bc => 2.71 + 4.65 * Math.sqrt(bc));
}

export function getAll(material: object) {
    return {
        deadTime: computeDeadTime(material),
        deadTimeFraction: computeDeadTimeFraction(material),
        backgroundCounts: computeBackgroundCounts(material),
        detectionLimit: computeDetectionLimit(material)
    };
}