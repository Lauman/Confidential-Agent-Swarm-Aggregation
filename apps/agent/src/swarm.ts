import type { AgentConfig } from '@private-signal-swarm/types';
import { USE_CASES, type UseCaseId } from '@private-signal-swarm/types';
import { Agent, type AgentRunResult } from './agent.js';

export interface SwarmRoundOptions {
  coordinatorEndpoint: string;
  keymapPath: string;
  agentIds?: string[];
  proposalRef: string;
  useCase?: UseCaseId;
}

export interface SwarmRoundResult {
  proposalRef: string;
  useCase: string;
  outcomes: Array<{ agentId: string; outcome: AgentRunResult }>;
}

const DEFAULT_AGENTS = ['agent-1', 'agent-2', 'agent-3'];

/**
 * Runs one full swarm round: each agent deliberates and submits in sequence.
 * Shared by the CLI entry (main.ts) and the coordinator demo endpoint —
 * the UI's Deliberate button calls the latter.
 */
export async function runSwarmRound(options: SwarmRoundOptions): Promise<SwarmRoundResult> {
  const { coordinatorEndpoint, keymapPath, proposalRef } = options;
  const agentIds = options.agentIds ?? DEFAULT_AGENTS;
  const useCase = options.useCase ?? USE_CASES.deliberation;

  const outcomes: Array<{ agentId: string; outcome: AgentRunResult }> = [];
  for (const id of agentIds) {
    const config: AgentConfig = {
      id,
      coordinatorEndpoint,
      keySource: 'keymap',
      keymapPath,
    };
    const agent = new Agent(config);
    const outcome = await agent.run(proposalRef, useCase);
    outcomes.push({ agentId: id, outcome });
  }

  return { proposalRef, useCase, outcomes };
}
