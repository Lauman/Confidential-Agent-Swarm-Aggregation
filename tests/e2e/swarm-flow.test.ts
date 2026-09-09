import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { USE_CASES, type EncryptedEnvelope, type TeeSignedResult } from '@private-signal-swarm/types';
import {
  generateKeyMaterial,
  toDevSecrets,
  toKeymap,
  verifyTeeSignature,
  tallyBallots,
  type KeyMaterial,
} from '@private-signal-swarm/confidential-core';

const PROPOSAL = 'proposal-e2e-001';

let material: KeyMaterial;
let keysDir: string;
let stateDir: string;
let coordinatorUrl: string;
let resourceUrl: string;
let servers: Server[] = [];

async function listen(app: { listen: (port: number, cb: () => void) => Server }): Promise<string> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      servers.push(server);
      resolve(`http://localhost:${(server.address() as AddressInfo).port}`);
    });
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';

  material = await generateKeyMaterial(['agent-1', 'agent-2', 'agent-3']);
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-e2e-keys-'));
  fs.writeFileSync(path.join(keysDir, 'keymap.json'), JSON.stringify(toKeymap(material)));
  fs.writeFileSync(path.join(keysDir, 'dev-secrets.json'), JSON.stringify(toDevSecrets(material)));
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-e2e-state-'));

  process.env.KEYMAP_PATH = path.join(keysDir, 'keymap.json');
  process.env.DEV_SECRETS_PATH = path.join(keysDir, 'dev-secrets.json');
  process.env.STATE_DIR = stateDir;
  process.env.QUORUM = '3';

  const { createApp: createCoordinator } = await import('../../apps/coordinator/src/server.js');
  const { createApp: createResource } = await import('../../apps/resource-server/src/server.js');

  coordinatorUrl = await listen(createCoordinator());
  const { app: resourceApp } = createResource();
  resourceUrl = await listen(resourceApp);
}, 60000);

afterAll(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  servers = [];
});

describe('End-to-end swarm flow (real HTTP, real crypto)', () => {
  it('3 agents → blind quorum → TEE-runner tally → verified paid serve', async () => {
    const { Agent } = await import('../../apps/agent/src/agent.js');

    const mkAgent = (id: string) =>
      new Agent({
        id,
        coordinatorEndpoint: coordinatorUrl,
        keySource: 'keymap',
        keymapPath: path.join(keysDir, 'keymap.json'),
      });

    const outcomes = [];
    for (const id of ['agent-1', 'agent-2', 'agent-3']) {
      outcomes.push(await mkAgent(id).run(PROPOSAL));
    }

    expect(outcomes.map((o) => o.status)).toContain('quorum-reached');

    // 1. Coordinator artifacts contain NO individual ballot content:
    // results carry the verdict only (tally suppressed below N=5),
    // tombstones carry metadata only. '"vote"' must appear nowhere.
    const stateFile = path.join(stateDir, 'coordinator-state.json');
    const stateText = fs.readFileSync(stateFile, 'utf-8');
    expect(stateText).not.toContain('"vote"');

    const closed = JSON.parse(stateText) as { closedRounds: Record<string, { batchHash: string }> };
    const roundIds = Object.keys(closed.closedRounds);
    expect(roundIds).toHaveLength(1);
    expect(closed.closedRounds[roundIds[0]].batchHash).toMatch(/^[0-9a-f]{64}$/);

    // 2. Round record exposes metadata only — no envelope content.
    const roundRes = await fetch(`${coordinatorUrl}/round/${roundIds[0]}`);
    expect(roundRes.ok).toBe(true);
    const record = (await roundRes.json()) as Record<string, unknown>;
    expect(record.status).toBe('aggregated');
    expect(JSON.stringify(record)).not.toContain('"vote"');
    expect(JSON.stringify(record)).not.toContain('"ciphertext"');

    // 3. Fresh signed result, verifiable against the TEE public key from the keymap.
    const latestRes = await fetch(`${coordinatorUrl}/result/latest?useCase=${USE_CASES.deliberation}`);
    expect(latestRes.ok).toBe(true);
    const result = (await latestRes.json()) as TeeSignedResult;
    expect(result.participantCount).toBe(3);

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

    // 4. Verdict matches the expected tally of the deterministic mock ballots.
    const { deliberateMock } = await import('../../apps/agent/src/payload/deliberation.js');
    const expected = tallyBallots(['agent-1', 'agent-2', 'agent-3'].map((id) => deliberateMock(id, PROPOSAL)));
    expect((result.payload as { verdict: string }).verdict).toBe(expected.verdict);

    // 5. Coordinator → resource server push (real HTTP ingest), then free status + paid verdict.
    const ingest = await fetch(`${resourceUrl}/api/internal/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    expect(ingest.ok).toBe(true);

    const status = await fetch(`${resourceUrl}/api/status`);
    expect(status.ok).toBe(true);
    const statusBody = (await status.json()) as { available: { roundId: string }[] };
    expect(statusBody.available.map((a) => a.roundId)).toContain(result.roundId);

    // X402_PAY_TO unset in test → dev mode, no payment required.
    const verdict = await fetch(`${resourceUrl}/api/verdict?useCase=${USE_CASES.deliberation}`);
    expect(verdict.ok).toBe(true);
    const served = (await verdict.json()) as TeeSignedResult;
    expect(served.teeSignature).toBe(result.teeSignature);
  }, 60000);

  it('fabricated results are rejected at the resource server intake', async () => {
    const forged = {
      version: 1,
      useCase: USE_CASES.deliberation,
      roundId: 'forged-round',
      participantCount: 3,
      timestamp: Date.now(),
      payload: { verdict: 'pass' },
      teeSignature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    };
    const ingest = await fetch(`${resourceUrl}/api/internal/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forged),
    });
    expect(ingest.ok).toBe(false);
    expect(ingest.status).toBe(400);

    const status = await fetch(`${resourceUrl}/api/verdict?useCase=${USE_CASES.deliberation}`);
    // genuine result from the previous test still served, forged one never stored
    const served = (await status.json()) as TeeSignedResult;
    expect(served.roundId).not.toBe('forged-round');
  }, 60000);

  it('envelopes are opaque on the wire (ciphertext only)', async () => {
    // A fresh round: new submissions must be undecryptable without the TEE key
    // and must not echo the plaintext ballot.
    const roundRes = await fetch(`${coordinatorUrl}/round/current?useCase=${USE_CASES.deliberation}`);
    const { roundId } = (await roundRes.json()) as { roundId: string };

    const { EnvelopeFactory } = await import('../../apps/agent/src/crypto.js');
    const secrets = JSON.parse(fs.readFileSync(path.join(keysDir, 'dev-secrets.json'), 'utf-8')) as {
      agents: Record<string, { signPriv: string }>;
    };
    const factory = new EnvelopeFactory(
      path.join(keysDir, 'keymap.json'),
      'agent-1',
      secrets.agents['agent-1'].signPriv
    );
    const plaintext = { proposalRef: 'secret-prop', vote: 'oppose', confidence: 0.99 };
    const envelope: EncryptedEnvelope = await factory.createEnvelope(roundId, USE_CASES.deliberation, plaintext);

    const wire = JSON.stringify(envelope);
    expect(wire).not.toContain('secret-prop');
    expect(wire).not.toContain('oppose');
    expect(wire).not.toContain('0.99');
    expect(wire).toContain(envelope.agentId); // participation metadata is public by design
  }, 60000);
});
