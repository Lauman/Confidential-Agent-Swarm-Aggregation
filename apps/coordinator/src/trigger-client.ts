import { createHash, randomUUID } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

export interface TriggerBatch {
  roundId: string;
  useCase: string;
  keyId: string;
  envelopes: unknown[];
}

export interface DeployedTriggerConfig {
  gatewayUrl: string;
  workflowId: string;
  /** 0x-prefixed ECDSA key matching one of the workflow's authorizedKeys */
  signingKey: string;
}

export interface TriggerResult {
  accepted: boolean;
  executionId?: string;
  body: unknown;
}

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return Buffer.from(binary, 'binary').toString('base64url');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

export function addressOf(signingKey: string): string {
  const priv = Uint8Array.from(Buffer.from(signingKey.replace(/^0x/, ''), 'hex'));
  const pub = secp256k1.getPublicKey(priv, false).slice(1);
  return `0x${Buffer.from(keccak_256(pub)).toString('hex').slice(-40)}`;
}

export class DeployedWorkflowTrigger {
  private readonly gatewayUrl: string;
  private readonly workflowId: string;
  private readonly signingKey: Uint8Array;
  readonly address: string;

  constructor(config: DeployedTriggerConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/$/, '');
    this.workflowId = config.workflowId;
    this.signingKey = Uint8Array.from(Buffer.from(config.signingKey.replace(/^0x/, ''), 'hex'));
    this.address = addressOf(config.signingKey);
  }

  private buildJwt(body: Record<string, unknown>): string {
    const header = base64url(JSON.stringify({ alg: 'ETH', typ: 'JWT' }));
    const digest = `0x${createHash('sha256').update(canonicalJson(body), 'utf8').digest('hex')}`;
    const now = Math.floor(Date.now() / 1000);
    const payload = base64url(
      JSON.stringify({
        digest,
        iss: this.address,
        iat: now,
        exp: now + 240,
        jti: randomUUID(),
      })
    );
    const message = `${header}.${payload}`;
    const prefixed = `\x19Ethereum Signed Message:\n${message.length}${message}`;
    const hash = keccak_256(new TextEncoder().encode(prefixed));
    // noble v2 prehashes (sha256) by default; Ethereum signs the raw keccak hash.
    const recovered = secp256k1.sign(hash, this.signingKey, { format: 'recovered', prehash: false });
    const compact = new Uint8Array(65);
    compact.set(recovered.subarray(1), 0);
    compact[64] = recovered[0] + 27;
    return `${message}.${base64url(compact)}`;
  }

  async execute(batch: TriggerBatch): Promise<TriggerResult> {
    const body = {
      id: randomUUID(),
      jsonrpc: '2.0',
      method: 'workflows.execute',
      params: {
        input: batch,
        workflow: { workflowID: this.workflowId },
      },
    };
    const jwt = this.buildJwt(body as Record<string, unknown>);
    const response = await fetch(this.gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json().catch(() => null)) as {
      result?: { status?: string; workflow_execution_id?: string };
      error?: { code?: number; message?: string };
    } | null;
    return {
      accepted: response.ok && responseBody?.result?.status === 'ACCEPTED',
      executionId: responseBody?.result?.workflow_execution_id,
      body: responseBody,
    };
  }
}
