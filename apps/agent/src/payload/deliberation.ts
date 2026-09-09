import { createHash } from 'node:crypto';
import { USE_CASES, type DeliberationBallot } from '@private-signal-swarm/types';

/**
 * Mock deliberation: deterministic per (agentId, proposalRef) so demos are
 * reproducible without an external LLM. Replaced by real reasoning later —
 * the ballot shape is the contract, not this function.
 */
export function deliberateMock(agentId: string, proposalRef: string): DeliberationBallot {
  const digest = createHash('sha256').update(`${agentId}|${proposalRef}`).digest();
  const bucket = digest[0] % 10;
  const confidence = 0.5 + (digest[1] % 50) / 100;

  let vote: DeliberationBallot['vote'];
  if (bucket < 6) {
    vote = 'support';
  } else if (bucket < 8) {
    vote = 'oppose';
  } else {
    vote = 'abstain';
  }

  return {
    proposalRef,
    vote,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export const DELIBERATION_USE_CASE = USE_CASES.deliberation;
