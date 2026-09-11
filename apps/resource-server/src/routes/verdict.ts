import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { VerifiedResultStore, ResultVerificationError } from '../result-store.js';

export const verdictRouter: ExpressRouter = Router();

let store: VerifiedResultStore | undefined;

export function bindResultStore(bound: VerifiedResultStore): void {
  store = bound;
}

function requireStore(): VerifiedResultStore {
  if (!store) {
    throw new Error('Result store not bound');
  }
  return store;
}

/** Free: what is purchasable right now (no payment charged). */
verdictRouter.get('/status', (_req, res) => {
  res.json({ available: requireStore().status() });
});

verdictRouter.get('/tee-pub', (_req, res) => {
  const store = requireStore();
  res.json({ keyId: store.currentKeyId, signPub: store.teePub });
});

/** Push from the coordinator. The TEE signature IS the auth — verify at intake. */
verdictRouter.post('/internal/ingest', async (req, res) => {
  try {
    const result = await requireStore().ingest(req.body);
    res.json({ status: 'stored', roundId: result.roundId, useCase: result.useCase });
  } catch (error) {
    if (error instanceof ResultVerificationError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    res.status(500).json({ error: 'internal', message: 'Ingest failed' });
  }
});

/** Paid: x402 middleware runs BEFORE this route; availability is pre-checked
 * by a gate in server.ts so consumers never pay for an empty shelf. */
verdictRouter.get('/verdict', (req, res) => {
  const useCase = typeof req.query.useCase === 'string' ? req.query.useCase : '';
  const result = requireStore().getLatest(useCase);
  if (!result) {
    res.status(404).json({ error: 'not-found', message: `No completed result for useCase: ${useCase}` });
    return;
  }
  res.json(result);
});
