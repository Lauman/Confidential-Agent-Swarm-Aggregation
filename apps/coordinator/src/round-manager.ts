import { AgentSubmission, RoundState, AggregationResult } from '@private-signal-swarm/types';

export class RoundManager {
  private rounds: Map<string, RoundState> = new Map();
  private readonly quorum: number;

  constructor(quorum: number = 3) {
    this.quorum = quorum;
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

    round.submissions.set(agentId, submission);

    if (round.submissions.size >= round.quorum) {
      return this.aggregateRound(round);
    }

    return null;
  }

  private async aggregateRound(round: RoundState): Promise<AggregationResult> {
    round.status = 'aggregating';
    
    const values = Array.from(round.submissions.values()).map(s => s.value);
    const aggregate = values.reduce((a, b) => a + b, 0) / values.length;
    
    const result: AggregationResult = {
      roundId: round.roundId,
      aggregate,
      participantCount: values.length,
      timestamp: Date.now()
    };

    round.result = result;
    round.status = 'completed';

    // TODO: Send to CRE workflow instead of returning directly
    console.log(`Round ${round.roundId} completed with aggregate: ${aggregate}`);

    return result;
  }

  getRound(roundId: string): RoundState | undefined {
    return this.rounds.get(roundId);
  }
}