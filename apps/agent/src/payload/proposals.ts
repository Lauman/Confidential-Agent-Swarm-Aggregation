import { createHash } from 'node:crypto';
import proposals from './proposals.json' with { type: 'json' };

export interface Proposal {
  ref: string;
  title: string;
  body: string;
}

const KNOWN = new Map<string, Proposal>(
  (proposals as { proposals: Proposal[] }).proposals.map((p) => [p.ref, p])
);

export function loadProposal(ref: string): Proposal {
  const proposal = KNOWN.get(ref);
  if (!proposal) {
    throw new Error(
      `Unknown proposal ref: ${ref}. Known: ${Array.from(KNOWN.keys()).join(', ')}`
    );
  }
  return proposal;
}

export function listProposals(): Proposal[] {
  return Array.from(KNOWN.values());
}
