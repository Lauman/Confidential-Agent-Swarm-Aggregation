import * as path from 'node:path';
import * as url from 'node:url';
import type { AgentConfig } from '@private-signal-swarm/types';

const WORKSPACE_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', '..');

export function loadConfig(): AgentConfig {
  const keymapPath = process.env.KEYMAP_PATH
    ? path.isAbsolute(process.env.KEYMAP_PATH) ? process.env.KEYMAP_PATH : path.resolve(WORKSPACE_ROOT, process.env.KEYMAP_PATH)
    : path.join(WORKSPACE_ROOT, 'packages/confidential-core/.dev-keys/keymap.json');

  return {
    id: process.env.AGENT_ID || 'agent-1',
    coordinatorEndpoint: process.env.COORDINATOR_ENDPOINT || 'http://localhost:3001',
    keySource: 'keymap',
    keymapPath,
    agentPrivateKey: process.env.AGENT_PRIVATE_KEY || undefined,
  };
}
