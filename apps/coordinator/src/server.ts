import express, { Express } from 'express';
import { coordinatorRouter } from './coordinator.js';

const app: Express = express();
const PORT: string | number = process.env.PORT || 3001;

app.use(express.json());

app.use('/', coordinatorRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Coordinator listening on port ${PORT}`);
});

export default app;