import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { USE_CASES, type UseCaseId } from '@private-signal-swarm/types';
import { runSwarmRound } from '@private-signal-swarm/agent/dist/swarm.js';
import { config } from '../config.js';

export const demoRouter: ExpressRouter = Router();

const USE_CASE_ARGS: Record<string, UseCaseId> = {
  deliberation: USE_CASES.deliberation,
  'signal-estimate': USE_CASES.signalEstimate,
};

/**
 * Demo theater endpoint (hackathon UI only — not part of the protocol).
 * Runs one full swarm round in-process and returns the per-agent outcomes.
 * The UI's Deliberate button calls this; polling /round/current remains the
 * source of truth either way.
 */
demoRouter.post('/api/demo/run-round', async (req, res) => {
  try {
    const proposalRef =
      typeof req.body?.proposalRef === 'string' && req.body.proposalRef.length > 0
        ? req.body.proposalRef
        : `proposal-${Date.now().toString(36)}`;
    const useCaseArg = typeof req.body?.useCase === 'string' ? req.body.useCase : 'deliberation';
    const useCase = USE_CASE_ARGS[useCaseArg];
    if (!useCase) {
      res.status(400).json({ error: 'unknown-usecase', message: `Allowed: ${Object.keys(USE_CASE_ARGS).join(', ')}` });
      return;
    }

    const result = await runSwarmRound({
      coordinatorEndpoint: `http://localhost:${config.port}`,
      keymapPath: config.keymapPath,
      proposalRef,
      useCase,
    });
    res.json({ status: 'ok', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Demo round failed';
    console.error(`Demo round failed: ${message}`);
    res.status(500).json({ error: 'internal', message });
  }
});
