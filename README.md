# Private Signal Swarm

Confidential Agent Swarm Aggregation - ETHGlobal ETHOnline 2026

## Overview

A swarm of independent agents, each with private data, aggregates values inside a TEE (Trusted Execution Environment) without exposing individual inputs. The aggregate result is served via x402-gated payments.

## Architecture

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Agent   │────▶│ Coordinator │────▶│     TEE     │────▶│Resource Server│
│ (submit) │     │  (blind)    │     │ (decrypt +  │     │  (verified)  │
│          │     │             │     │  aggregate) │     │              │
└─────────┘     └─────────────┘     └─────────────┘     └──────────────┘
```

- **Agent**: Encrypts private data (e.g., DAO votes) and submits to coordinator
- **Coordinator**: Blind quorum manager - validates signatures, never sees plaintext
- **TEE**: Decrypts, aggregates, and signs results (runs in CRE or locally)
- **Resource Server**: Serves verified results to paying consumers via x402

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd Confidential-Agent-Swarm-Aggregation

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Build all packages
pnpm build
```

## Development

### Start Services (3 terminals)

```bash
# Terminal 1: Start coordinator
pnpm --filter @private-signal-swarm/coordinator dev

# Terminal 2: Start resource server
pnpm --filter @private-signal-swarm/resource-server dev

# Terminal 3: Start agents (run each in separate terminal)
AGENT_ID=agent-1 pnpm --filter @private-signal-swarm/agent dev
AGENT_ID=agent-2 pnpm --filter @private-signal-swarm/agent dev
AGENT_ID=agent-3 pnpm --filter @private-signal-swarm/agent dev
```

### Quick Start (All Services)

```bash
# Start all services in parallel
pnpm dev
```

## Testing

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm --filter @private-signal-swarm/cre-workflow test
```

## CRE Simulation

```bash
# Run CRE workflow simulation
cd cre/aggregate
pnpm simulate
```

## Project Structure

```
private-signal-swarm/
├── apps/
│   ├── agent/                    # Agent process (encrypts & submits votes)
│   ├── coordinator/              # Quorum manager (blind coordinator)
│   └── resource-server/          # x402-gated API (serves verified results)
├── packages/
│   ├── types/                    # Shared TypeScript types
│   └── confidential-core/        # Crypto & TEE processing logic
├── cre/
│   └── aggregate/                # CRE workflow (runs in Nitro TEE)
├── tests/
│   ├── agent/                    # Agent tests
│   ├── coordinator/              # Coordinator tests
│   ├── resource-server/          # Resource server tests
│   ├── cre/                      # CRE workflow tests
│   └── e2e/                      # End-to-end tests
└── .env.example                  # Environment variables template
```

## Environment Variables

See `.env.example` for all configuration options:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Resource server port | 3000 |
| `COORDINATOR_PORT` | Coordinator port | 3001 |
| `QUORUM` | Number of agents needed for aggregation | 3 |
| `AGENT_ID` | Unique agent identifier | agent-1 |
| `RESULT_INGEST_URL` | Coordinator → Resource Server push URL | http://localhost:3000/api/internal/ingest |

## How It Works

1. **Key Generation**: TEE encryption keypair + signing keypair generated once
2. **Agent Submission**: Agent encrypts ballot to TEE public key, signs with Ed25519
3. **Coordinator**: Validates signatures, manages quorum, never sees plaintext
4. **TEE Processing**: Decrypts all ballots, aggregates (tally), signs result
5. **Result Distribution**: Coordinator pushes signed result to resource server
6. **Consumer Access**: Consumer pays via x402, receives verified aggregate result

## Checkpoints

1. **Checkpoint A**: Resource server + x402/Hedera (fallback submission)
2. **Checkpoint B**: Agent × 3 → Coordinator
3. **Checkpoint C**: Coordinator → CRE → Aggregate
4. **Checkpoint D**: Full flow end-to-end
5. **Checkpoint E**: ENS + The Graph integration
