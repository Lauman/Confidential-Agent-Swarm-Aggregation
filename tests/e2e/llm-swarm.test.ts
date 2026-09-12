import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { USE_CASES, type TeeSignedResult } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  toDevSecrets,
  toKeymap,
  verifyTeeSignature,
  tallyBallots,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';

let material: KeyMaterial;
let keysDir: string;
let coordinatorUrl: string;
let llmUrl: string;
let llmCalls = 0;
let servers: Server[] = [];

async function listen(
  handler: http.RequestListener,
  app?: { listen: (port: number, cb: () => void) => Server }
): Promise<string> {
  return new Promise((resolve) => {
    const server = app
      ? app.listen(0, () => {
          servers.push(server);
          resolve(`http://localhost:${(server.address() as AddressInfo).port}`);
        })
      : http.createServer(handler!).listen(0, function (this: Server) {
          servers.push(this);
          resolve(`http://localhost:${(this.address() as AddressInfo).port}`);
        });
  });
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string) => (data += chunk));
    req.on('end', () => resolve(JSON.parse(data) as Record<string, unknown>));
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';

  material = await generateKeyMaterial(['agent-1', 'agent-2', 'agent-3']);
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-llm-keys-'));
  fs.writeFileSync(path.join(keysDir, 'keymap.json'), JSON.stringify(toKeymap(material)));
  fs.writeFileSync(path.join(keysDir, 'dev-secrets.json'), JSON.stringify(toDevSecrets(material)));

  process.env.KEYMAP_PATH = path.join(keysDir, 'keymap.json');
  process.env.DEV_SECRETS_PATH = path.join(keysDir, 'dev-secrets.json');
  process.env.STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-llm-state-'));
  process.env.QUORUM = '3';

  // Stub inference with stable personas: Hawk/Auditor/Steward disagree by design.
  llmUrl = await listen(async (req, res) => {
    const body = await readBody(req);
    const messages = (body.messages ?? []) as Array<{ role?: string; content?: string }>;
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    llmCalls += 1;
    const ballot = system.includes('Growth Hawk')
      ? { vote: 'support', confidence: 0.9 }
      : system.includes('Risk Auditor')
        ? { vote: 'oppose', confidence: 0.75 }
        : { vote: 'support', confidence: 0.65 };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ballot) } }] }));
  });

  const { createApp: createCoordinator } = await import('../../apps/coordinator/src/server.js');
  const { createApp: createResource } = await import('../../apps/resource-server/src/server.js');

  coordinatorUrl = await listen(null as never, createCoordinator());
  const { app: resourceApp } = createResource();
  await listen(null as never, resourceApp);
}, 60000);

afterAll(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  servers = [];
});

describe('LLM deliberation swarm (stub inference, real everything else)', () => {
  it('3 LLM agents deliberate in parallel, quorum, contested verdict, verifiable', async () => {
    const { Agent } = await import('../../apps/agent/src/agent.js');

    const mkLlmAgent = (id: string) =>
      new Agent({
        id,
        coordinatorEndpoint: coordinatorUrl,
        keySource: 'keymap',
        keymapPath: path.join(keysDir, 'keymap.json'),
        reasoning: { mode: 'llm', baseUrl: llmUrl, apiKey: 'test-key', model: 'stub-model' },
      });

    llmCalls = 0;
    const outcomes = await Promise.all(
      ['agent-1', 'agent-2', 'agent-3'].map((id) => mkLlmAgent(id).run('dao-grants-007'))
    );
    expect(outcomes.map((o) => o.status)).toContain('quorum-reached');
    expect(llmCalls).toBe(3);

    const latestRes = await fetch(`${coordinatorUrl}/result/latest?useCase=${USE_CASES.deliberation}`);
    expect(latestRes.ok).toBe(true);
    const result = (await latestRes.json()) as TeeSignedResult;
    const payload = result.payload as { verdict: string; participantCount: number; proposalRef: string };

    // Expected verdict derived from the REAL persona assignment (hash-mapped
    // per agentId), using the same stub votes the fake inference returned.
    const { assignPersona } = await import('../../apps/agent/src/payload/personas.js');
    const stubVote = (personaName: string) =>
      personaName.includes('Hawk')
        ? ({ vote: 'support', confidence: 0.9 }) as const
        : personaName.includes('Auditor')
          ? ({ vote: 'oppose', confidence: 0.75 }) as const
          : ({ vote: 'support', confidence: 0.65 }) as const;
    const expected = tallyBallots(
      ['agent-1', 'agent-2', 'agent-3'].map((id) => ({
        proposalRef: 'dao-grants-007',
        ...stubVote(assignPersona(id).name),
      }))
    );
    expect(payload.verdict).toBe(expected.verdict);
    expect(payload.participantCount).toBe(3);
    expect(payload.proposalRef).toBe('dao-grants-007');
    expect('tally' in payload && payload.tally !== undefined).toBe(false);

    const keymap = toKeymap(material);
    const valid = await verifyTeeSignature(
      keymap.tee.signPub,
      {
        useCase: result.useCase,
        roundId: result.roundId,
        participantCount: result.participantCount,
        timestamp: result.timestamp,
        payload: result.payload,
      },
      result.teeSignature
    );
    expect(valid).toBe(true);
  }, 60000);

  it('demo endpoint runs a mock round over HTTP (parallel submits)', async () => {
    const res = await fetch(`${coordinatorUrl}/api/demo/run-round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalRef: 'dao-treasury-001' }),
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      status: string;
      proposalRef: string;
      outcomes: Array<{ agentId: string; outcome: { status: string } }>;
    };
    expect(body.status).toBe('ok');
    expect(body.proposalRef).toBe('dao-treasury-001');
    expect(body.outcomes).toHaveLength(3);
    expect(body.outcomes.map((o) => o.outcome.status)).toContain('quorum-reached');
  }, 60000);
});
