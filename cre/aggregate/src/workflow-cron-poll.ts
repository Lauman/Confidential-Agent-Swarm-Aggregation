import {
  handler,
  CronCapability,
  Runner,
  type Runtime,
} from '@chainlink/cre-sdk';
import { z } from 'zod';
import {
  processBatch,
  type ProcessBatchSecrets,
} from '@private-signal-swarm/confidential-core';
import { ENVELOPE_VERSION, type TeeSignedResult } from '@private-signal-swarm/types';

const batchSchema = z.object({
  roundId: z.string().min(1),
  useCase: z.string().min(1),
  keyId: z.string().min(1),
  envelopes: z.array(z.any()).min(1),
});

const configSchema = z.object({
  coordinatorUrl: z.string().url(),
  pollIntervalSeconds: z.number().int().positive(),
});

type Config = z.infer<typeof configSchema>;

type Json = string | number | boolean | Json[] | { [key: string]: Json };
export type TeeWorkflowResult = Omit<TeeSignedResult, 'payload'> & { payload: Json };

// Sample test batch for simulation
const SAMPLE_BATCH = {
  roundId: 'test-round-001',
  useCase: 'deliberation.v1',
  keyId: 'enclave-1',
  envelopes: [
    {
      version: 1,
      useCase: 'deliberation.v1',
      keyId: 'enclave-1',
      agentId: 'agent-1',
      roundId: 'test-round-001',
      nonce: 'test-nonce-1',
      ciphertext: 'test-ciphertext-1',
      timestamp: Date.now(),
      signature: 'test-signature-1',
    },
  ],
};

const onCronTrigger = async (
  runtime: Runtime<Config>
): Promise<TeeWorkflowResult> => {
  runtime.log('Processing aggregation batch...');

  // For non-confidential mode, secrets come from environment variables
  const secrets: ProcessBatchSecrets = {
    teeEncPub: process.env.CRE_TEE_ENC_PUB ?? '',
    teeEncPriv: process.env.CRE_TEE_ENC_PRIV ?? '',
    teeSignPriv: process.env.CRE_TEE_SIGN_PRIV ?? '',
  };

  if (!secrets.teeEncPub || !secrets.teeEncPriv || !secrets.teeSignPriv) {
    throw new Error('Missing TEE secrets in environment variables');
  }

  // Use sample batch for simulation
  const batch = batchSchema.parse(SAMPLE_BATCH);

  const result = await processBatch(batch, secrets);

  runtime.log(
    `Confidential aggregation complete. roundId=${result.roundId} useCase=${result.useCase} participants=${result.participantCount}`
  );

  return result as unknown as TeeWorkflowResult;
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [
    handler(
      cron.trigger({ schedule: `*/${config.pollIntervalSeconds} * * * * *` }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
