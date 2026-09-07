import { AgentSubmission } from '@private-signal-swarm/types';
import fetch from 'node-fetch';

export class CoordinatorClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async getCurrentRoundId(): Promise<string> {
    const response = await fetch(`${this.endpoint}/round/current`);
    
    if (!response.ok) {
      throw new Error(`Failed to get current round: ${response.statusText}`);
    }

    const data = await response.json() as { roundId: string };
    return data.roundId;
  }

  async submit(submission: AgentSubmission): Promise<void> {
    const response = await fetch(`${this.endpoint}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(submission)
    });

    if (!response.ok) {
      throw new Error(`Failed to submit to coordinator: ${response.statusText}`);
    }
  }
}