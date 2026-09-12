import type {
  BatchRequest,
  EncryptedEnvelope,
  RoundRecord,
  SubmittedAgent,
  TeeSignedResult,
} from '@private-signal-swarm/types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EnvelopeValidationError } from './envelope-validator.js';
import { computeBatchHash, computeEnvelopeHash, TombstoneStore } from './tombstone-store.js';
import type { TeeSeam } from './tee-seam.js';

interface OpenRound {
  roundId: string;
  useCase: string;
  quorum: number;
  submissions: Map<string, EncryptedEnvelope>;
  meta: Map<string, SubmittedAgent>;
  nonces: Set<string>;
}

export type SubmitOutcome =
  | { status: 'accepted'; submissionCount: number; quorum: number }
  | { status: 'quorum-reached'; result: TeeSignedResult };

export interface RoundManagerOptions {
  quorum: number;
  teeSeam: TeeSeam;
  store: TombstoneStore;
  keyId: string;
  onResult?: (result: TeeSignedResult) => void;
  deployedAttestor?: { attest(batch: BatchRequest): Promise<string | undefined> };
}

export class RoundManager {
  private readonly openRounds = new Map<string, OpenRound>();
  private readonly quorum: number;
  private readonly teeSeam: TeeSeam;
  private readonly store: TombstoneStore;
  private readonly keyId: string;
  private readonly onResult?: (result: TeeSignedResult) => void;
  private readonly deployedAttestor?: { attest(batch: BatchRequest): Promise<string | undefined> };
  private readonly currentRoundByUseCase = new Map<string, string>();

  constructor(options: RoundManagerOptions) {
    this.quorum = options.quorum;
    this.teeSeam = options.teeSeam;
    this.store = options.store;
    this.keyId = options.keyId;
    this.onResult = options.onResult;
    this.deployedAttestor = options.deployedAttestor;
  }

  getCurrentRoundId(useCase: string): string {
    const existing = this.currentRoundByUseCase.get(useCase);
    if (existing && !this.store.isClosed(existing) && this.openRounds.has(existing)) {
      return existing;
    }
    return this.createFreshRoundId(useCase);
  }

