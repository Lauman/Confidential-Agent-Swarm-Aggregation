import { WorkflowInput, WorkflowOutput } from './types.js';

export function handler(input: WorkflowInput): WorkflowOutput {
  const { values, roundId } = input;
  
  if (values.length === 0) {
    throw new Error('No values provided for aggregation');
  }

  // Aggregate logic - simple average for MVP
  const aggregate = values.reduce((a, b) => a + b, 0) / values.length;
  
  // Return only the aggregate - individual values never leave the TEE
  return {
    aggregate,
    roundId,
    participantCount: values.length,
    timestamp: Date.now()
  };
}