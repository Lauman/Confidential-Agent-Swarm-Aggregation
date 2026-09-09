import { type DeliberationBallot, type DeliberationVerdict } from '@private-signal-swarm/types';
import { z } from 'zod';
import type { UseCaseModule } from './types.js';
export declare const ballotSchema: z.ZodObject<{
    proposalRef: z.ZodString;
    vote: z.ZodEnum<["support", "oppose", "abstain"]>;
    confidence: z.ZodNumber;
    rationaleRedacted: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    proposalRef: string;
    vote: "support" | "oppose" | "abstain";
    confidence: number;
    rationaleRedacted?: string | undefined;
}, {
    proposalRef: string;
    vote: "support" | "oppose" | "abstain";
    confidence: number;
    rationaleRedacted?: string | undefined;
}>;
export declare function tallyBallots(ballots: DeliberationBallot[]): DeliberationVerdict;
export declare const deliberationModule: UseCaseModule<DeliberationBallot>;
//# sourceMappingURL=deliberation.d.ts.map