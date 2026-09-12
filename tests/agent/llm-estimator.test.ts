import { describe, it, expect, vi, afterEach } from 'vitest';
import { deliberateLLM, stripFences, type LLMConfig } from '../../apps/agent/src/payload/llm-estimator.js';
import { assignPersona } from '../../apps/agent/src/payload/personas.js';
import { loadProposal, listProposals } from '../../apps/agent/src/payload/proposals.js';

const config: LLMConfig = {
  baseUrl: 'https://llm.example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
};

const proposal = loadProposal('dao-grants-007');
const persona = assignPersona('agent-1');

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deliberateLLM', () => {
  it('parses a valid ballot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{"vote":"support","confidence":0.85,"rationale":"Strong safeguards"}' } }] }))
    );

    const ballot = await deliberateLLM(proposal, persona, config);
    expect(ballot.proposalRef).toBe('dao-grants-007');
    expect(ballot.vote).toBe('support');
    expect(ballot.confidence).toBe(0.85);
    expect(ballot.rationaleRedacted).toBe('Strong safeguards');
  });

  it('retries once then falls back to an explicit abstain on garbage', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'not json at all' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    const ballot = await deliberateLLM(proposal, persona, config);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ballot.vote).toBe('abstain');
    expect(ballot.confidence).toBe(0.1);
    expect(ballot.proposalRef).toBe('dao-grants-007');
  });

  it('falls back on repeated HTTP errors', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'busy' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    const ballot = await deliberateLLM(proposal, persona, config);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ballot.vote).toBe('abstain');
  });

  it('rejects invalid vote values from the model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{"vote":"maybe","confidence":0.9}' } }] }))
    );

    const ballot = await deliberateLLM(proposal, persona, config);
    expect(ballot.vote).toBe('abstain');
  });

  it('parses fenced and trailed JSON (models ignore response_format)', async () => {
    const fenced = '```json\n{"vote":"oppose","confidence":0.7,"rationale":"risky"}\n```';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: fenced } }] }))
    );

    const ballot = await deliberateLLM(proposal, persona, config);
    expect(ballot.vote).toBe('oppose');
    expect(ballot.confidence).toBe(0.7);

    expect(stripFences('prefix text {"vote":"support","confidence":0.5} trailing')).toBe(
      '{"vote":"support","confidence":0.5}'
    );
  });
});

describe('personas', () => {
  it('are stable per agent and valid stances', () => {
    const a1 = assignPersona('agent-1');
    expect(assignPersona('agent-1')).toEqual(a1);
    expect(a1.name.length).toBeGreaterThan(0);
    expect(a1.system).toContain('DAO council');

    const names = new Set(['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'].map((id) => assignPersona(id).name));
    expect(names.size).toBeGreaterThanOrEqual(1);
    expect(names.size).toBeLessThanOrEqual(3);
  });
});

describe('proposals', () => {
  it('loads known refs and lists them', () => {
    expect(listProposals().length).toBeGreaterThanOrEqual(2);
    const p = loadProposal('dao-treasury-001');
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.body.length).toBeGreaterThan(0);
  });

  it('fails loudly on unknown refs', () => {
    expect(() => loadProposal('nope')).toThrow(/Unknown proposal ref/);
  });
});
