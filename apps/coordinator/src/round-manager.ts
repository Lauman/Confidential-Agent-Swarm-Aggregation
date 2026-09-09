import type {
  BatchRequest,
  EncryptedEnvelope,
  RoundRecord,
  TeeSignedResult,
} from '@private-signal-swarm/types';
import { EnvelopeValidationError } from './envelope-validator.js';
import { computeBatchHash, TombstoneStore } from './tombstone-store.js';
import type { TeeSeam } from './tee-seam.js';

interface OpenRound {
  roundId: string;
  useCase: string;
  quorum: number;
  submissions: Map<string, EncryptedEnvelope>;
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
}

export class RoundManager {
  private readonly openRounds = new Map<string, OpenRound>();
  private readonly quorum: number;
  private readonly teeSeam: TeeSeam;
  private readonly store: TombstoneStore;
  private readonly keyId: string;
  private readonly onResult?: (result: TeeSignedResult) => void;
  private readonly currentRoundByUseCase = new Map<string, string>();

  constructor(options: RoundManagerOptions) {
    this.quorum = options.quorum;
    this.teeSeam = options.teeSeam;
    this.store = options.store;
    this.keyId = options.keyId;
    this.onResult = options.onResult;
  }

  getCurrentRoundId(useCase: string): string {
    const existing = this.currentRoundByUseCase.get(useCase);
    if (existing && !this.store.isClosed(existing) && this.openRounds.has(existing)) {
      return existing;
    }
    const roundId = `round-${useCase}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.openRounds.set(roundId, {
      roundId,
      useCase,
      quorum: this.quorum,
      submissions: new Map(),
      nonces: new Set(),
    });
    this.currentRoundByUseCase.set(useCase, roundId);
    return roundId;
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

    if (round.submissions.size < round.quorum) {
      return { status: 'accepted', submissionCount: round.submissions.size, quorum: round.quorum };
    }

    const result = await this.aggregateRound(round);
    return { status: 'quorum-reached', result };
  }

  private async aggregateRound(round: OpenRound): Promise<TeeSignedResult> {
    const envelopes = Array.from(round.submissions.values());
    const batchHash = computeBatchHash({ keyId: this.keyId }, envelopes);

    this.store.closeRound(round.roundId, round.useCase, envelopes.length, batchHash);
    this.openRounds.delete(round.roundId);
    this.currentRoundByUseCase.delete(round.useCase);

    const batch: BatchRequest = {
      roundId: round.roundId,
      useCase: round.useCase,
      keyId: this.keyId,
      envelopes,
    };

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
    };
  }

  getLatestResult(useCase: string): TeeSignedResult | undefined {
    return this.store.getLatestResult(useCase);
  }
}
