import { describe, it, expect, beforeEach } from 'vitest';
import { RoundManager } from '../../apps/coordinator/src/round-manager.js';

describe('RoundManager', () => {
  let roundManager: RoundManager;

  beforeEach(() => {
    roundManager = new RoundManager(3);
  });

  it('should provide a current round ID', () => {
    const roundId = roundManager.getCurrentRoundId();
    expect(typeof roundId).toBe('string');
    expect(roundId.startsWith('round-')).toBe(true);
  });

  it('should collect submissions until quorum', async () => {
    const roundId = roundManager.getCurrentRoundId();

    const submission1 = {
      agentId: 'agent-1',
      roundId,
      value: 102.3,
      timestamp: Date.now()
    };

    const result1 = await roundManager.handleSubmit(submission1);
    expect(result1).toBeNull();

    const submission2 = {
      agentId: 'agent-2',
      roundId,
      value: 98.7,
      timestamp: Date.now()
    };

    const result2 = await roundManager.handleSubmit(submission2);
    expect(result2).toBeNull();

    const submission3 = {
      agentId: 'agent-3',
      roundId,
      value: 105.1,
      timestamp: Date.now()
    };

    const result3 = await roundManager.handleSubmit(submission3);
    expect(result3).not.toBeNull();
    expect(result3!.aggregate).toBeCloseTo(102.03, 2);
    expect(result3!.participantCount).toBe(3);
  });

  it('should rotate round ID after quorum', async () => {
    const originalRoundId = roundManager.getCurrentRoundId();

    await roundManager.handleSubmit({ agentId: 'agent-1', roundId: originalRoundId, value: 100, timestamp: Date.now() });
    await roundManager.handleSubmit({ agentId: 'agent-2', roundId: originalRoundId, value: 100, timestamp: Date.now() });
    await roundManager.handleSubmit({ agentId: 'agent-3', roundId: originalRoundId, value: 100, timestamp: Date.now() });

    const newRoundId = roundManager.getCurrentRoundId();
    expect(newRoundId).not.toBe(originalRoundId);
  });

  it('should reject submissions to completed rounds', async () => {
    const roundId = roundManager.getCurrentRoundId();

    await roundManager.handleSubmit({ agentId: 'agent-1', roundId, value: 100, timestamp: Date.now() });
    await roundManager.handleSubmit({ agentId: 'agent-2', roundId, value: 100, timestamp: Date.now() });
    await roundManager.handleSubmit({ agentId: 'agent-3', roundId, value: 100, timestamp: Date.now() });

    await expect(
      roundManager.handleSubmit({ agentId: 'agent-4', roundId, value: 100, timestamp: Date.now() })
    ).rejects.toThrow('not accepting submissions');
  });

  it('should return latest result', async () => {
    expect(roundManager.getLatestResult()).toBeUndefined();

    const roundId = roundManager.getCurrentRoundId();
    await roundManager.handleSubmit({ agentId: 'agent-1', roundId, value: 100, timestamp: Date.now() });
    await roundManager.handleSubmit({ agentId: 'agent-2', roundId, value: 100, timestamp: Date.now() });
    await roundManager.handleSubmit({ agentId: 'agent-3', roundId, value: 100, timestamp: Date.now() });

    const result = roundManager.getLatestResult();
    expect(result).not.toBeUndefined();
    expect(result!.aggregate).toBe(100);
  });
});