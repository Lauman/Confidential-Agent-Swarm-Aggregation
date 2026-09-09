import { USE_CASES } from '@private-signal-swarm/types';
import { z } from 'zod';
export const signalEstimateSchema = z.object({
    metricRef: z.string().min(1),
    value: z.number(),
    methodHash: z.string().min(1),
});
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function trimmedMean(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const trim = Math.floor(sorted.length / 5);
    const kept = sorted.slice(trim, sorted.length - trim);
    return kept.reduce((a, b) => a + b, 0) / kept.length;
}
function iqr(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q = (p) => {
        const pos = (sorted.length - 1) * p;
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    return q(0.75) - q(0.25);
}
export function aggregateSignal(roundId, estimates) {
    const values = estimates.map((e) => e.value);
    const largeCohort = values.length >= 5;
    const output = {
        metricRef: estimates[0]?.metricRef ?? '',
        aggregate: largeCohort ? trimmedMean(values) : median(values),
        participantCount: values.length,
    };
    if (largeCohort) {
        output.dispersion = iqr(values);
    }
    return {
        roundId,
        ...output,
    };
}
export const signalEstimateModule = {
    id: USE_CASES.signalEstimate,
    payloadSchema: signalEstimateSchema,
    aggregate: aggregateSignal,
};
//# sourceMappingURL=signal-estimate.js.map