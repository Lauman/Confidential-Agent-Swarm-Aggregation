export class ResultPusher {
  private readonly url?: string;

  constructor(url?: string) {
    this.url = url;
  }

  async push(result: unknown): Promise<void> {
    if (!this.url) {
      return;
    }
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!response.ok) {
        console.error(`Result ingest push failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Result ingest push error: ${error instanceof Error ? error.message : error}`);
    }
  }
}
