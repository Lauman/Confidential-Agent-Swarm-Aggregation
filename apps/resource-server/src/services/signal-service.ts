export class SignalService {
  private cachedAggregate: number | null = null;

  async getAggregateSignal(): Promise<number> {
    // TODO: Replace with CRE workflow result
    // For now, return hardcoded aggregate as per Phase 2
    if (this.cachedAggregate === null) {
      this.cachedAggregate = 102.03;
    }
    return this.cachedAggregate;
  }

  updateAggregate(value: number): void {
    this.cachedAggregate = value;
  }
}