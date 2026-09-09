import express, { type Express } from 'express';
import { coordinatorRouter } from './coordinator.js';

export function createApp(): Express {
  const app: Express = express();
  app.use(express.json());
  app.use('/', coordinatorRouter);
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });
  return app;
}

const PORT: string | number = process.env.COORDINATOR_PORT || process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Coordinator listening on port ${PORT}`);
  });
}

export default createApp;
