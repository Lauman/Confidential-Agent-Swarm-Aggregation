import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SubmittedAgent, TeeSignedResult } from '@private-signal-swarm/types';
import type { KeymapFile } from '@private-signal-swarm/confidential-core';

export interface ClosedRoundRecord {
  useCase: string;
  submissionCount: number;
  submittedAgents: SubmittedAgent[];
  batchHash: string;
  closedAt: number;
}

export interface CoordinatorState {
  closedRounds: Record<string, ClosedRoundRecord>;
  results: Record<string, TeeSignedResult[]>;
}

const MAX_RESULTS_PER_USE_CASE = 10;

export class TombstoneStore {
  private readonly statePath: string;
  private state: CoordinatorState;

  constructor(stateDir: string) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.statePath = path.join(stateDir, 'coordinator-state.json');
    this.state = this.load();
  }

  private load(): CoordinatorState {
    if (!fs.existsSync(this.statePath)) {
      return { closedRounds: {}, results: {} };
    }
    return JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as CoordinatorState;
  }

  private persist(): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  isClosed(roundId: string): boolean {
    return roundId in this.state.closedRounds;
  }

  closeRound(
    roundId: string,
    useCase: string,
    submissionCount: number,
    batchHash: string,
    submittedAgents: SubmittedAgent[]
  ): void {
    this.state.closedRounds[roundId] = { useCase, submissionCount, submittedAgents, batchHash, closedAt: Date.now() };
    this.persist();
  }

  getClosedRound(roundId: string): ClosedRoundRecord | undefined {
    const record = this.state.closedRounds[roundId];
    if (!record) {
      return undefined;
    }
    // Backward compatibility with state files written before submittedAgents existed.
    return { ...record, submittedAgents: record.submittedAgents ?? [] };
  }

  recordResult(result: TeeSignedResult): void {
    const list = this.state.results[result.useCase] ?? [];
    list.push(result);
    this.state.results[result.useCase] = list.slice(-MAX_RESULTS_PER_USE_CASE);
    this.persist();
  }

  getLatestResult(useCase: string): TeeSignedResult | undefined {
    const list = this.state.results[useCase];
    if (!list || list.length === 0) {
      return undefined;
    }
    return list.reduce((latest, r) => (r.timestamp >= latest.timestamp ? r : latest));
  }

  listClosedRounds(limit = 5): Array<ClosedRoundRecord & { roundId: string }> {
    return Object.entries(this.state.closedRounds)
      .map(([roundId, record]) => ({ roundId, ...record }))
      .sort((a, b) => b.closedAt - a.closedAt)
      .slice(0, Math.max(0, limit));
  }
}

export function computeBatchHash(keymap: Pick<KeymapFile, 'keyId'>, envelopes: readonly { agentId: string; nonce: string; ciphertext: string }[]): string {
  const canonical = [keymap.keyId, ...envelopes.map((e) => `${e.agentId}|${e.nonce}|${e.ciphertext}`)].join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function computeEnvelopeHash(ciphertext: string): string {
  return crypto.createHash('sha256').update(ciphertext, 'utf8').digest('hex');
}
