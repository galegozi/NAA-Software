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

function computeBackgroundCounts(material: object): number {
    const grossCounts = (material as any).grossCounts;
    const netCounts = (material as any).netCounts;
    return grossCounts - netCounts;
}

function computeColumnV(material: object): number {
    // TODO: ASK SOMEONE WHAT THIS IS???
    // '=2.71+4.65*SQRT(Bkgd)
    const backgroundCounts = computeBackgroundCounts(material);
    return 2.71 + 4.65 * Math.sqrt(backgroundCounts);
}

export function getAll(material: object) {
    return {
        deadTime: computeDeadTime(material),
        deadTimeFraction: computeDeadTimeFraction(material),
        backgroundCounts: computeBackgroundCounts(material),
        columnV: computeColumnV(material)
    };
}