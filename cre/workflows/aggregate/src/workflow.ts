import { handler } from './handler.js';
import { WorkflowInput } from './types.js';

// CRE workflow entry point
export async function workflow(input: WorkflowInput) {
  // The handler runs inside the TEE
  // Individual values are private, only aggregate leaves
  return handler(input);
}

// For local testing
if (process.env.NODE_ENV === 'development') {
  const testInput: WorkflowInput = {
    values: [102.3, 98.7, 105.1],
    roundId: 'test-round-001'
  };
  
  console.log('Testing workflow with:', testInput);
  const result = workflow(testInput);
  console.log('Result:', result);
}