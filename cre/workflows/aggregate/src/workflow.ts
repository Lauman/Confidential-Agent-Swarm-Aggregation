import {
  HTTPCapability,
  handlerInTee,
  Runner,
  type HTTPPayload,
  type TeeRuntime,
} from "@chainlink/cre-sdk";
import { z } from "zod";
import { aggregate, type AggregationRequest, type AggregationResult } from "./handler.js";

const configSchema = z.object({
  authorizedKey: z.string().optional(),
});

type Config = z.infer<typeof configSchema>;

const onHttpTrigger = (
  runtime: TeeRuntime<Config>,
  payload: HTTPPayload
): string => {
  if (!payload.input || payload.input.length === 0) {
    throw new Error("Empty aggregation request");
  }

  const request: AggregationRequest = JSON.parse(
    payload.input.toString()
  );

  runtime.log(
    `Processing ${request.submissions.length} submissions for round ${request.roundId}`
  );

  const result: AggregationResult = aggregate(request);

  runtime.log(
    `Confidential aggregation complete. roundId=${result.roundId} aggregate=${result.aggregate} participants=${result.participantCount}`
  );

  return JSON.stringify(result);
};

const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();

  const triggerConfig = config.authorizedKey
    ? {
        authorizedKeys: [
          {
            type: "KEY_TYPE_ECDSA_EVM" as const,
            publicKey: config.authorizedKey,
          },
        ],
      }
    : {};

  return [
    handlerInTee(
      http.trigger(triggerConfig),
      onHttpTrigger,
      [{ tee: "nitro", regions: ["us-west-2"] }]
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
