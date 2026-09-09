import {
  handler,
  CronCapability,
  Runner,
  type Runtime,
} from '@chainlink/cre-sdk';
import { z } from 'zod';

const configSchema = z.object({
  message: z.string(),
});

type Config = z.infer<typeof configSchema>;

const onCronTrigger = async (
  runtime: Runtime<Config>
): Promise<{ status: string; message: string }> => {
  runtime.log(`Processing: ${runtime.config.message}`);
  
  return {
    status: 'ok',
    message: `Processed: ${runtime.config.message}`,
  };
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [
    handler(
      cron.trigger({ schedule: '*/60 * * * * *' }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

await main();
