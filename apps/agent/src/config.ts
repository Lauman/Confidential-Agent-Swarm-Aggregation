import { AgentConfig } from '@private-signal-swarm/types';
import { Agent } from './agent.js';

const config: AgentConfig = {
  id: process.env.AGENT_ID || 'agent-1',
  coordinatorEndpoint: process.env.COORDINATOR_ENDPOINT || 'http://localhost:3001',
  dataSourceType: 'mock'
};

const agent = new Agent(config);
agent.run().catch(console.error);