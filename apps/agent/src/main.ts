import { USE_CASES, type UseCaseId } from '@private-signal-swarm/types';
import { loadConfig } from './config.js';
import { Agent } from './agent.js';

const config = loadConfig();
const proposalRef = process.argv[2] || 'proposal-demo-001';
const useCaseArg = process.argv[3] || 'deliberation';

const useCaseMap: Record<string, UseCaseId> = {
  deliberation: USE_CASES.deliberation,
  'signal-estimate': USE_CASES.signalEstimate,
};

const useCase = useCaseMap[useCaseArg];
if (!useCase) {
  console.error(`Unknown use case: ${useCaseArg}. Allowed: ${Object.keys(useCaseMap).join(', ')}`);
  process.exit(1);
}

const agent = new Agent(config);
agent
  .run(proposalRef, useCase)
  .then((outcome) => {
    console.log(
      `[${config.id}] ${outcome.status}${
        outcome.result ? `: ${JSON.stringify((outcome.result as { payload?: unknown }).payload)}` : ''
      }`
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[${config.id}] failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
