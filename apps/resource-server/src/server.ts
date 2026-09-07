import express, { Express } from 'express';
import { signalRouter } from './routes/signal.js';
import { createX402Middleware } from './x402/middleware.js';
import type { Network } from 'x402-express';

const app: Express = express();
const PORT: string | number = process.env.PORT || 3000;

app.use(express.json());

const payTo = process.env.X402_PAY_TO;
const network = (process.env.X402_NETWORK || 'base-sepolia') as Network;
const price = process.env.X402_PRICE || '$0.01';
const facilitatorUrl = process.env.X402_FACILITATOR_URL;

if (payTo) {
  app.use(createX402Middleware({
    payTo,
    price,
    network,
    facilitatorUrl
  }));
}

app.use('/api', signalRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Resource server listening on port ${PORT}`);
  if (!payTo) {
    console.log('Warning: X402_PAY_TO not set, payment middleware disabled');
  }
});

export default app;