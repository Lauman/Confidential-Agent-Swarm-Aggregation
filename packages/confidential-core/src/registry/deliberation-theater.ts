import { assignPersona } from './personas.js';

export interface TheaterLine {
  agentId: string;
  persona: string;
  text: string;
  phase: 'reading' | 'weighing' | 'sealing' | 'sealed';
}

const READING: Record<string, string> = {
  'Growth Hawk': 'pulling prior-round completion data…',
  'Risk Auditor': 'stress-testing runway impact…',
  'Community Steward': 'reading participation impact…',
};

const WEIGHING: Record<string, string> = {
  'Growth Hawk': 'checking milestone clawback strength…',
  'Risk Auditor': 'verifying multisig safeguards…',
  'Community Steward': 'checking power concentration…',
};

const FALLBACK_READING = 'opening proposal brief…';
const FALLBACK_WEIGHING = 'weighing tradeoffs privately…';

/**
 * Deterministic demo theater script. Procedural chatter only — never vote
 * direction, confidence, or rationale. Real ballots stay sealed in the TEE;
 * this is what the UI animates while agents deliberate (mock or LLM alike).
 * Pure JS so web, agents, and TEE bundle share it.
 */
export function theaterScript(agentIds: readonly string[], proposalRef: string): TheaterLine[] {
  const ref = proposalRef.trim() || 'proposal';
  const lines: TheaterLine[] = [];
  agentIds.forEach((agentId) => {
    const persona = assignPersona(agentId).name;
    lines.push({ agentId, persona, text: `opening ${ref}…`, phase: 'reading' });
    lines.push({ agentId, persona, text: READING[persona] ?? FALLBACK_READING, phase: 'reading' });
    lines.push({ agentId, persona, text: WEIGHING[persona] ?? FALLBACK_WEIGHING, phase: 'weighing' });
    lines.push({ agentId, persona, text: 'sealing ballot — content stays in the TEE…', phase: 'sealing' });
  });
  const sealed = agentIds.map((agentId) => ({
    agentId,
    persona: assignPersona(agentId).name,
    text: 'sealed ✓',
    phase: 'sealed' as const,
  }));
  return [...interleave(lines), ...sealed];
}

function interleave(lines: TheaterLine[]): TheaterLine[] {
  const perAgent = new Map<string, TheaterLine[]>();
  for (const line of lines) {
    const list = perAgent.get(line.agentId) ?? [];
    list.push(line);
    perAgent.set(line.agentId, list);
  }
  const groups = Array.from(perAgent.values());
  const out: TheaterLine[] = [];
  for (let i = 0; i < Math.max(...groups.map((g) => g.length)); i += 1) {
    for (const g of groups) {
      if (g[i]) {
        out.push(g[i]);
      }
    }
  }
  return out;
}
