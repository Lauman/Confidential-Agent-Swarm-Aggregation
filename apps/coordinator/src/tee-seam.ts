import type { BatchHandoff, TeeSignedResult } from '@private-signal-swarm/types';
import {
  loadDevSecrets,
  processBatch,
  type DevSecretsFile,
} from '@private-signal-swarm/confidential-core';

export interface TeeSeam {
  process(batch: BatchHandoff, keyId: string): Promise<TeeSignedResult>;
}

export class TeeSeamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeeSeamError';
  }
}

/**
 * Dev-mode simulate runner: executes the SAME process-batch handler code that
 * runs inside the CRE workflow TEE (decrypt → registry dispatch → suppression
 * → tally → sign), locally, against dev secrets. The `cre workflow simulate`
 * run remains the judge-facing proof of confidential execution; this seam is
 * what the E2E wire-up uses when no deployed workflow is available.
 */
export class LocalTeeRunner implements TeeSeam {
  private readonly secrets: DevSecretsFile;

  constructor(devSecretsPath: string) {
    this.secrets = loadDevSecrets(devSecretsPath);
  }

  async process(batch: BatchHandoff, keyId: string): Promise<TeeSignedResult> {
    if (batch.envelopes.some((e) => e.keyId !== this.secrets.keyId || e.keyId !== keyId)) {
      throw new TeeSeamError('Batch keyId does not match TEE secrets');
    }
    return processBatch(
      {
        roundId: batch.roundId,
        useCase: batch.useCase,
        keyId,
        envelopes: batch.envelopes,
      },
      {
        teeEncPub: this.secrets.tee.publicKey,
        teeEncPriv: this.secrets.tee.encPriv,
        teeSignPriv: this.secrets.tee.signPriv,
      }
    );
  }
}