  /**
   * Always mints a new open round and points the useCase at it. Used by the
   * demo theater endpoint so a retry never re-pins a dirty partial round
   * (e.g. one holding a stray agent-1 submit) and deadlocks on
   * already-submitted. Superseded partial rounds stay open (not deleted) so
   * in-flight real submissions to the old roundId still validate.
   */
  createFreshRoundId(useCase: string): string {
    const roundId = `round-${useCase}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.openRounds.set(roundId, {
      roundId,
      useCase,
      quorum: this.quorum,
      submissions: new Map(),
      meta: new Map(),
      nonces: new Set(),
    });
    this.currentRoundByUseCase.set(useCase, roundId);
    return roundId;
  }

  /**
   * Theater-only recovery: drops the current open round (e.g. stuck at 1/3
   * after a failed demo run) and mints a fresh one. Never touches tombstoned
   * closed rounds or results.
   */
  abandonCurrentRound(useCase: string): { abandoned?: string; fresh: string } {
    const existing = this.currentRoundByUseCase.get(useCase);
    let abandoned: string | undefined;
    if (existing && this.openRounds.has(existing)) {
      this.openRounds.delete(existing);
      abandoned = existing;
    }
    this.currentRoundByUseCase.delete(useCase);
    return { abandoned, fresh: this.createFreshRoundId(useCase) };
  }

  getCurrentRound(useCase: string): RoundRecord {
    const roundId = this.getCurrentRoundId(useCase);
    const record = this.getRoundRecord(roundId);
    if (!record) {
      throw new Error(`Current round ${roundId} has no record`);
    }
    return record;
  }

  async handleSubmit(envelope: EncryptedEnvelope): Promise<SubmitOutcome> {
    if (this.store.isClosed(envelope.roundId)) {
      throw new EnvelopeValidationError('round-closed', `Round ${envelope.roundId} is closed`);
    }

    const round = this.openRounds.get(envelope.roundId);
    if (!round) {
      throw new EnvelopeValidationError('round-closed', `Unknown round: ${envelope.roundId}`);
    }

    if (round.submissions.has(envelope.agentId)) {
      throw new EnvelopeValidationError(
        'already-submitted',
        `Agent ${envelope.agentId} already submitted to round ${envelope.roundId}`
      );
    }

    if (round.nonces.has(envelope.nonce)) {
      throw new EnvelopeValidationError('duplicate-nonce', `Nonce replay detected in round ${envelope.roundId}`);
    }

    round.submissions.set(envelope.agentId, envelope);
    round.nonces.add(envelope.nonce);
    round.meta.set(envelope.agentId, {
      agentId: envelope.agentId,
      envelopeHash: computeEnvelopeHash(envelope.ciphertext),
      submittedAt: Date.now(),
    });

    if (round.submissions.size < round.quorum) {
      return { status: 'accepted', submissionCount: round.submissions.size, quorum: round.quorum };
    }

    const result = await this.aggregateRound(round);
    return { status: 'quorum-reached', result };
  }

  private submittedList(round: OpenRound): SubmittedAgent[] {
    return Array.from(round.meta.values()).sort((a, b) => a.submittedAt - b.submittedAt);
  }

  private async aggregateRound(round: OpenRound): Promise<TeeSignedResult> {
    const envelopes = Array.from(round.submissions.values());
    const batchHash = computeBatchHash({ keyId: this.keyId }, envelopes);

    this.store.closeRound(round.roundId, round.useCase, envelopes.length, batchHash, this.submittedList(round));
    this.openRounds.delete(round.roundId);
    if (this.currentRoundByUseCase.get(round.useCase) === round.roundId) {
      this.currentRoundByUseCase.delete(round.useCase);
    }

    const batch: BatchRequest = {
      roundId: round.roundId,
      useCase: round.useCase,
      keyId: this.keyId,
      envelopes,
    };

    // Debug-only escape hatch for end-to-end CRE probes: dump the exact
    // batch handed to the TEE seam so `cre workflow simulate` can replay the
    // live round. OFF by default — the coordinator stays blind otherwise.
    // Never set COORDINATOR_DEBUG_DUMP_DIR in production.
    const dumpDir = process.env.COORDINATOR_DEBUG_DUMP_DIR;
    if (dumpDir) {
      fs.mkdirSync(dumpDir, { recursive: true });
      const dumpPath = path.join(dumpDir, `${round.roundId}.batch.json`);
      fs.writeFileSync(dumpPath, JSON.stringify(batch, null, 2));
      console.log(`[coordinator] debug batch dumped: ${dumpPath}`);
    }

    const result = await this.teeSeam.process(
      {
        roundId: batch.roundId,
        useCase: batch.useCase,
        batchHash,
        envelopes: batch.envelopes,
      },
      this.keyId
    );

    this.store.recordResult(result);
    this.onResult?.(result);
    if (this.deployedAttestor) {
      const attestor = this.deployedAttestor;
      void attestor
        .attest(batch)
        .then((executionId) => {
          console.log(`[coordinator] DON execution triggered for ${batch.roundId}: ${executionId ?? '(no execution id)'}`);
        })
        .catch((error) => {
          console.error(`[coordinator] DON trigger failed for ${batch.roundId}: ${error instanceof Error ? error.message : error}`);
        });
    }
    return result;
  }

  getRoundRecord(roundId: string): RoundRecord | undefined {
    const closed = this.store.getClosedRound(roundId);
    if (closed) {
      return {
        roundId,
        useCase: closed.useCase,
        quorum: this.quorum,
        status: 'aggregated',
        submissionCount: closed.submissionCount,
        submittedAgents: closed.submittedAgents,
        batchHash: closed.batchHash,
        closedAt: closed.closedAt,
      };
    }
    const open = this.openRounds.get(roundId);
    if (!open) {
      return undefined;
    }
    return {
      roundId,
      useCase: open.useCase,
      quorum: open.quorum,
      status: 'collecting',
      submissionCount: open.submissions.size,
      submittedAgents: this.submittedList(open),
    };
  }

  getLatestResult(useCase: string): TeeSignedResult | undefined {
    return this.store.getLatestResult(useCase);
  }

  listRecentRounds(limit = 5): RoundRecord[] {
    return this.store.listClosedRounds(limit).map((closed) => ({
      roundId: closed.roundId,
      useCase: closed.useCase,
      quorum: this.quorum,
      status: 'aggregated' as const,
      submissionCount: closed.submissionCount,
      submittedAgents: closed.submittedAgents,
      batchHash: closed.batchHash,
      closedAt: closed.closedAt,
    }));
  }
}
