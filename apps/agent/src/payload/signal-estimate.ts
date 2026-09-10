import { createHash } from 'node:crypto';
import { USE_CASES, type SignalEstimate } from '@private-signal-swarm/types';

/**
 * Mock signal estimate: deterministic per (agentId, metricRef) so demos are
 * reproducible without an external data source. Replaced by real data later —
 * the SignalEstimate shape is the contract, not this function.
 */
export function estimateMock(agentId: string, metricRef: string): SignalEstimate {
  const digest = createHash('sha256').update(`${agentId}|${metricRef}`).digest();
  // Generate a value between 0 and 100 based on the hash
  const value = (digest[0] * 256 + digest[1]) % 10000 / 100;
  // Use a deterministic method hash
  const methodHash = createHash('sha256').update(`mock-method|${metricRef}`).digest('hex').slice(0, 16);

  return {
    metricRef,
    value,
    methodHash,
  };
}

export const SIGNAL_ESTIMATE_USE_CASE = USE_CASES.signalEstimate;
