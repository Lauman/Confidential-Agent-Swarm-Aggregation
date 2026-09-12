import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { USE_CASES, type UseCaseId } from '@private-signal-swarm/types';
import { runSwarmRound } from '@private-signal-swarm/agent/dist/swarm.js';
import { config } from '../config.js';
import { roundManager } from '../round-state.js';

export const demoRouter: ExpressRouter = Router();

const USE_CASE_ARGS: Record<string, UseCaseId> = {
  deliberation: USE_CASES.deliberation,
  'signal-estimate': USE_CASES.signalEstimate,
};

function resolveUseCase(arg: string): UseCaseId | undefined {
  const alias = USE_CASE_ARGS[arg];
  if (alias) {
    return alias;
  }
  const values = Object.values(USE_CASES) as string[];
  return values.includes(arg) ? (arg as UseCaseId) : undefined;
}

const activeDemoByUseCase = new Map<string, { roundId: string; startedAt: number; proposalRef: string }>();
const runningDemoByUseCase = new Set<string>();

/**
 * Demo theater endpoint (hackathon UI only — not part of the protocol).
 * Runs one full swarm round in-process and returns the per-agent outcomes.
 * Each run mints a FRESH round on the shared RoundManager (never re-pins a
 * dirty partial round) so retries can't deadlock on already-submitted.
 * Submits are staggered so polling /round/current observes 1/N → quorum
 * while this request is still pending. The UI's Deliberate button calls this;
 * polling /round/current remains the source of truth either way.
 */
demoRouter.post('/api/demo/run-round', async (req, res) => {
  try {
    const proposalRef =
      typeof req.body?.proposalRef === 'string' && req.body.proposalRef.length > 0
        ? req.body.proposalRef
        : `proposal-${Date.now().toString(36)}`;
    const useCaseArg = typeof req.body?.useCase === 'string' ? req.body.useCase : 'deliberation';
    const resolvedUseCase = resolveUseCase(useCaseArg);
    if (!resolvedUseCase) {
      res.status(400).json({ error: 'unknown-usecase', message: `Allowed: ${Object.keys(USE_CASE_ARGS).join(', ')}` });
      return;
    }
    if (runningDemoByUseCase.has(resolvedUseCase)) {
      res.status(409).json({
        error: 'demo-busy',
        message: 'A deliberation is already running — watch the slots fill.',
      });
      return;
    }
    const rawStagger = typeof req.body?.staggerMs === 'number' ? req.body.staggerMs : 800;
    const staggerMs = Number.isFinite(rawStagger) ? Math.min(Math.max(rawStagger, 0), 5000) : 800;

    // Self-URL derived from the incoming request (not config.port), so this
    // works behind proxies and on ephemeral test ports alike.
    const coordinatorEndpoint = `${req.protocol}://${req.get('host')}`;
    // Fresh round per run: a retry after a failed run must not re-pin the
    // dirty partial round (stuck 1/3 with a stray submit) and fail again.
    const roundId = roundManager.createFreshRoundId(resolvedUseCase);
    runningDemoByUseCase.add(resolvedUseCase);
    activeDemoByUseCase.set(resolvedUseCase, { roundId, startedAt: Date.now(), proposalRef });
    try {
      const result = await runSwarmRound({
        coordinatorEndpoint,
        keymapPath: config.keymapPath,
        proposalRef,
        useCase: resolvedUseCase,
        roundId,
        staggerMs,
        // In-process agents inherit the server's reasoning config, so the UI's
        // Deliberate button deliberates for real when the server has LLM_API_KEY.
        reasoning: {
          mode: process.env.AGENT_REASONING === 'llm' ? 'llm' : 'mock',
          baseUrl:
            process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
          apiKey: process.env.LLM_API_KEY || undefined,
          model: process.env.LLM_MODEL || 'gemini-3.6-flash',
          timeoutMs: process.env.LLM_TIMEOUT_MS ? parseInt(process.env.LLM_TIMEOUT_MS, 10) : undefined,
        },
        onProgress: (_agentId, _index) => {
          const active = activeDemoByUseCase.get(resolvedUseCase);
          if (active) {
            active.startedAt = Date.now();
          }
        },
      });
      activeDemoByUseCase.set(resolvedUseCase, {
        roundId: result.roundId ?? roundId,
        startedAt: Date.now(),
        proposalRef,
      });
      setTimeout(() => {
        const active = activeDemoByUseCase.get(resolvedUseCase);
        if (active && Date.now() - active.startedAt >= 30_000) {
          activeDemoByUseCase.delete(resolvedUseCase);
        }
      }, 30_000).unref?.();
      res.json({ status: 'ok', ...result });
    } finally {
      runningDemoByUseCase.delete(resolvedUseCase);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Demo round failed';
    console.error(`Demo round failed: ${message}`);
    res.status(500).json({ error: 'internal', message });
  }
});

/**
 * Theater-only recovery: abandons a stuck partial round (e.g. 1/3 sealed
 * from a stray dev-agent submit or a failed run) and mints a fresh one.
 */
demoRouter.post('/api/demo/reset', (req, res) => {
  const arg =
    (typeof req.body?.useCase === 'string' && req.body.useCase) ||
    (typeof req.query.useCase === 'string' && req.query.useCase) ||
    'deliberation';
  const resolvedUseCase = resolveUseCase(arg);
  if (!resolvedUseCase) {
    res.status(400).json({ error: 'unknown-usecase', message: `Allowed: ${Object.keys(USE_CASE_ARGS).join(', ')}` });
    return;
  }
  if (runningDemoByUseCase.has(resolvedUseCase)) {
    res.status(409).json({
      error: 'demo-busy',
      message: 'A deliberation is running — wait for it to finish before resetting.',
    });
    return;
  }
  const { abandoned, fresh } = roundManager.abandonCurrentRound(resolvedUseCase);
  activeDemoByUseCase.delete(resolvedUseCase);
  res.json({ status: 'ok', abandoned: abandoned ?? null, roundId: fresh, useCase: resolvedUseCase });
});

demoRouter.get('/api/demo/active', (req, res) => {
  const useCaseArg = typeof req.query.useCase === 'string' ? req.query.useCase : '';
  const useCase = resolveUseCase(useCaseArg) ?? useCaseArg;
  const active = activeDemoByUseCase.get(useCase);
  if (!active || Date.now() - active.startedAt > 30_000) {
    if (active) {
      activeDemoByUseCase.delete(useCase);
    }
    res.json({ active: false });
    return;
  }
  res.json({ active: true, ...active, useCase });
});
