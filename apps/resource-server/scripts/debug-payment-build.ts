/**
 * Local-only diagnostic: can this payer build a signed exact-scheme payload?
 * Makes NO network calls and broadcasts NOTHING — pure local signing.
 * Compares self-pay (payTo == payer) vs pay-to-other.
 *
 * Env: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, PAY_TO_OTHER (e.g. 0.0.10444223)
 * Run: pnpm --filter @private-signal-swarm/resource-server debug:pay-build
 */
import { x402Client } from '@x402/core/client';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';

async function step<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  try {
    const value = await fn();
    console.log(`${label}: OK`);
    return value;
  } catch (error) {
    console.log(`${label}: THREW`);
    console.log(`  ctor: ${(error as object)?.constructor?.name ?? typeof error}`);
    try {
      console.log(`  value: ${JSON.stringify(error)}`);
    } catch {
      console.log(`  value: (unserializable) ${String(error).slice(0, 300)}`);
    }
    throw new Error(`setup failed at ${label}`);
  }
}

async function tryBuild(
  scheme: ExactHederaScheme,
  label: string,
  payTo: string
): Promise<void> {
  const requirements = {
    scheme: 'exact',
    network: 'hedera:testnet',
    amount: '10000',
    asset: '0.0.429274',
    payTo,
    maxTimeoutSeconds: 300,
    extra: { feePayer: '0.0.7162784' },
  } as const;
  try {
    const signed = await scheme.createPaymentPayload(2, requirements);
    const transaction = (signed.payload as { transaction: string }).transaction;
    const bytes = Buffer.from(transaction, 'base64').length;
    console.log(`${label}: BUILD_OK (signed payload bytes: ${bytes})`);

    // Read-only facilitator verdict: no broadcast, no spend.
    const verifyRes = await fetch('https://api.testnet.blocky402.com/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload: { x402Version: 2, scheme: 'exact', network: 'hedera:testnet', accepted: requirements, payload: signed.payload },
        paymentRequirements: requirements,
      }),
    });
    const verdict = (await verifyRes.json().catch(() => ({}))) as Record<string, unknown>;
    console.log(`  facilitator /verify -> HTTP ${verifyRes.status}: ${JSON.stringify(verdict).slice(0, 400)}`);
  } catch (error) {
    console.log(`${label}: BUILD_FAIL: ${error instanceof Error ? error.message : error}`);
  }
}

async function main(): Promise<void> {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const payToOther = process.env.PAY_TO_OTHER;
  if (!accountId || !privateKey || !payToOther) {
    throw new Error('Set HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY and PAY_TO_OTHER');
  }

  const signer = await step('createClientHederaSigner', async () =>
    createClientHederaSigner(accountId, PrivateKey.fromStringECDSA(privateKey), {
      network: 'hedera:testnet',
    })
  );
  const scheme = await step(
    'new ExactHederaScheme',
    async () => new ExactHederaScheme(signer)
  );
  await step('client.register', async () => {
    void new x402Client().register('hedera:*', scheme);
  });

  await tryBuild(scheme, `self-pay      (${accountId} -> ${accountId})`, accountId);
  await tryBuild(scheme, `pay-to-other  (${accountId} -> ${payToOther})`, payToOther);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
