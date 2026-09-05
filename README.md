# Private Signal Swarm

Confidential Agent Swarm Aggregation - ETHGlobal ETHOnline 2026

## Overview

A swarm of independent agents, each with private data, aggregates values inside a TEE (Trusted Execution Environment) without exposing individual inputs. The aggregate result is served via x402-gated payments on Hedera.

## Architecture

```
Agent 1 ─┐
Agent 2 ─┼─→ Coordinator ─→ CRE TEE ─→ Resource Server ─→ x402/Hedera
Agent 3 ─┘
```

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Build shared types
pnpm --filter @private-signal-swarm/types build
```

## Development

```bash
# Run all apps in development mode
pnpm dev

# Run specific app
pnpm --filter @private-signal-swarm/resource-server dev
pnpm --filter @private-signal-swarm/coordinator dev
pnpm --filter @private-signal-swarm/agent dev
```

## Testing

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm --filter @private-signal-swarm/types test
```

## Project Structure

```
private-signal-swarm/
├── apps/
│   ├── agent/           # Agent process
│   ├── coordinator/     # Quorum manager
│   └── resource-server/ # x402-gated API
├── cre/
│   └── workflows/       # Chainlink CRE workflows
├── packages/
│   └── types/           # Shared TypeScript types
├── scripts/
└── tests/
```

## Checkpoints

1. **Checkpoint A**: Resource server + x402/Hedera (fallback submission)
2. **Checkpoint B**: Agent × 3 → Coordinator
3. **Checkpoint C**: Coordinator → CRE → Aggregate
4. **Checkpoint D**: Full flow end-to-end
5. **Checkpoint E**: ENS + The Graph integration