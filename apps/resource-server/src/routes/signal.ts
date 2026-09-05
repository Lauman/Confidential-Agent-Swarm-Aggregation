import { Router, Router as ExpressRouter } from 'express';
import { SignalService } from '../services/signal-service.js';

export const signalRouter: ExpressRouter = Router();
const signalService = new SignalService();

signalRouter.get('/signal', async (_req, res) => {
  try {
    const signal = await signalService.getAggregateSignal();
    res.json({ aggregate: signal });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve signal' });
  }
});