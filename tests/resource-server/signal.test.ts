import { describe, it, expect } from 'vitest';
import { SignalService } from '../../apps/resource-server/src/services/signal-service.js';

describe('SignalService', () => {
  it('should return aggregate signal', async () => {
    const service = new SignalService();
    const signal = await service.getAggregateSignal();
    
    expect(typeof signal).toBe('number');
    expect(signal).toBe(102.03);
  });

  it('should update aggregate', async () => {
    const service = new SignalService();
    
    service.updateAggregate(200.5);
    const signal = await service.getAggregateSignal();
    
    expect(signal).toBe(200.5);
  });
});