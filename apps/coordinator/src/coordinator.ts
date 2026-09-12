import { Router } from 'express';import type { RoundRecord } from '@private-signal-swarm/types';
import { config } from './config.js';
import { EnvelopeValidationError } from './envelope-validator.js';
import { roundManager, validator } from './round-state.js';

export const coordinatorRouter: Router = Router();

coordinatorRouter.get('/round/current', (req, res) => {
  const useCase = typeof req.query.useCase === 'string' ? req.query.useCase : '';
  if (!config.allowedUseCases.includes(useCase)) {
    res.status(400).json({ error: 'unknown-usecase', message: `Missing or unknown ?useCase= (allowed: ${config.allowedUseCases.join(', ')})` });
    return;
  }
  res.json({ ...roundManager.getCurrentRound(useCase) });
});

coordinatorRouter.post('/submit', async (req, res) => {
  try {
    const envelope = await validator.validate(req.body);
    const outcome = await roundManager.handleSubmit(envelope);
    if (outcome.status === 'accepted') {
      res.json(outcome);
    } else {
      res.json(outcome);
    }
  } catch (error) {
    if (error instanceof EnvelopeValidationError) {
      res.status(400).json({ error: error.code, message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error(`Submit failed: ${message}`);
    res.status(500).json({ error: 'internal', message });
  }
});

function sanitizeRound(record: RoundRecord): Omit<RoundRecord, 'result'> {
  const { result, ...sanitized } = record;
  return sanitized;
}

coordinatorRouter.get('/round/:roundId', (req, res) => {
  const record = roundManager.getRoundRecord(req.params.roundId);
  if (!record) {
    res.status(404).json({ error: 'not-found', message: 'Round not found' });
    return;
  }
  res.json(sanitizeRound(record));
});

coordinatorRouter.get('/result/latest', (req, res) => {
  const useCase = typeof req.query.useCase === 'string' ? req.query.useCase : '';
  const result = roundManager.getLatestResult(useCase);
  if (!result) {
    res.status(404).json({ error: 'not-found', message: 'No completed rounds yet' });
    return;
  }
  res.json(result);
});

coordinatorRouter.get('/rounds/recent', (req, res) => {
  const raw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 5;
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 20) : 5;
  res.json({ rounds: roundManager.listRecentRounds(limit).map(sanitizeRound) });
});
