import { AgentSubmission } from './agent.js';

export interface AggregationRequest {
  roundId: string;
  submissions: AgentSubmission[];
}

export interface AggregationResult {
  roundId: string;
  aggregate: number;
  participantCount: number;
  timestamp: number;
}

export interface RoundState {
  roundId: string;
  submissions: Map<string, AgentSubmission>;
  quorum: number;
  status: 'collecting' | 'aggregating' | 'completed' | 'failed';
  result?: AggregationResult;
}