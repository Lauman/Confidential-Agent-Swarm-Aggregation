export interface AgentIdentity {
  id: string;
  ensName?: string;
  endpoint?: string;
  publicKey?: string;
}

export type KeySource = 'keymap' | 'ens';

export type ReasoningMode = 'mock' | 'llm';

export interface ReasoningConfig {
  mode: ReasoningMode;
  /** OpenAI-compatible base URL (no trailing /chat/completions) */
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
}

export interface AgentConfig {
  id: string;
  coordinatorEndpoint: string;
  keySource: KeySource;
  keymapPath?: string;
  agentPrivateKey?: string;
  /** Defaults to mock reasoning when absent (existing behavior). */
  reasoning?: ReasoningConfig;
}
