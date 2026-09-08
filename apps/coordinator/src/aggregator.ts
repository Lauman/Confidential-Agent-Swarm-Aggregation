import { AggregationRequest, AggregationResult } from '@private-signal-swarm/types';

export interface ConfidentialAggregator {
  aggregate(request: AggregationRequest): Promise<AggregationResult>;
}

export class MockAggregator implements ConfidentialAggregator {
  async aggregate(request: AggregationRequest): Promise<AggregationResult> {
    const values = request.submissions.map(s => s.value);
    const aggregate = values.reduce((a, b) => a + b, 0) / values.length;
    
    return {
      roundId: request.roundId,
      aggregate,
      participantCount: values.length,
      timestamp: Date.now()
    };
  }
}

export class CREAggregator implements ConfidentialAggregator {
  private creEndpoint: string;

  constructor(creEndpoint: string) {
    this.creEndpoint = creEndpoint;
  }

  async aggregate(request: AggregationRequest): Promise<AggregationResult> {
    const response = await fetch(this.creEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`CRE aggregation failed: ${response.statusText}`);
    }

    const text = await response.text();
    return JSON.parse(text) as AggregationResult;
  }
}