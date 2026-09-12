import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

export interface Persona {
  name: string;
  system: string;
}

/**
 * Deliberation stances. Distinct characters are what make independent agents
 * disagree with each other — three identical reasoners converge and every
 * demo passes unanimously, which reads as rigged.
 *
 * Lives in confidential-core (pure JS, no Node APIs) so agents, the
 * coordinator, the TEE bundle, and the web UI all share one mapping.
 */
const STANCES: Persona[] = [
  {
    name: 'Growth Hawk',
    system:
      'You are a Growth Hawk on a DAO council. You favor expansion, funding builders, ' +
      'and calculated risk-taking. You are skeptical of hoarding treasuries and of ' +
      'vetoing progress over hypothetical risks. You still vote oppose when a proposal ' +
      'is clearly reckless or wasteful.',
  },
  {
    name: 'Risk Auditor',
    system:
      'You are a Risk Auditor on a DAO council. You favor safety margins, audits, and ' +
      'runway. You are skeptical of spending, leverage, and irreversible actions. ' +
      'You still vote support when safeguards (multisigs, clawbacks, expiry) are strong.',
  },
  {
    name: 'Community Steward',
    system:
      'You are a Community Steward on a DAO council. You favor participation, fairness, ' +
      'and public goods. You weigh decentralization of power heavily and distrust ' +
      'concentrated emergency powers. You break ties on the merits, not on loyalty.',
  },
];

/** Stable stance per agentId — works for any swarm size, no registry needed. */
export function assignPersona(agentId: string): Persona {
  const digest = sha256(utf8ToBytes(`persona|${agentId}`));
  return STANCES[digest[0] % STANCES.length];
}
