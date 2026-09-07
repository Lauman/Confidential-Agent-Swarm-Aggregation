import { handler } from './handler.js';
import { AggregationRequest } from './types.js';

export async function workflow(input: AggregationRequest) {
  return handler(input);
}

if (process.env.NODE_ENV === 'development') {
  const testInput: AggregationRequest = {
    submissions: [
      { agentId: 'agent-1', roundId: 'test-round-001', value: 102.3, timestamp: Date.now() },
      { agentId: 'agent-2', roundId: 'test-round-001', value: 98.7, timestamp: Date.now() },
      { agentId: 'agent-3', roundId: 'test-round-001', value: 105.1, timestamp: Date.now() }
    ],
    roundId: 'test-round-001'
  };
  
  console.log('Testing workflow with:', testInput);
  const result = workflow(testInput);
  console.log('Result:', result);
}