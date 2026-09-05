import express, { Express } from 'express';
import { signalRouter } from './routes/signal.js';

const app: Express = express();
const PORT: string | number = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', signalRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Resource server listening on port ${PORT}`);
});

export default app;