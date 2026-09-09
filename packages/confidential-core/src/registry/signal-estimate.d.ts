import { type SignalAggregate, type SignalEstimate } from '@private-signal-swarm/types';
import { z } from 'zod';
import type { UseCaseModule } from './types.js';
export declare const signalEstimateSchema: z.ZodObject<{
    metricRef: z.ZodString;
    value: z.ZodNumber;
    methodHash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: number;
    metricRef: string;
    methodHash: string;
}, {
    value: number;
    metricRef: string;
    methodHash: string;
}>;
export declare function aggregateSignal(roundId: string, estimates: SignalEstimate[]): SignalAggregate;
export declare const signalEstimateModule: UseCaseModule<SignalEstimate>;
//# sourceMappingURL=signal-estimate.d.ts.map