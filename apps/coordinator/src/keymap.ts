import * as fs from 'node:fs';
import type { KeymapFile } from '@private-signal-swarm/confidential-core';

export function loadKeymap(path: string): KeymapFile {
  if (!fs.existsSync(path)) {
    throw new Error(
      `Keymap not found at ${path}. Run \`pnpm --filter @private-signal-swarm/confidential-core keygen\` first.`
    );
  }
  return JSON.parse(fs.readFileSync(path, 'utf-8')) as KeymapFile;
}

export function resolveAgentSignPub(keymap: KeymapFile, agentId: string): string | undefined {
  return keymap.agents[agentId]?.signPub;
}
