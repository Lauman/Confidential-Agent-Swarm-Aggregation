import { describe, it, expect, beforeEach } from 'vitest';
import { RoundManager } from '../../apps/coordinator/src/round-manager.js';

describe('RoundManager', () => {
  let roundManager: RoundManager;

  beforeEach(() => {
    roundManager = new RoundManager(3);
  });

  it('should collect submissions until quorum', async () => {
    const submission1 = {
      agentId: 'agent-1',
      roundId: 'round-001',
      value: 102.3,
      timestamp: Date.now()
    };

    const result1 = await roundManager.handleSubmit(submission1);
    expect(result1).toBeNull();

    const submission2 = {
      agentId: 'agent-2',
      roundId: 'round-001',
      value: 98.7,
      timestamp: Date.now()
    };

    const result2 = await roundManager.handleSubmit(submission2);
    expect(result2).toBeNull();

    const submission3 = {
      agentId: 'agent-3',
      roundId: 'round-001',
      value: 105.1,
      timestamp: Date.now()
    };

    const result3 = await roundManager.handleSubmit(submission3);
    expect(result3).not.toBeNull();
    expect(result3!.aggregate).toBeCloseTo(102.03, 2);
    expect(result3!.participantCount).toBe(3);
  });
});