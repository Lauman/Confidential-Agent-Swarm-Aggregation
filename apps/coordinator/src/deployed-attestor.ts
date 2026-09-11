import { randomUUID } from 'node:crypto';
import {
  ENVELOPE_VERSION,
  type BatchRequest,
  type EncryptedEnvelope,
} from '@private-signal-swarm/types';
import {
  loadDevSecrets,
  openSealed,
  sealToEnclave,
  signEnvelope,
  type DevSecretsFile,
} from '@private-signal-swarm/confidential-core';
import { DeployedWorkflowTrigger } from './trigger-client.js';

export interface DeployedAttestorOptions {
  gatewayUrl: string;
  workflowId: string;
  signingKey: string;
  donTeeEncPub: string;
  devSecretsPath: string;
}

export class DeployedAttestor {
  private readonly trigger: DeployedWorkflowTrigger;
  private readonly donTeeEncPub: string;
  private readonly secrets: DevSecretsFile;

  constructor(options: DeployedAttestorOptions) {
    this.trigger = new DeployedWorkflowTrigger({
      gatewayUrl: options.gatewayUrl,
      workflowId: options.workflowId,
      signingKey: options.signingKey,
    });
    this.donTeeEncPub = options.donTeeEncPub;
    this.secrets = loadDevSecrets(options.devSecretsPath);
  }

  get signerAddress(): string {
    return this.trigger.address;
  }

  async attest(batch: BatchRequest): Promise<string | undefined> {
    const envelopes: EncryptedEnvelope[] = [];
    for (const envelope of batch.envelopes) {
      const plaintext = await openSealed(
        envelope.ciphertext,
        this.secrets.tee.publicKey,
        this.secrets.tee.encPriv
      );
      const signPriv = this.secrets.agents[envelope.agentId]?.signPriv;
      if (!signPriv) {
        throw new Error(`No dev sign key for ${envelope.agentId}`);
      }
      const base = {
        version: ENVELOPE_VERSION,
        useCase: envelope.useCase,
        keyId: envelope.keyId,
        agentId: envelope.agentId,
        roundId: envelope.roundId,
        nonce: randomUUID(),
        ciphertext: await sealToEnclave(plaintext, this.donTeeEncPub),
        timestamp: Date.now(),
      };
      envelopes.push({ ...base, signature: await signEnvelope(signPriv, base) });
    }
    const submit = await this.trigger.execute({
      roundId: batch.roundId,
      useCase: batch.useCase,
      keyId: batch.keyId,
      envelopes,
    });
    if (!submit.accepted) {
      throw new Error(`Deployed workflow trigger not ACCEPTED: ${JSON.stringify(submit.body).slice(0, 300)}`);
    }
    return submit.executionId;
  }
}
