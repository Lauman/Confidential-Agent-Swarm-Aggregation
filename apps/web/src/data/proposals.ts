/**
 * Frozen demo content — mirrors apps/agent/src/payload/proposals.json
 * (the agents' source of truth). Duplicated, not imported, so the UI bundle
 * stays free of agent runtime code. Update both if demo content changes.
 */
export interface ProposalView {
  ref: string;
  title: string;
  body: string;
}

export const PROPOSALS: ProposalView[] = [
  {
    ref: 'dao-grants-007',
    title: 'Community Grants Round 7 — 120,000 tokens',
    body: 'Fund nine community-built public goods from the ecosystem reserve (4% of quarterly budget). Milestone payouts, multisig clawback, 92% completion in prior rounds — against grant-farming history and thin reviewer bandwidth.',
  },
  {
    ref: 'dao-treasury-001',
    title: 'Treasury Rebalance — 40% into staked ETH',
    body: 'Move 40% of stablecoin reserves into staked ETH for 3–4% extra yield and ecosystem alignment — halving stables runway from 26 to 13 months ahead of a major upgrade.',
  },
  {
    ref: 'dao-risk-009',
    title: 'Emergency Pause Guardian — 3-of-5 council',
    body: 'A 3-of-5 council able to pause core contracts up to 72h during exploits, auto-expiring with mandatory post-mortem — after last month\u2019s $2M near-miss took 9 hours to coordinate.',
  },
];

export function findProposal(ref: string): ProposalView | undefined {
  return PROPOSALS.find((p) => p.ref === ref);
}
