import {
  DELIBERATION_MARGIN,
  MIN_COHORT_FOR_DETAIL,
  USE_CASES,
  type DeliberationBallot,
  type DeliberationTally,
  type DeliberationVerdict,
} from '@private-signal-swarm/types';
import { z } from 'zod';
import type { UseCaseModule } from './types.js';

export const ballotSchema = z.object({
  proposalRef: z.string().min(1),
  vote: z.enum(['support', 'oppose', 'abstain']),
  confidence: z.number().min(0).max(1),
  rationaleRedacted: z.string().optional(),
});

export class IncoherentBatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncoherentBatchError';
  }
}

export function tallyBallots(ballots: DeliberationBallot[]): DeliberationVerdict {
  // Coherence guard: the (blind) coordinator cannot see proposalRefs, so the
  // enclave must refuse to tally ballots that deliberate on different
  // proposals. A poisoned round aborts with no result — never a partial one.
  const refs = new Set(ballots.map((b) => b.proposalRef));
  if (refs.size > 1) {
    throw new IncoherentBatchError(
      `Batch mixes ${refs.size} proposalRefs: ${Array.from(refs).join(', ')}`
    );
  }

  const w: DeliberationTally = { support: 0, oppose: 0, abstain: 0 };
  for (const b of ballots) {
    w[b.vote] += b.confidence;
  }
  const total = w.support + w.oppose + w.abstain;
  const net = total > 0 ? (w.support - w.oppose) / total : 0;

  let verdict: DeliberationVerdict['verdict'];
  if (net >= DELIBERATION_MARGIN) {
    verdict = 'pass';
  } else if (net <= -DELIBERATION_MARGIN) {
    verdict = 'fail';
  } else {
    verdict = 'contested';
  }

  const output: DeliberationVerdict = {
    proposalRef: ballots[0]?.proposalRef ?? '',
    verdict,
    participantCount: ballots.length,
  };

  if (ballots.length >= MIN_COHORT_FOR_DETAIL) {
    output.tally = w;
  }

  return output;
}

export const deliberationModule: UseCaseModule<DeliberationBallot> = {
  id: USE_CASES.deliberation,
  payloadSchema: ballotSchema,
  aggregate(roundId: string, payloads: DeliberationBallot[]): unknown {
    return {
      roundId,
      ...tallyBallots(payloads),
    };
  },
};
