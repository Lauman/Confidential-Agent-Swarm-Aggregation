import {
  paymentMiddleware,
  x402ResourceServer,
  type Network,
} from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import type { RequestHandler } from 'express';

export interface X402Config {
  /** Hedera account receiving payment, e.g. 0.0.1234 */
  payTo: string;
  /** Human price, e.g. "$0.01" — converted by the scheme money parser */
  price: string;
  /** e.g. "hedera:testnet" */
  network: Network;
  /** Facilitator URL — Blocky402 hosted testnet by default */
  facilitatorUrl: string;
  maxTimeoutSeconds?: number;
}

export function createX402Middleware(config: X402Config): RequestHandler {
  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactHederaScheme()
  );

  return paymentMiddleware(
    {
      'GET /api/verdict': {
        accepts: {
          scheme: 'exact',
          price: config.price,
          network: config.network,
          payTo: config.payTo,
          maxTimeoutSeconds: config.maxTimeoutSeconds ?? 300,
        },
        description: 'Access to the signed swarm verdict',
      },
    },
    resourceServer
  ) as unknown as RequestHandler;
}
