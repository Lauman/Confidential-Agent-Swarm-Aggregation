export interface WorkflowInput {
  values: number[];
  roundId: string;
}

export interface WorkflowOutput {
  aggregate: number;
  roundId: string;
  participantCount: number;
  timestamp: number;
}