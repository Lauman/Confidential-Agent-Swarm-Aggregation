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
    reasoning: {
      mode: process.env.AGENT_REASONING === 'llm' ? 'llm' : 'mock',
      baseUrl: process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: process.env.LLM_API_KEY || undefined,
      model: process.env.LLM_MODEL || 'gemini-3.6-flash',
      timeoutMs: process.env.LLM_TIMEOUT_MS ? parseInt(process.env.LLM_TIMEOUT_MS, 10) : undefined,
    },
  };
}
