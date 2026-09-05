export interface AgentSubmission {
  agentId: string;
  roundId: string;
  value: number;
  signature?: string;
  timestamp: number;
}

export interface AgentIdentity {
  id: string;
  ensName?: string;
  endpoint?: string;
  publicKey?: string;
}

export interface AgentConfig {
  id: string;
  coordinatorEndpoint: string;
  dataSourceType: 'mock' | 'subgraph';
  dataSourceConfig?: Record<string, unknown>;
}