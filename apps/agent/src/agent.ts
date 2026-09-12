import type { AgentConfig, UseCaseId } from '@private-signal-swarm/types';
import { USE_CASES } from '@private-signal-swarm/types';
import { CoordinatorClient, CoordinatorClientError } from './coordinator-client.js';
import { EnvelopeFactory, loadAgentPrivateKey } from './crypto.js';
import { DELIBERATION_USE_CASE, deliberateMock } from './payload/deliberation.js';
import { SIGNAL_ESTIMATE_USE_CASE, estimateMock } from './payload/signal-estimate.js';
import { assignPersona } from './payload/personas.js';
import { loadProposal } from './payload/proposals.js';
import { deliberateLLM } from './payload/llm-estimator.js';

export interface AgentRunResult {
  status: 'submitted' | 'quorum-reached' | 'skipped';
  result?: unknown;
}

export class Agent {
  private readonly config: AgentConfig;
  private readonly envelopes: EnvelopeFactory;
  private readonly coordinator: CoordinatorClient;

  constructor(config: AgentConfig) {
    if (!config.keymapPath) {
      throw new Error('Agent requires a keymap path');
    }
    this.config = config;
    this.envelopes = new EnvelopeFactory(
      config.keymapPath,
      config.id,
      loadAgentPrivateKey(config, config.keymapPath)
    );
    this.coordinator = new CoordinatorClient(config.coordinatorEndpoint);
  }

  async run(proposalRef: string, useCase: UseCaseId = DELIBERATION_USE_CASE, pinnedRoundId?: string): Promise<AgentRunResult> {
    let ballot: unknown;

    if (useCase === USE_CASES.deliberation) {
      const reasoning = this.config.reasoning;
      if (reasoning?.mode === 'llm') {
        if (!reasoning.apiKey) {
          throw new Error(
            `Agent ${this.config.id}: AGENT_REASONING=llm requires LLM_API_KEY (or use mock mode)`
          );
        }
        const proposal = loadProposal(proposalRef);
        ballot = await deliberateLLM(proposal, assignPersona(this.config.id), {
          baseUrl: reasoning.baseUrl,
          apiKey: reasoning.apiKey,
          model: reasoning.model,
          timeoutMs: reasoning.timeoutMs,
        });
      } else {
        ballot = deliberateMock(this.config.id, proposalRef);
      }
    } else if (useCase === USE_CASES.signalEstimate) {
      ballot = estimateMock(this.config.id, proposalRef);
    } else {
      throw new Error(`Unsupported use case: ${useCase}`);
    }

    let roundId = pinnedRoundId;
    if (!roundId) {
      try {
        roundId = await this.coordinator.getCurrentRoundId(useCase);
      } catch (error) {
        throw new Error(`Agent ${this.config.id} could not get current round: ${(error as Error).message}`);
      }
    }

    const envelope = await this.envelopes.createEnvelope(roundId, useCase, ballot);

    let outcome;
    try {
      outcome = await this.coordinator.submit(envelope);
    } catch (error) {
      if (error instanceof CoordinatorClientError && error.code === 'unknown-key') {
        this.envelopes.reloadKeymap();
        const retry = await this.envelopes.createEnvelope(roundId, useCase, ballot);
        outcome = await this.coordinator.submit(retry);
      } else {
        throw error;
      }
    }

    if (outcome.status === 'quorum-reached') {
      return { status: 'quorum-reached', result: outcome.result };
    }
    return { status: 'submitted' };
  }
}
