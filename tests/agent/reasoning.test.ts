import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { AgentConfig, EncryptedEnvelope } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  openSealed,
  toDevSecrets,
  toKeymap,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';
import { Agent } from '../../apps/agent/src/agent.js';
import { EnvelopeValidator } from '../../apps/coordinator/src/envelope-validator.js';
import { estimateMock } from '../../apps/agent/src/payload/signal-estimate.js';

let material: KeyMaterial;
let keysDir: string;
let llmUrl: string;
let coordUrl: string;
let servers: Server[] = [];
const received: EncryptedEnvelope[] = [];

async function listen(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      servers.push(server);
      resolve(`http://localhost:${(server.address() as AddressInfo).port}`);
    });
  });
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string) => (data += chunk));
    req.on('end', () => resolve(JSON.parse(data)));
  });
}

beforeAll(async () => {
  material = await generateKeyMaterial(['agent-1']);
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-reason-test-'));
  fs.writeFileSync(path.join(keysDir, 'keymap.json'), JSON.stringify(toKeymap(material)));
  fs.writeFileSync(path.join(keysDir, 'dev-secrets.json'), JSON.stringify(toDevSecrets(material)));

  // Stub inference: deterministic ballot, no network beyond localhost.
  llmUrl = await listen(async (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [{ message: { content: '{"vote":"support","confidence":0.88,"rationale":"unit stub"}' } }],
      })
    );
  });

  // Stub coordinator: validates nothing, captures envelopes, always accepts.
  coordUrl = await listen(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.startsWith('/round/current')) {
      res.end(JSON.stringify({ roundId: 'round-unit-1' }));
      return;
    }
    if (req.url === '/submit' && req.method === 'POST') {
      received.push((await readBody(req)) as EncryptedEnvelope);
      res.end(JSON.stringify({ status: 'accepted', submissionCount: received.length, quorum: 3 }));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
}, 60000);

afterAll(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  servers = [];
});

function llmAgentConfig(): AgentConfig {
  return {
    id: 'agent-1',
    coordinatorEndpoint: coordUrl,
    keySource: 'keymap',
    keymapPath: path.join(keysDir, 'keymap.json'),
    reasoning: { mode: 'llm', baseUrl: llmUrl, apiKey: 'test-key', model: 'stub-model' },
  };
}

describe('Agent llm reasoning end-to-end (stub inference + stub coordinator)', () => {
  it('submits a valid envelope carrying the LLM ballot', async () => {
    const agent = new Agent(llmAgentConfig());
    const outcome = await agent.run('dao-grants-007');
    expect(outcome.status).toBe('submitted');
    expect(received).toHaveLength(1);

    const envelope = received[0];

    // 1. Passes the real coordinator validator (schema + allowlist + signature).
    const validator = new EnvelopeValidator({
      keymap: toKeymap(material),
      allowedUseCases: ['deliberation.v1'],
    });
    const validated = await validator.validate(envelope);
    expect(validated.agentId).toBe('agent-1');

    // 2. Decrypts to exactly the stub LLM ballot (never plaintext on any wire).
    const plaintext = await openSealed(
      envelope.ciphertext,
      material.teeEnc.publicKey,
      material.teeEnc.privateKey
    );
    expect(JSON.parse(plaintext)).toMatchObject({
      proposalRef: 'dao-grants-007',
      vote: 'support',
      confidence: 0.88,
    });
  });

  it('throws a clear error when the key is missing', async () => {
    const agent = new Agent({
      ...llmAgentConfig(),
      reasoning: { mode: 'llm', baseUrl: llmUrl, model: 'stub-model' },
    });
    await expect(agent.run('dao-grants-007')).rejects.toThrow(/LLM_API_KEY/);
  });
});

describe('estimateMock (signal-estimate)', () => {
  it('is deterministic with the documented shape', () => {
    const a = estimateMock('agent-1', 'metric-x');
    const b = estimateMock('agent-1', 'metric-x');
    expect(a).toEqual(b);
    expect(a.metricRef).toBe('metric-x');
    expect(typeof a.value).toBe('number');
    expect(a.methodHash).toMatch(/^[0-9a-f]{16}$/);
  });
});
