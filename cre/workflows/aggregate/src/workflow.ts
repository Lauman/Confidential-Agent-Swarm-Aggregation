import {
  CronCapability,
  handlerInTee,
  Runner,
  type TeeRuntime,
} from "@chainlink/cre-sdk";
import { z } from "zod";
import { aggregate, type AggregationRequest, type AggregationResult } from "./handler.js";

const configSchema = z.object({
  schedule: z.string(),
});

type Config = z.infer<typeof configSchema>;

const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
  runtime.log("Confidential aggregation workflow triggered");

  const secret = runtime.getSecret({ id: "COORDINATOR_AUTH_KEY" }).result();
  runtime.log(`Coordinator auth key retrieved (length=${secret.value.length})`);

  const sampleRequest: AggregationRequest = {
    roundId: "simulation-round-001",
    submissions: [
      { agentId: "agent-1", roundId: "simulation-round-001", value: 102.3, timestamp: Date.now() },
      { agentId: "agent-2", roundId: "simulation-round-001", value: 98.7, timestamp: Date.now() },
      { agentId: "agent-3", roundId: "simulation-round-001", value: 105.1, timestamp: Date.now() },
    ],
  };

  const result: AggregationResult = aggregate(sampleRequest);

  runtime.log(
    `Confidential aggregation complete. roundId=${result.roundId} aggregate=${result.aggregate} participants=${result.participantCount}`
  );

  return JSON.stringify(result);
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [
    handlerInTee(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger,
      {}
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
