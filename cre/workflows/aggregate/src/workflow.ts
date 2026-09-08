import {
  decodeJson,
  handlerInTee,
  HTTPCapability,
  Runner,
  type HTTPPayload,
  type TeeRuntime,
} from "@chainlink/cre-sdk";
import { z } from "zod";
import { aggregate, type AggregationRequest, type AggregationResult } from "./handler.js";

const submissionSchema = z.object({
  agentId: z.string(),
  roundId: z.string(),
  value: z.number(),
  signature: z.string().optional(),
  timestamp: z.number(),
});

const requestSchema = z.object({
  roundId: z.string(),
  submissions: z.array(submissionSchema).min(1),
});

const configSchema = z.object({
  coordinatorAddress: z.string().optional(),
});

type Config = z.infer<typeof configSchema>;

const onHttpTrigger = (runtime: TeeRuntime<Config>, payload: HTTPPayload): string => {
  if (!payload.input || payload.input.length === 0) {
    throw new Error("Empty aggregation request");
  }

  const request = requestSchema.parse(decodeJson(payload.input)) as AggregationRequest;

  runtime.getSecret({ id: "COORDINATOR_AUTH_KEY" }).result();

  const result: AggregationResult = aggregate(request);

  runtime.log(
    `Confidential aggregation complete. roundId=${result.roundId} participants=${result.participantCount}`
  );

  return JSON.stringify(result);
};

const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();
  const authorizedKeys = config.coordinatorAddress
    ? [{ type: "KEY_TYPE_ECDSA_EVM" as const, publicKey: config.coordinatorAddress }]
    : [];
  return [
    handlerInTee(http.trigger({ authorizedKeys }), onHttpTrigger, [
      { tee: "nitro", regions: ["us-west-2"] },
    ]),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
