import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  ENVELOPE_VERSION,
  type AgentConfig,
  type EncryptedEnvelope,
} from '@private-signal-swarm/types';
import {
  loadKeymap,
  sealToEnclave,
  signEnvelope,
  type KeymapFile,
} from '@private-signal-swarm/confidential-core';

export class EnvelopeFactory {
  private keymap: KeymapFile;
  private readonly agentPriv: string;
  private readonly agentId: string;

  constructor(private readonly keymapPath: string, agentId: string, agentPriv: string) {
    this.keymap = loadKeymap(keymapPath);
    this.agentId = agentId;
    this.agentPriv = agentPriv;
  }

  get keyId(): string {
    return this.keymap.keyId;
  }

  reloadKeymap(): void {
    this.keymap = loadKeymap(this.keymapPath);
  }

  async createEnvelope(roundId: string, useCase: string, payload: unknown): Promise<EncryptedEnvelope> {
    const ciphertext = await sealToEnclave(JSON.stringify(payload), this.keymap.tee.encPub);
    const base = {
      version: ENVELOPE_VERSION,
      useCase,
      keyId: this.keymap.keyId,
      agentId: this.agentId,
      roundId,
      nonce: randomUUID(),
      ciphertext,
      timestamp: Date.now(),
    };
    const signature = await signEnvelope(this.agentPriv, base);
    return { ...base, signature };
  }
}

export function loadAgentPrivateKey(config: AgentConfig, keymapPath: string): string {
  const keymap = loadKeymap(keymapPath);
  if (config.agentPrivateKey) {
    return config.agentPrivateKey;
  }
  const secretsPath = keymapPath.replace('keymap.json', 'dev-secrets.json');
  if (!fs.existsSync(secretsPath)) {
    throw new Error(`Agent private key not found: set AGENT_PRIVATE_KEY or provide ${secretsPath}`);
  }
  const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8')) as {
    agents: Record<string, { signPriv: string }>;
  };
  const agent = secrets.agents[config.id];
  if (!agent) {
    throw new Error(`No dev secret for agent ${config.id} — run keygen with this agentId`);
  }
  return agent.signPriv;
}
