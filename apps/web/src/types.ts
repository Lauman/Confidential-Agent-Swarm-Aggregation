export interface SubmittedAgentView {
  agentId: string;
  envelopeHash: string;
  submittedAt: number;
}

export interface RoundView {
  roundId: string;
  useCase: string;
  quorum: number;
  status: 'collecting' | 'aggregated' | 'closed' | 'failed';
  submissionCount: number;
  submittedAgents: SubmittedAgentView[];
  batchHash?: string;
  closedAt?: number;
}

export type VerdictKind = 'pass' | 'fail' | 'contested';

export interface VerdictView {
  version: number;
  useCase: string;
  roundId: string;
  participantCount: number;
  timestamp: number;
  payload: {
    proposalRef: string;
    verdict: VerdictKind;
    participantCount: number;
  };
  teeSignature: string;
}

export interface StatusEntry {
  useCase: string;
  roundId: string;
  timestamp: number;
  participantCount: number;
}

export const PRESET_PROPOSALS = [
  { ref: 'dao-grants-007', label: 'Grants round 7', expect: 'pass' as VerdictKind },
  { ref: 'dao-treasury-001', label: 'Treasury rebalance', expect: 'contested' as VerdictKind },
];

export const CHECKPOINT_TX = '0.0.7162784-1788987812-939625135';
export const hashscanTxUrl = (tx: string) =>
  `https://hashscan.io/testnet/transaction/${tx.replace('@', '-')}`;
