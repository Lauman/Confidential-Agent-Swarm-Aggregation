import { describe, it, expect } from 'vitest';
import { handler } from '../../cre/workflows/aggregate/src/handler.js';

describe('CRE Aggregation Handler', () => {
  it('should aggregate values correctly', () => {
    const input = {
      values: [102.3, 98.7, 105.1],
      roundId: 'test-round-001'
    };
    
    const result = handler(input);
    
    expect(result.aggregate).toBeCloseTo(102.03, 2);
    expect(result.participantCount).toBe(3);
    expect(result.roundId).toBe('test-round-001');
  });

  it('should throw on empty values', () => {
    const input = {
      values: [],
      roundId: 'test-round-002'
    };
    
    expect(() => handler(input)).toThrow('No values provided for aggregation');
  });
});