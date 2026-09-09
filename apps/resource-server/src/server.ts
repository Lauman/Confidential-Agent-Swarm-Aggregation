import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { verdictRouter, bindResultStore } from './routes/verdict.js';
import { createX402Middleware } from './x402/middleware.js';
import { VerifiedResultStore } from './result-store.js';
import type { KeymapFile } from '@private-signal-swarm/confidential-core';
import type { Network } from 'x402-express';

const WORKSPACE_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', '..');

export interface ResourceServer {
  app: Express;
  store: VerifiedResultStore;
}

export function createApp(): ResourceServer {
  const keymapPath = process.env.KEYMAP_PATH
    ? path.isAbsolute(process.env.KEYMAP_PATH) ? process.env.KEYMAP_PATH : path.resolve(WORKSPACE_ROOT, process.env.KEYMAP_PATH)
    : path.join(WORKSPACE_ROOT, 'packages/confidential-core/.dev-keys/keymap.json');

  let keymap: KeymapFile;
  try {
    keymap = JSON.parse(fs.readFileSync(keymapPath, 'utf-8')) as KeymapFile;
  } catch {
    console.error(`Keymap not found at ${keymapPath} — result verification unavailable`);
    process.exit(1);
  }

  const store = new VerifiedResultStore(keymap);
  bindResultStore(store);

  const app: Express = express();
  app.use(express.json());

  const availabilityGate = (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/verdict' && req.method === 'GET') {
      const useCase = typeof req.query.useCase === 'string' ? req.query.useCase : '';
      if (!store.getLatest(useCase)) {
        res.status(404).json({ error: 'not-found', message: `No completed result for useCase: ${useCase}` });
        return;
      }
    }
    next();
  };

  app.use('/api', availabilityGate);

  const payTo = process.env.X402_PAY_TO;
  const network = (process.env.X402_NETWORK || 'base-sepolia') as Network;
  const price = process.env.X402_PRICE || '$0.01';
  const facilitatorUrl = process.env.X402_FACILITATOR_URL;

  if (payTo) {
    app.use(
      createX402Middleware({
        payTo,
        price,
        network,
        facilitatorUrl,
      })
    );
  } else {
    console.log('Warning: X402_PAY_TO not set, payment middleware disabled (dev mode)');
  }

  app.use('/api', verdictRouter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  return { app, store };
}

const PORT: string | number = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  const { app } = createApp();
  app.listen(PORT, () => {
    console.log(`Resource server listening on port ${PORT}`);
  });
}

export default createApp;
