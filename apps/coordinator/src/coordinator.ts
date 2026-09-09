import { Router } from 'express';import type { RoundRecord } from '@private-signal-swarm/types';
import { config } from './config.js';
import { loadKeymap } from './keymap.js';
import { EnvelopeValidationError, EnvelopeValidator } from './envelope-validator.js';
import { RoundManager } from './round-manager.js';
import { TombstoneStore } from './tombstone-store.js';
import { LocalTeeRunner } from './tee-seam.js';
import { ResultPusher } from './result-pusher.js';

export const coordinatorRouter: Router = Router();

const keymap = loadKeymap(config.keymapPath);
const validator = new EnvelopeValidator({
  keymap,
  allowedUseCases: config.allowedUseCases,
});
const store = new TombstoneStore(config.stateDir);
const teeSeam = new LocalTeeRunner(config.devSecretsPath);
const resultPusher = new ResultPusher(config.resultIngestUrl);
const roundManager = new RoundManager({
  quorum: config.quorum,
  teeSeam,
  store,
  keyId: keymap.keyId,
  onResult: (result) => void resultPusher.push(result),
});

coordinatorRouter.get('/round/current', (req, res) => {
  const useCase = typeof req.query.useCase === 'string' ? req.query.useCase : '';
  if (!config.allowedUseCases.includes(useCase)) {
    res.status(400).json({ error: 'unknown-usecase', message: `Missing or unknown ?useCase= (allowed: ${config.allowedUseCases.join(', ')})` });
    return;
  }
  res.json({ roundId: roundManager.getCurrentRoundId(useCase), useCase });
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

function sanitizeRound(record: RoundRecord) {
  return record;
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
