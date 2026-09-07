MVP Boilerplate Plan
Phase 0 — Repository foundation

Goal: Create a clean monorepo with independent applications and shared types.

private-signal-swarm/
│
├── apps/
│   ├── agent/
│   ├── coordinator/
│   └── resource-server/
│
├── cre/
│   └── workflows/
│
├── packages/
│   └── types/
│
├── scripts/
│
├── tests/
│
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md

Use TypeScript + Node.js + pnpm workspaces.

Do not introduce a frontend, database, Docker or Kubernetes at this stage.

Phase 1 — Shared protocol types

Create a small packages/types package.

Define the contracts between components before implementing them.

For example:

AgentSubmission
    agentId
    roundId
    value
    signature?
AggregationRequest
    roundId
    submissions[]
AggregationResult
    roundId
    aggregate

The important point is that the three applications should communicate through explicit types rather than ad-hoc JSON.

Deliverable
packages/types
    └── src/
        ├── agent.ts
        ├── aggregation.ts
        └── index.ts
Phase 2 — Resource Server

Build this before the swarm.

The document explicitly makes the x402 + Hedera resource server the first independent checkpoint and says it should work initially with a hardcoded aggregate.

Structure:

apps/resource-server/

├── src/
│   ├── server.ts
│   ├── routes/
│   │   └── signal.ts
│   ├── services/
│   │   └── signal-service.ts
│   └── x402/
│       └── middleware.ts
│
└── package.json

Initially:

GET /signal
       │
       ▼
hardcoded aggregate
       │
       ▼
x402
       │
       ▼
Hedera

The endpoint should eventually behave like:

GET /signal

402 Payment Required

then, after payment:

200 OK

{
  "aggregate": 102.03
}
Deliverable

A consumer can independently obtain a paid signal.

This is your first fallback milestone.

Phase 3 — Agent

Now create the agent process.

apps/agent/

├── src/
│   ├── agent.ts
│   ├── estimator.ts
│   ├── data-source.ts
│   ├── coordinator-client.ts
│   └── config.ts
│
└── package.json

Keep the interfaces deliberately simple.

DataSource
     ↓
Estimator
     ↓
Agent
     ↓
CoordinatorClient

Initially the data source is fake:

Agent 1 → 102.3
Agent 2 → 98.7
Agent 3 → 105.1

Do not integrate The Graph yet. The project document explicitly places Subgraph MCP after the core system is working.

Phase 4 — Coordinator

Create:

apps/coordinator/

├── src/
│   ├── server.ts
│   ├── coordinator.ts
│   ├── round-manager.ts
│   └── config.ts
│
└── package.json

The coordinator should expose something conceptually like:

POST /submit

Agents send:

{
  "roundId": "round-001",
  "agentId": "agent-1",
  "value": 102.3
}

The coordinator maintains:

round-001
 ├── agent-1 → 102.3
 ├── agent-2 → 98.7
 └── agent-3 → 105.1

Once quorum is reached:

3 / 3
  ↓
batch
  ↓
CRE

For the MVP, use:

N = 3
quorum = 3

The document also recommends three agents initially to reduce coordination risk during the demo.

Phase 5 — CRE Confidential Workflow

Now create:

cre/

└── workflows/
    └── aggregate/
        ├── workflow.ts
        ├── handler.ts
        └── types.ts

The workflow receives:

[
  102.3,
  98.7,
  105.1
]

and produces:

102.03

The critical architectural rule:

                  PRIVATE
                     │
                     ▼
             ┌───────────────┐
             │      TEE      │
             │               │
             │  [102.3,...]  │
             │       ↓       │
             │   aggregate   │
             └───────┬───────┘
                     │
                     ▼
                  PUBLIC
                  102.03

The individual values must never become part of the public output. That is the core privacy guarantee described in the project brief.

Before integrating it with the coordinator, test the workflow independently using cre workflow simulate, as proposed in the build order.

Phase 6 — Connect the core

At this point connect:

Agent
  │
  │ submit
  ▼
Coordinator
  │
  │ batch
  ▼
CRE TEE
  │
  │ aggregate
  ▼
Resource Server

The resource server should no longer return:

102.03 // hardcoded

but:

CRE result

Now you have the actual core MVP.

Phase 7 — ENS

Only after the previous flow works.

Add:

apps/agent/src/identity/
    ens.ts

Each agent gets an ENS subname:

agent1.swarm.eth
agent2.swarm.eth
agent3.swarm.eth

with records for things such as:

endpoint
publicKey

This corresponds to the project's proposed ENS identity layer.

Phase 8 — The Graph / Subgraph MCP

Finally replace:

MockDataSource

with:

SubgraphDataSource

So the final agent pipeline becomes:

The Graph
    ↓
Subgraph MCP
    ↓
Agent
    ↓
Estimator
    ↓
Private value
    ↓
Coordinator

This should be the last major integration because it is not required to prove the confidential aggregation architecture.

Testing strategy

I would create tests alongside each component rather than leaving them all for the end.

tests/

├── types/
├── agent/
│   └── estimator.test.ts
│
├── coordinator/
│   ├── submission.test.ts
│   ├── quorum.test.ts
│   └── rounds.test.ts
│
├── cre/
│   └── aggregation.test.ts
│
├── resource-server/
│   └── signal.test.ts
│
└── e2e/
    └── swarm-flow.test.ts

The most important E2E test eventually becomes:

3 agents
   ↓
3 private values
   ↓
quorum
   ↓
CRE
   ↓
aggregate
   ↓
x402
   ↓
payment
   ↓
consumer receives aggregate
The implementation order

I would use this exact sequence:

01  Monorepo
        ↓
02  Shared types
        ↓
03  Resource Server
        ↓
04  Agent
        ↓
05  Coordinator
        ↓
06  CRE workflow
        ↓
07  Core integration
        ↓
08  E2E test
        ↓
09  ENS
        ↓
10  The Graph / Subgraph MCP
        ↓
11  Demo / polish

And, critically, define checkpoints:

Checkpoint A
Consumer → x402 → Hedera → Resource Server

If this works, you already have a minimally demonstrable project. The brief explicitly identifies this as the independent fallback submission.

Checkpoint B
Agent × 3 → Coordinator
Checkpoint C
Coordinator → CRE → Aggregate
Checkpoint D
Agent × 3
    ↓
Coordinator
    ↓
CRE / TEE
    ↓
Resource Server
    ↓
x402 / Hedera
    ↓
Consumer
Checkpoint E
ENS + The Graph
One architectural decision I'd make now

I'd keep the domain logic independent of all vendor integrations.

For example:

Agent
 ├── Estimator          ← domain logic
 ├── DataSource         ← interface
 └── CoordinatorClient  ← interface

rather than:

Agent
 └── TheGraphChainlinkHederaENSWhatever.ts

Likewise:

Coordinator
 └── ConfidentialAggregator

should be an abstraction that can initially point to a mock implementation and later to CRE.

That gives you this development progression:

                    MVP development

MockData ───────────────┐
                        ▼
                    Estimator
                        │
MockCRE ────────────────┤
                        ▼
                    Coordinator
                        │
MockPayment ────────────┤
                        ▼
                  Resource Server


                    Production path

The Graph ──────────────┐
                        ▼
                    Estimator
                        │
CRE TEE ────────────────┤
                        ▼
                    Coordinator
                        │
x402 + Hedera ──────────┤
                        ▼
                  Resource Server

This is the main thing I'd establish before writing boilerplate. Otherwise there's a real risk of spending the first days wiring SDKs together instead of building the actual protocol.