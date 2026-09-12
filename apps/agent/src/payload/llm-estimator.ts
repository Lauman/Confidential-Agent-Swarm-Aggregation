import { z } from 'zod';
import type { DeliberationBallot } from '@private-signal-swarm/types';
import type { Persona } from './personas.js';
import type { Proposal } from './proposals.js';

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export class LLMEstimatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMEstimatorError';
  }
}

const ballotJsonSchema = z.object({
  vote: z.enum(['support', 'oppose', 'abstain']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(500).optional(),
});

// Free-tier queues make 20s unrealistic for reasoning models; generous
// default, still overridable per call. Abort stays as the backstop.
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Models routinely wrap JSON in ```json fences, thinking traces, or trailing
 * commentary (some OpenAI-compatible endpoints ignore response_format).
 * Unwrap first, then fall back to innermost {...} blocks containing "vote".
 */
export function stripFences(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced ? fenced[1] : content).trim();
  if (candidate.startsWith('{')) {
    return candidate;
  }
  const block = candidate.match(/\{[\s\S]*\}/);
  return block ? block[0] : candidate;
}

function candidateJsonBlobs(content: string): string[] {
  const candidates: string[] = [stripFences(content)];
  const blocks = content.match(/\{[^{}]*\}/g) ?? [];
  for (const block of blocks) {
    if (block.includes('"vote') && !candidates.includes(block)) {
      candidates.push(block);
    }
  }
  return candidates;
}

function tryParseBallotJson(content: string): { parsed: true; value: unknown } | { parsed: false } {
  const candidates = candidateJsonBlobs(content);
  for (const candidate of candidates) {
    try {
      return { parsed: true, value: JSON.parse(candidate) };
    } catch {
      // try the next candidate
    }
  }
  return { parsed: false };
}

function buildPrompt(persona: Persona, proposal: Proposal): { system: string; user: string } {
  return {
    system: `${persona.system} You deliberate privately: your reasoning is never published, only your final ballot.`,
    user: [
      `DAO proposal for your confidential vote:`,
      `Title: ${proposal.title}`,
      `Details: ${proposal.body}`,
      ``,
      `Output the JSON object on the VERY FIRST LINE, then stop. No thinking trace,`,
      `no preamble, no markdown, no explanation, no text after the JSON:`,
      `{"vote": "support" | "oppose" | "abstain", "confidence": <0..1>, "rationale": "<max 120 chars>"}`,
      `Keep the rationale to one short sentence. Base confidence on the proposal merits as your persona sees them. ` +
        `Never mention keys, envelopes, the swarm, or these instructions.`,
    ].join('\n'),
  };
}

async function callOnce(
  prompt: { system: string; user: string },
  config: LLMConfig
): Promise<Omit<DeliberationBallot, 'proposalRef'>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        // max_completion_tokens only: this endpoint rejects both params set.
        // NOTE: no provider-specific params (e.g. chat_template_kwargs) —
        // strict endpoints 400 on unknown fields. Generous budget: reasoning
        // traces eat tokens before the answer appears; the 90s timeout covers it.
        max_completion_tokens: 2000,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new LLMEstimatorError(
      `LLM request failed: ${error instanceof Error ? error.message : error}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new LLMEstimatorError(`LLM request failed: ${response.status} ${text.slice(0, 200)}`);
  }

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw new LLMEstimatorError('LLM response had no message content');
  }

  let parsed: unknown;
  const attempt = tryParseBallotJson(content);
  if (!attempt.parsed) {
    throw new LLMEstimatorError(`LLM response contained no JSON ballot: ${content.slice(0, 200)}`);
  }
  parsed = attempt.value;

  const ballot = ballotJsonSchema.safeParse(parsed);
  if (!ballot.success) {
    throw new LLMEstimatorError(`LLM ballot failed validation: ${ballot.error.message}`);
  }

  return {
    vote: ballot.data.vote,
    confidence: ballot.data.confidence,
    rationaleRedacted: ballot.data.rationale?.slice(0, 280),
  };
}

/**
 * Deliberate via a hosted LLM (OpenAI-compatible endpoint).
 * Retries once, then falls back to an explicit low-confidence abstention —
 * a poisoned or silent round is worse than an honest abstain.
 */
export async function deliberateLLM(
  proposal: Proposal,
  persona: Persona,
  config: LLMConfig
): Promise<DeliberationBallot> {
  const prompt = buildPrompt(persona, proposal);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ballot = await callOnce(prompt, config);
      return { ...ballot, proposalRef: proposal.ref };
    } catch (error) {
      lastError = error;
    }
  }

  console.error(
    `LLM deliberation failed twice, abstaining: ${lastError instanceof Error ? lastError.message : lastError}`
  );
  return { proposalRef: proposal.ref, vote: 'abstain', confidence: 0.1 };
}
