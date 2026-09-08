import { Router, Router as ExpressRouter } from 'express';
import { RoundManager } from './round-manager.js';
import { CREAggregator, MockAggregator } from './aggregator.js';
import { config } from './config.js';

export const coordinatorRouter: ExpressRouter = Router();

const aggregator = config.creEndpoint
  ? new CREAggregator(config.creEndpoint)
  : new MockAggregator();

const roundManager = new RoundManager(config.quorum, aggregator);

coordinatorRouter.get('/round/current', (_req, res) => {
  res.json({ roundId: roundManager.getCurrentRoundId() });
});

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
    const message = error instanceof Error ? error.message : 'Invalid submission';
    res.status(400).json({ error: message });
  }
});

coordinatorRouter.get('/round/:roundId', (req, res) => {
  const round = roundManager.getRound(req.params.roundId);
  if (round) {
    res.json({
      roundId: round.roundId,
      quorum: round.quorum,
      status: round.status,
      submissionCount: round.submissions.size,
      result: round.result
    });
  } else {
    res.status(404).json({ error: 'Round not found' });
  }
});

coordinatorRouter.get('/result', (_req, res) => {
  const result = roundManager.getLatestResult();
  if (result) {
    res.json(result);
  } else {
    res.status(404).json({ error: 'No completed rounds yet' });
  }
});