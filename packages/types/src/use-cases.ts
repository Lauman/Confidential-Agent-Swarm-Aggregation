import type { UseCaseId } from './envelope.js';

export const USE_CASES = {
  deliberation: 'deliberation.v1',
  signalEstimate: 'signal-estimate.v1',
} as const;

export interface DeliberationBallot {
  proposalRef: string;
  vote: 'support' | 'oppose' | 'abstain';
  confidence: number;
  rationaleRedacted?: string;
}

export interface DeliberationTally {
  support: number;
  oppose: number;
  abstain: number;
}

export type DeliberationVerdictKind = 'pass' | 'fail' | 'contested';

export interface DeliberationVerdict {
  proposalRef: string;
  verdict: DeliberationVerdictKind;
  participantCount: number;
  tally?: DeliberationTally;
}

export const DELIBERATION_MARGIN = 0.5;
export const MIN_COHORT_FOR_DETAIL = 5;

export type SignalEstimate = {
  metricRef: string;
  value: number;
  methodHash: string;
};

export type SignalAggregate = {
  metricRef: string;
  aggregate: number;
  participantCount: number;
  dispersion?: number;
};

export interface UseCaseResult {
  useCase: UseCaseId;
  payload: DeliberationVerdict | SignalAggregate;
}
