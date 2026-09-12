import type { AgentConfig } from '@private-signal-swarm/types';
import { USE_CASES, type UseCaseId } from '@private-signal-swarm/types';
import { Agent, type AgentRunResult } from './agent.js';
import { CoordinatorClient } from './coordinator-client.js';

export interface SwarmRoundOptions {
  coordinatorEndpoint: string;
  keymapPath: string;
  agentIds?: string[];
  proposalRef: string;
  useCase?: UseCaseId;
  reasoning?: AgentConfig['reasoning'];
  roundId?: string;
  staggerMs?: number;
  onProgress?: (agentId: string, index: number) => void;
}

export interface SwarmRoundResult {
  proposalRef: string;
  useCase: string;
  roundId: string;
  outcomes: Array<{ agentId: string; outcome: AgentRunResult }>;
}

const DEFAULT_AGENTS = ['agent-1', 'agent-2', 'agent-3'];
const DEFAULT_STAGGER_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one full swarm round. All agents target one pinned roundId so polling
 * `GET /round/current` observes 1/N → 2/N → quorum. Submits are staggered so
 * the web UI (400-1200ms poll) visibly fills slots instead of jumping 0 → done.
 * Shared by the CLI entry (main.ts) and the coordinator demo endpoint —
 * the UI's Deliberate button calls the latter.
 */
export async function runSwarmRound(options: SwarmRoundOptions): Promise<SwarmRoundResult> {
  const { coordinatorEndpoint, keymapPath, proposalRef } = options;
  const agentIds = options.agentIds ?? DEFAULT_AGENTS;
  const useCase = options.useCase ?? USE_CASES.deliberation;
  const staggerMs = Math.max(0, options.staggerMs ?? DEFAULT_STAGGER_MS);

  let roundId = options.roundId;
  if (!roundId) {
    const client = new CoordinatorClient(coordinatorEndpoint);
    roundId = await client.getCurrentRoundId(useCase);
  }
  const pinnedRoundId: string = roundId;

  const outcomes: Array<{ agentId: string; outcome: AgentRunResult }> = [];
  for (let i = 0; i < agentIds.length; i += 1) {
    const id = agentIds[i];
    if (i > 0 && staggerMs > 0) {
      await sleep(staggerMs);
    }
    const config: AgentConfig = {
      id,
      coordinatorEndpoint,
      keySource: 'keymap',
      keymapPath,
      reasoning: options.reasoning,
    };
    const agent = new Agent(config);
    const outcome = await agent.run(proposalRef, useCase, pinnedRoundId);
    outcomes.push({ agentId: id, outcome });
    options.onProgress?.(id, i);
    if (outcome.status === 'quorum-reached') {
      break;
    }
  }

  return { proposalRef, useCase, roundId: pinnedRoundId, outcomes };
}
