export interface AgentIdentity {
  id: string;
  ensName?: string;
  endpoint?: string;
  publicKey?: string;
}

export type KeySource = 'keymap' | 'ens';

export interface AgentConfig {
  id: string;
  coordinatorEndpoint: string;
  keySource: KeySource;
  keymapPath?: string;
  agentPrivateKey?: string;
}
