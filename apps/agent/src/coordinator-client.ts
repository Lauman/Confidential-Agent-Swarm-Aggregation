import type { EncryptedEnvelope, EnvelopeErrorBody, TeeSignedResult } from '@private-signal-swarm/types';

export class CoordinatorClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CoordinatorClientError';
    this.code = code;
  }
}

export class CoordinatorClient {
  private readonly endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async getCurrentRoundId(useCase: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/round/current?useCase=${encodeURIComponent(useCase)}`);
    } catch {
      throw new CoordinatorClientError('network', `Unreachable coordinator at ${this.endpoint}`);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as EnvelopeErrorBody | null;
      throw new CoordinatorClientError(body?.error ?? 'network', body?.message ?? `Failed to get round: ${response.statusText}`);
    }
    const data = (await response.json()) as { roundId: string };
    return data.roundId;
  }

  async submit(envelope: EncryptedEnvelope): Promise<{ status: string; result?: TeeSignedResult }> {
    let response: Response;
    try {
      response = await fetch(`${this.endpoint}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });
    } catch {
      throw new CoordinatorClientError('network', `Unreachable coordinator at ${this.endpoint}`);
    }
    const body = (await response.json().catch(() => null)) as
      | { status?: string; result?: TeeSignedResult }
      | EnvelopeErrorBody
      | null;

    if (!response.ok) {
      const errorBody = body as EnvelopeErrorBody | null;
      throw new CoordinatorClientError(
        errorBody?.error ?? 'network',
        errorBody?.message ?? `Submit failed: ${response.statusText}`
      );
    }

    return body as { status: string; result?: TeeSignedResult };
  }
}
