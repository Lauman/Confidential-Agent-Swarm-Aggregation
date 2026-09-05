import { AgentSubmission } from '@private-signal-swarm/types';

export class CoordinatorClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async submit(submission: AgentSubmission): Promise<void> {
    // TODO: Implement actual HTTP POST to coordinator
    console.log(`Submitting to coordinator at ${this.endpoint}:`, submission);
    
    // Placeholder implementation
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