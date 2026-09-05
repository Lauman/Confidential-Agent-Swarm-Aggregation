export class MockDataSource {
  async fetchData(): Promise<unknown> {
    // TODO: Replace with Subgraph MCP integration
    // For now, return mock data
    return {
      timestamp: Date.now(),
      source: 'mock',
      value: Math.random()
    };
  }
}