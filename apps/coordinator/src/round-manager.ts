import { AgentSubmission, RoundState, AggregationResult } from '@private-signal-swarm/types';
import { ConfidentialAggregator, MockAggregator } from './aggregator.js';

export class RoundManager {
  private rounds: Map<string, RoundState> = new Map();
  private readonly quorum: number;
  private currentRoundId: string;
  private aggregator: ConfidentialAggregator;

  constructor(quorum: number = 3, aggregator?: ConfidentialAggregator) {
    this.quorum = quorum;
    this.aggregator = aggregator ?? new MockAggregator();
    this.currentRoundId = this.createRoundId();
  }

  private createRoundId(): string {
    return `round-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  getCurrentRoundId(): string {
    return this.currentRoundId;
  }

  async handleSubmit(submission: AgentSubmission): Promise<AggregationResult | null> {
    const { roundId, agentId } = submission;
    
    let round = this.rounds.get(roundId);
    if (!round) {
      round = {
        roundId,
        submissions: new Map(),
        quorum: this.quorum,
        status: 'collecting'
      };
      this.rounds.set(roundId, round);
    }

    if (round.status !== 'collecting') {
      throw new Error(`Round ${roundId} is not accepting submissions`);
    }

    round.submissions.set(agentId, submission);

    if (round.submissions.size >= round.quorum) {
      const result = await this.aggregateRound(round);
      this.currentRoundId = this.createRoundId();
      return result;
    }

    return null;
  }

  private async aggregateRound(round: RoundState): Promise<AggregationResult> {
    round.status = 'aggregating';
    
    const submissions = Array.from(round.submissions.values());
    const result = await this.aggregator.aggregate({
      roundId: round.roundId,
      submissions
    });

    round.result = result;
    round.status = 'completed';

    return result;
  }

  getRound(roundId: string): RoundState | undefined {
    return this.rounds.get(roundId);
  }

  getLatestResult(): AggregationResult | undefined {
    for (const round of this.rounds.values()) {
      if (round.status === 'completed' && round.result) {
        return round.result;
      }
    }
    return undefined;
  }
}