import { describe, it, expect } from 'vitest';
import { Estimator } from '../../apps/agent/src/estimator.js';

describe('Estimator', () => {
  it('should compute a value from data', () => {
    const estimator = new Estimator();
    const result = estimator.compute({ test: 'data' });
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(0);
  });
});