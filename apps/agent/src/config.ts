import * as path from 'node:path';
import type { AgentConfig } from '@private-signal-swarm/types';

export function loadConfig(): AgentConfig {
  const keymapPath = process.env.KEYMAP_PATH
    ? path.resolve(process.cwd(), process.env.KEYMAP_PATH)
    : path.resolve(process.cwd(), 'packages/confidential-core/.dev-keys/keymap.json');

  return {
    id: process.env.AGENT_ID || 'agent-1',
    coordinatorEndpoint: process.env.COORDINATOR_ENDPOINT || 'http://localhost:3001',
    keySource: 'keymap',
    keymapPath,
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY || undefined,
  };
}
