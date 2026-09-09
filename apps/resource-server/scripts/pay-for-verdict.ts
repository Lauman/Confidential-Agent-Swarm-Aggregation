/**
 * Bombus paid consumer (Checkpoint A proof).
 *
 * Buys the latest signed verdict from the resource server over x402 v2 on
 * Hedera testnet, settled through the Blocky402 facilitator.
 *
 * Required env:
 *   HEDERA_ACCOUNT_ID      payer account, e.g. 0.0.1234 (ECDSA, funded with test HBAR)
 *   HEDERA_PRIVATE_KEY     0x-prefixed ECDSA private key for the payer account
 * Optional env:
 *   TARGET_URL             default http://localhost:3000/api/verdict?useCase=deliberation.v1
 *   HEDERA_NETWORK         default hedera:testnet
 *
 * Run: pnpm --filter @private-signal-swarm/resource-server pay:verdict
 */
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';

async function main(): Promise<void> {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error('Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY (funded Hedera testnet ECDSA account)');
  }

  const network = process.env.HEDERA_NETWORK || 'hedera:testnet';
  const target =
    process.env.TARGET_URL || 'http://localhost:3000/api/verdict?useCase=deliberation.v1';

  const signer = createClientHederaSigner(
    accountId,
    PrivateKey.fromStringECDSA(privateKey),
    { network }
  );
  const client = new x402Client().register('hedera:*', new ExactHederaScheme(signer));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  console.log(`Buying verdict from ${target} as ${accountId} ...`);

  // 0. Show the raw challenge first (decoded PAYMENT-REQUIRED header).
  const challenge = await fetch(target, { method: 'GET' });
  const rawHeader = challenge.headers.get('PAYMENT-REQUIRED') ?? challenge.headers.get('payment-required');
  if (challenge.status === 402 && rawHeader) {
    try {
      const decoded = JSON.parse(Buffer.from(rawHeader, 'base64').toString('utf-8')) as {
        accepts?: unknown;
      };
      console.log('Server demands:', JSON.stringify(decoded.accepts));
    } catch {
      console.log('Server sent an undecodable PAYMENT-REQUIRED header');
    }
  } else if (challenge.status === 200) {
    console.log('NOTE: server answered 200 without payment (dev mode — no X402_PAY_TO?).');
    console.log('Verdict:', JSON.stringify(await challenge.json()));
    return;
  }

  const response = await fetchWithPayment(target, { method: 'GET' });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.log(`Final status: ${response.status} ${text.slice(0, 500)}`);
    throw new Error(
      'Server rejected the payment (re-issued 402). Check server log for the facilitator /verify reason.'
    );
  }

  const settlement = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
  console.log('Settlement tx:', settlement?.transaction ?? '(unavailable)');
  console.log('Verdict:', JSON.stringify(await response.json()));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
