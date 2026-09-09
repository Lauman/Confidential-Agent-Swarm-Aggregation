/**
 * Associates the payer account with the payment token (one-time setup).
 * Hedera requires explicit HTS association before an account can send OR
 * receive a token — without it, settlement fails with TOKEN_NOT_ASSOCIATED.
 *
 * Env: HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY (ECDSA), TOKEN_ID (default 0.0.429274 = test USDC)
 * Run: pnpm --filter @private-signal-swarm/resource-server associate:token
 */
import {
  AccountId,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
} from '@x402/hedera';

async function main(): Promise<void> {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const tokenId = process.env.TOKEN_ID || '0.0.429274';
  if (!accountId || !privateKey) {
    throw new Error('Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY');
  }

  const client = Client.forTestnet().setOperator(
    AccountId.fromString(accountId),
    PrivateKey.fromStringECDSA(privateKey)
  );

  console.log(`Associating ${accountId} with token ${tokenId} ...`);
  const receipt = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenIds([TokenId.fromString(tokenId)])
    .execute(client)
    .then((response) => response.getReceipt(client));
  console.log('Status:', receipt.status.toString());
  client.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
