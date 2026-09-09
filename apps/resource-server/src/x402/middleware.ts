import { paymentMiddleware, Network } from 'x402-express';
import type { RequestHandler } from 'express';

export interface X402Config {
  payTo: string;
  price: string;
  network: Network;
  facilitatorUrl?: string;
}

export function createX402Middleware(config: X402Config): RequestHandler {
  const routes = {
    '/api/verdict': {
      price: config.price,
      network: config.network,
      config: {
        description: 'Access to the signed swarm verdict',
      },
    },
  };

  const facilitator = config.facilitatorUrl
    ? { url: config.facilitatorUrl as `${string}://${string}` }
    : undefined;

  return paymentMiddleware(
    config.payTo as `0x${string}`,
    routes,
    facilitator
  ) as RequestHandler;
}