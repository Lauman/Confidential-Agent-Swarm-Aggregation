import { Router, Router as ExpressRouter } from 'express';
import { RoundManager } from './round-manager.js';

export const coordinatorRouter: ExpressRouter = Router();
const roundManager = new RoundManager();

coordinatorRouter.post('/submit', async (req, res) => {
  try {
    const submission = req.body;
    const result = await roundManager.handleSubmit(submission);
    
    if (result) {
      res.json({ 
        message: 'Quorum reached', 
        roundId: result.roundId,
        aggregate: result.aggregate 
      });
    } else {
      res.json({ message: 'Submission received, waiting for quorum' });
    }
  } catch (error) {
    res.status(400).json({ error: 'Invalid submission' });
  }
});

coordinatorRouter.get('/round/:roundId', (req, res) => {
  const round = roundManager.getRound(req.params.roundId);
  if (round) {
    res.json(round);
  } else {
    res.status(404).json({ error: 'Round not found' });
  }
});