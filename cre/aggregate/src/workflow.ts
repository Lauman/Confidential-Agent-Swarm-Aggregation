import {
  decodeJson,
  handlerInTee,
  HTTPCapability,
  Runner,
  type HTTPPayload,
  type TeeRuntime,
} from '@chainlink/cre-sdk';
import { z } from 'zod';
import {
  processBatch,
  secretToString,
  type ProcessBatchSecrets,
} from '@private-signal-swarm/confidential-core';
import { ENVELOPE_VERSION, type TeeSignedResult } from '@private-signal-swarm/types';

const envelopeSchema = z.object({
  version: z.literal(ENVELOPE_VERSION),
  useCase: z.string().min(1),
  keyId: z.string().min(1),
  agentId: z.string().min(1),
  roundId: z.string().min(1),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.number().int().positive(),
});

const batchSchema = z.object({
  roundId: z.string().min(1),
  useCase: z.string().min(1),
  keyId: z.string().min(1),
  envelopes: z.array(envelopeSchema).min(1),
});

const configSchema = z.object({
  coordinatorAddress: z.string().optional(),
});

type Config = z.infer<typeof configSchema>;

// JSON by construction (all registry payloads come from zod object schemas),
// used to satisfy the SDK's CreSerializable<TResult> handler constraint.
type Json = string | number | boolean | Json[] | { [key: string]: Json };
export type TeeWorkflowResult = Omit<TeeSignedResult, 'payload'> & { payload: Json };

const onHttpTrigger = async (
  runtime: TeeRuntime<Config>,
  payload: HTTPPayload
): Promise<TeeWorkflowResult> => {
  if (!payload.input || payload.input.length === 0) {
    throw new Error('Empty aggregation batch');
  }

  const batch = batchSchema.parse(decodeJson(payload.input));

  // NOTE: getSecret().result() returns a Secret MESSAGE ({ value }), not a string.
  const secrets: ProcessBatchSecrets = {
    teeEncPub: secretToString(runtime.getSecret({ id: 'TEE_ENC_PUB', namespace: 'main' }).result()),
    teeEncPriv: secretToString(runtime.getSecret({ id: 'TEE_ENC_PRIV', namespace: 'main' }).result()),
    teeSignPriv: secretToString(runtime.getSecret({ id: 'TEE_SIGN_PRIV', namespace: 'main' }).result()),
  };

  if (!secrets.teeEncPub || !secrets.teeEncPriv || !secrets.teeSignPriv) {
    throw new Error('Missing TEE secrets in environment variables');
  }

  // Decrypt → validate → registry dispatch → small-N suppression → tally → sign.
  // Individual ballots are decrypted inside this enclave and never leave it;
  // only the signed aggregate result is returned.
  const result = await processBatch(batch, secrets);

  runtime.log(
    `Confidential aggregation complete. roundId=${result.roundId} useCase=${result.useCase} participants=${result.participantCount}`
  );

  return result as unknown as TeeWorkflowResult;
};

const initWorkflow = (config: Config) => {
  const http = new HTTPCapability();
  const authorizedKeys = config.coordinatorAddress
    ? [{ type: 'KEY_TYPE_ECDSA_EVM' as const, publicKey: config.coordinatorAddress }]
    : [];
  return [
    handlerInTee(http.trigger({ authorizedKeys }), onHttpTrigger, [
      { tee: 'nitro', regions: ['us-west-2'] },
    ]),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
