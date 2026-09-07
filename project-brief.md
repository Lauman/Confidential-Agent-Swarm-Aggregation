# [Working Title TBD] — Confidential Agent Swarm Aggregation

**Event:** ETHGlobal ETHOnline 2026 · From Scratch track
**Team:** Manza + comember (roles TBD, see Open Decisions)

---

## 1. Problem

Agentic systems that need a *collective* private signal, a price estimate, a risk score, a consensus vote, currently have to choose between two bad options: publish every participant's raw input on-chain (kills the value of the signal, exposes strategy, invites front-running/copying) or trust a centralized aggregator (defeats the point of using a decentralized agent swarm in the first place).

We want N independent agents to each hold a private value, have that value combined into a single aggregate inside a confidential execution environment, and have only the aggregate ever become public. No individual input is ever exposed, not to other agents, not to the chain, not to the aggregator operator.

## 2. What we're building

A live swarm of independent agent processes, each with its own on-chain identity, querying live on-chain data via The Graph's Subgraph MCP to compute a private estimate, then submitting that value into a Chainlink CRE Confidential Workflow that aggregates them inside a TEE. The aggregate result is settled and made consumable via an x402-gated payment flow on Hedera. Consumers (other agents or users) pay per query to access the aggregate signal.

**Core privacy guarantee:** an adversary watching every public data source (chain, HTTP traffic, ENS records) never learns any individual agent's private input, only the final aggregate.

## 3. Architecture

```
              The Graph — Subgraph MCP (live data)
                             │
            ┌────────────────┼────────────────┐
            │  query         │  query          │  query
            ▼                ▼                 ▼
                    N independent Agent processes
                    (each computes one private estimate)
         ┌──────┐  ┌──────┐  ┌──────┐        ┌──────┐
         │ A1   │  │ A2   │  │ A3   │  ...   │ AN   │
         │ ENS: │  │ ENS: │  │ ENS: │        │ ENS: │
         │ a1.  │  │ a2.  │  │ a3.  │        │ aN.  │
         │ swarm│  │ swarm│  │ swarm│        │ swarm│
         │ .eth │  │ .eth │  │ .eth │        │ .eth │
         └──┬───┘  └──┬───┘  └──┬───┘        └──┬───┘
            │         │         │                │
            └─────────┴────┬────┴────────────────┘
                            │  submit private value
                            ▼
              ┌───────────────────────────────┐
              │  Coordinator (dispatch/collect) │
              │  waits for quorum of N submits  │
              └───────────────┬─────────────────┘
                               │  batch handoff
                               ▼
              ┌───────────────────────────────┐
              │  Chainlink CRE Confidential    │
              │  Workflow (TEE handler)        │
              │  - aggregates N private values │
              │  - only the aggregate leaves   │
              │    the enclave                 │
              └───────────────┬─────────────────┘
                               │  aggregate only
                               ▼
              ┌───────────────────────────────┐
              │  x402-gated Resource Server     │
              │  (Express + x402 middleware)    │
              └───────────────┬─────────────────┘
                               │  402 → pay → 200
                               ▼
                    ┌─────────────────────┐
                    │  Hedera Testnet      │
                    │  (Blocky402          │
                    │  facilitator)        │
                    └─────────────────────┘
                               ▲
                               │  consumer pays per query
                    ┌─────────────────────┐
                    │  Consumer (agent/user)│
                    └─────────────────────┘
```

## 4. Protocol stack and sponsor alignment

| Layer | Protocol | Role | Target bounty |
|---|---|---|---|
| Identity | ENS (Sepolia, ENSv2) | One subname per swarm agent, endpoint + pubkey text records | ENS — Best Use of ENSv2 ($4,500) |
| Data source | The Graph — Subgraph MCP | Each agent queries live on-chain data to compute its private estimate | The Graph — Best AI Tooling/Use Case, Start Fresh pool ($5,000) |
| Confidentiality | Chainlink CRE Confidential Workflow | TEE aggregation of N private values, only aggregate leaves enclave | Chainlink — Best Confidential Workflow ($2,500) |
| Settlement | x402 + Hedera (Blocky402 facilitator) | Pay-per-query access to the aggregate signal | Hedera — AI & Agentic Payments ($6,000, up to 3 teams) |

