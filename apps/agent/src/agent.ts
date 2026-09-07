import { AgentConfig } from '@private-signal-swarm/types';
import { Console } from 'node:console';
import { stderr, stdout } from 'node:process';
import { Estimator } from './estimator.js';
import { MockDataSource } from './data-source.js';
import { CoordinatorClient } from './coordinator-client.js';

const logger = new Console(stdout, stderr);

export class Agent {
  private estimator: Estimator;
  private dataSource: MockDataSource;
  private coordinatorClient: CoordinatorClient;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.estimator = new Estimator();
    this.dataSource = new MockDataSource();
    this.coordinatorClient = new CoordinatorClient(config.coordinatorEndpoint);
  }

  async run(): Promise<void> {
    logger.log(`Agent ${this.config.id} starting...`);

    const rawData = await this.dataSource.fetchData();
    const privateValue = this.estimate(rawData);

    logger.log(`Agent ${this.config.id} computed private value: ${privateValue}`);

    await this.submitToCoordinator(privateValue);

    logger.log(`Agent ${this.config.id} submitted value to coordinator`);
  }

  private estimate(data: unknown): number {
    return this.estimator.compute(data);
  }

  private async submitToCoordinator(value: number): Promise<void> {
    const roundId = await this.coordinatorClient.getCurrentRoundId();
    await this.coordinatorClient.submit({
      agentId: this.config.id,
      roundId,
      value,
      timestamp: Date.now()
    });
  }
}