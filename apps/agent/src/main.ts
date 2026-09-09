import { loadConfig } from './config.js';
import { Agent } from './agent.js';

const config = loadConfig();
const proposalRef = process.argv[2] || 'proposal-demo-001';

const agent = new Agent(config);
agent
  .run(proposalRef)
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