No Semaphore, no ZK proof layer — dropped, not a bountied track at this event.

## 5. Public/private data model

| Data | Location | Visibility |
|---|---|---|
| Agent identities (ENS subnames) | Ethereum Sepolia | Public |
| Individual private values | CRE enclave memory only | Never leaves the enclave |
| Aggregate result | Resource server response (post-payment) | Public to paying consumers |
| Payment amounts/tx | Hedera testnet | Public |
| Negotiation/reasoning behind each agent's private value | Nowhere public | Private |

## 6. Build order and fallback checkpoints

Sequenced so that the least proven technology (CRE + Hedera glue) is isolated and the most proven parts (ENS, swarm dispatch) are built around it, not blocking it.

1. **x402-gated resource server + Hedera settlement** (own leg, no dependency on the rest). Working end to end with a hardcoded aggregate value. This is the fallback submission if nothing else lands.
2. **Swarm dispatch/collect loop.** N agent processes each submit a value to a coordinator that waits for quorum.
3. **CRE Confidential Workflow handler.** Takes the batch of N private values, aggregates inside the enclave, returns only the aggregate. Test standalone via `cre workflow simulate` before wiring to steps 1-2.
4. **ENS subname registration + resolution.** One subname per agent, text records for endpoint/pubkey. Lowest risk, do last, good use of slack time.
5. **Wire it all together.** CRE aggregate output feeds the resource server's response; consumer pays via x402 to retrieve it.
6. **Subgraph MCP integration (post-core).** Each agent queries live on-chain data via the Subgraph MCP and uses it to compute its private estimate, replacing the hardcoded/synthetic value from step 2. Cheapest of the four legs to add, do it only after 1-5 work end to end.

**Checkpoint:** by roughly the halfway mark, step 1 should be a complete, independently submittable project. Steps 2-6 are score multipliers, not dependencies the whole submission hinges on.

## 7. Key risks

- **CRE is beta, unfamiliar to the team.** No mature library for confirming the enclave's output cleanly hands off to the resource server. De-risk by testing this seam early and standalone (step 3, before full integration).
- **Facilitator dependency.** Blocky402 outage during the event kills the settlement leg for every team using it, not just us. Consider a self-facilitation fallback if time allows.
- **Swarm quorum timing.** N live processes need to actually reach quorum reliably in a live demo. Decide N (suggest 3 for lower coordination overhead) and test the dispatch loop under time pressure before demo day.
- **"Aggregate" needs to be a real function, not decoration.** A simple average of N numbers is honest but thin for judges. Decide the actual scenario (see below) so the aggregate has real meaning.
- **Fourth vendor to touch.** The Graph is a low-lift addition on its own, but it's still one more integration point in a time-boxed build. Sequence it after the CRE/Hedera/ENS core works (step 6), not alongside it.

## 8. Open decisions (not yet settled — resolve before or early in the event)

- **Scenario — resolved in shape, not detail.** Each agent independently computes a private estimate (e.g. a price or risk assessment) from live data pulled via the Subgraph MCP, then submits it privately. Still open: which specific protocol/subgraph and which metric to pull.
- **Team split.** Who owns CRE integration vs. ENS/swarm dispatch vs. Hedera/x402. Given three sponsor tracks and one genuinely hard integration seam (CRE→Hedera), splitting by seam rather than by layer may reduce handoff risk.
- **Swarm size (N).** Suggest 3 for demo reliability; revisit if the scenario needs more to feel credible.
- **Working title / submission framing.**

---

*Draft — living document, update as decisions above get made.*
