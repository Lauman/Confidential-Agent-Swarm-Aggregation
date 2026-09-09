# AGENTS.md

## Build & Lint Commands

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Run specific test suite
pnpm --filter @private-signal-swarm/cre-workflow test
pnpm --filter @private-signal-swarm/agent test
pnpm --filter @private-signal-swarm/coordinator test
pnpm --filter @private-signal-swarm/resource-server test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Run E2E tests
pnpm test:e2e
```

## Code Style

- **Language**: TypeScript (ESM modules)
- **Runtime**: Node.js >= 18.0.0
- **Package Manager**: pnpm >= 8.0.0
- **Testing**: Vitest
- **Framework**: Express (coordinator, resource-server)
- **Crypto**: `@noble/curves`, `@noble/ciphers`, `libsodium-wrappers`

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `envelope-sign.ts`)
- **Types/Interfaces**: `PascalCase` (e.g., `EncryptedEnvelope`)
- **Functions**: `camelCase` (e.g., `processBatch`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `ENVELOPE_VERSION`)

### Imports

```typescript
// Use .js extension for ESM
import { processBatch } from '@private-signal-swarm/confidential-core';
import { ENVELOPE_VERSION } from '@private-signal-swarm/types';
```

## Project Structure

```
private-signal-swarm/
├── apps/
│   ├── agent/              # Agent process (encrypts & submits votes)
│   ├── coordinator/        # Quorum manager (blind coordinator)
│   └── resource-server/    # x402-gated API (serves verified results)
├── packages/
│   ├── types/              # Shared TypeScript types
│   └── confidential-core/  # Crypto & TEE processing logic
├── cre/
│   └── aggregate/          # CRE workflow (runs in Nitro TEE)
├── tests/
│   ├── agent/              # Agent tests
│   ├── coordinator/        # Coordinator tests
│   ├── resource-server/    # Resource server tests
│   ├── cre/                # CRE workflow tests
│   └── e2e/                # End-to-end tests
└── .env.example            # Environment variables template
```

## Key Files

### Packages

- `packages/types/src/` - All shared interfaces and types
- `packages/confidential-core/src/crypto/` - Encryption (X25519 + XChaCha20-Poly1305)
- `packages/confidential-core/src/tee/` - TEE processing logic

### Apps

- `apps/agent/src/main.ts` - Agent entry point
- `apps/coordinator/src/server.ts` - Coordinator entry point
- `apps/resource-server/src/server.ts` - Resource server entry point

### CRE

- `cre/aggregate/src/workflow.ts` - Main CRE workflow (confidential)
- `cre/aggregate/src/workflow-simple.ts` - Simple test workflow

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run specific package tests
pnpm --filter @private-signal-swarm/cre-workflow test
```

### E2E Tests

```bash
# Run end-to-end tests
pnpm test:e2e
```

## Environment Variables

Key variables (see `.env.example` for full list):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Resource server port | 3000 |
| `COORDINATOR_PORT` | Coordinator port | 3001 |
| `QUORUM` | Agents needed for aggregation | 3 |
| `AGENT_ID` | Unique agent identifier | agent-1 |
| `RESULT_INGEST_URL` | Coordinator → Resource Server URL | http://localhost:3000/api/internal/ingest |
| `KEYMAP_PATH` | Path to public keymap | packages/confidential-core/.dev-keys/keymap.json |
| `DEV_SECRETS_PATH` | Path to dev secrets | packages/confidential-core/.dev-keys/dev-secrets.json |

## Development Workflow

1. Make changes to source code
2. Run `pnpm build` to rebuild packages
3. Run `pnpm test` to verify tests pass
4. Run `pnpm typecheck` to verify types
5. Test with `pnpm dev` (starts all services)

## CRE Development

```bash
# Run CRE simulation
cd cre/aggregate
pnpm simulate

# Build CRE workflow
pnpm --filter @private-signal-swarm/cre-workflow build
```

## Common Issues

### TypeScript Errors

```bash
# Rebuild all packages
pnpm build

# Clear node_modules and reinstall
rm -rf node_modules && pnpm install
```

### Test Failures

```bash
# Run tests with verbose output
pnpm test -- --reporter=verbose

# Run specific test file
pnpm --filter @private-signal-swarm/cre-workflow test -- tests/cre/aggregation.test.ts
```

### CRE Simulation Errors

```bash
# Rebuild CRE workflow
cd cre/aggregate && pnpm build

# Check CRE CLI is installed
which cre
```
