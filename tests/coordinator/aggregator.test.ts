import { describe, it, expect } from 'vitest';
import { MockAggregator } from '../../apps/coordinator/src/aggregator.js';

describe('MockAggregator', () => {
  it('should compute average of submissions', async () => {
    const aggregator = new MockAggregator();
    
    const result = await aggregator.aggregate({
      roundId: 'test-round',
      submissions: [
        { agentId: 'agent-1', roundId: 'test-round', value: 102.3, timestamp: Date.now() },
        { agentId: 'agent-2', roundId: 'test-round', value: 98.7, timestamp: Date.now() },
        { agentId: 'agent-3', roundId: 'test-round', value: 105.1, timestamp: Date.now() }
      ]
    });

    expect(result.aggregate).toBeCloseTo(102.03, 2);
    expect(result.participantCount).toBe(3);
    expect(result.roundId).toBe('test-round');
    expect(typeof result.timestamp).toBe('number');
  });

  it('should handle single submission', async () => {
    const aggregator = new MockAggregator();
    
    const result = await aggregator.aggregate({
      roundId: 'test-round',
      submissions: [
        { agentId: 'agent-1', roundId: 'test-round', value: 42.5, timestamp: Date.now() }
      ]
    });

    expect(result.aggregate).toBe(42.5);
    expect(result.participantCount).toBe(1);
  });
});