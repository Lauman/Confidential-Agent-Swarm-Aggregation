import {
  handler,
  CronCapability,
  Runner,
} from '@chainlink/cre-sdk';

const onCronTrigger = async () => {
  return { status: 'ok', timestamp: Date.now() };
};

const initWorkflow = () => {
  const cron = new CronCapability();
  return [
    handler(cron.trigger({ schedule: '0 */10 * * * *' }), onCronTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Record<string, never>>({
    configParser: () => ({}),
  });
  await runner.run(initWorkflow);
}

await main();
