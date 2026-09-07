import { AggregationRequest, AggregationResult } from '@private-signal-swarm/types';

export function handler(input: AggregationRequest): AggregationResult {
  const { submissions, roundId } = input;
  
  if (submissions.length === 0) {
    throw new Error('No values provided for aggregation');
  }

  const values = submissions.map(s => s.value);
  const aggregate = values.reduce((a, b) => a + b, 0) / values.length;
  
  return {
    aggregate,
    roundId,
    participantCount: values.length,
    timestamp: Date.now()
  };
}