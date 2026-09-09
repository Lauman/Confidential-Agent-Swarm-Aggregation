import { DELIBERATION_MARGIN, MIN_COHORT_FOR_DETAIL, USE_CASES, } from '@private-signal-swarm/types';
import { z } from 'zod';
export const ballotSchema = z.object({
    proposalRef: z.string().min(1),
    vote: z.enum(['support', 'oppose', 'abstain']),
    confidence: z.number().min(0).max(1),
    rationaleRedacted: z.string().optional(),
});
export function tallyBallots(ballots) {
    const w = { support: 0, oppose: 0, abstain: 0 };
    for (const b of ballots) {
        w[b.vote] += b.confidence;
    }
    const total = w.support + w.oppose + w.abstain;
    const net = total > 0 ? (w.support - w.oppose) / total : 0;
    let verdict;
    if (net >= DELIBERATION_MARGIN) {
        verdict = 'pass';
    }
    else if (net <= -DELIBERATION_MARGIN) {
        verdict = 'fail';
    }
    else {
        verdict = 'contested';
    }
    const output = {
        proposalRef: ballots[0]?.proposalRef ?? '',
        verdict,
        participantCount: ballots.length,
    };
    if (ballots.length >= MIN_COHORT_FOR_DETAIL) {
        output.tally = w;
    }
    return output;
}
export const deliberationModule = {
    id: USE_CASES.deliberation,
    payloadSchema: ballotSchema,
    aggregate(roundId, payloads) {
        return {
            roundId,
            ...tallyBallots(payloads),
        };
    },
};
//# sourceMappingURL=deliberation.js.map