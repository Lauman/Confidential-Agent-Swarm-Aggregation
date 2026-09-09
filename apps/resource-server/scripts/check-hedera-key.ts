/**
 * Pre-flight check for the Hedera paid-call proof (Checkpoint A).
 * Reads env, prints diagnostics — NEVER prints secret values.
 *
 * Run: pnpm --filter @private-signal-swarm/resource-server check:hedera
 */
import { PrivateKey } from '@x402/hedera';

const accountId = process.env.HEDERA_ACCOUNT_ID ?? '';
const privateKey = process.env.HEDERA_PRIVATE_KEY ?? '';
const payTo = process.env.X402_PAY_TO ?? '';

let failures = 0;

const idOk = /^\d+\.\d+\.\d+$/.test(accountId);
console.log(`HEDERA_ACCOUNT_ID : ${accountId || '(missing)'} ${idOk ? 'OK' : '← want 0.0.x'}`);
if (!idOk) failures++;

if (!privateKey) {
  console.log('HEDERA_PRIVATE_KEY: (missing)');
  failures++;
} else {
  let ecdsa = false;
  let ed = false;
  try {
    PrivateKey.fromStringECDSA(privateKey);
    ecdsa = true;
  } catch {
    try {
      PrivateKey.fromStringED25519(privateKey);
      ed = true;
    } catch {
      /* unrecognized */
    }
  }
  if (ecdsa) {
    console.log('HEDERA_PRIVATE_KEY: present, ECDSA OK (required by @x402/hedera)');
  } else if (ed) {
    console.log('HEDERA_PRIVATE_KEY: present, but ED25519 ← MUST be ECDSA for x402');
    console.log('  Fix: create an ECDSA testnet account at https://portal.hedera.com');
    console.log('  (choose ECDSA key type), fund it via the faucet, export the new values.');
    failures++;
  } else {
    console.log('HEDERA_PRIVATE_KEY: present, but unparseable ← check the value');
    failures++;
  }
}

const payToOk = /^\d+\.\d+\.\d+$/.test(payTo);
console.log(`X402_PAY_TO        : ${payTo || '(missing)'} ${payToOk ? 'OK' : '← tip: reuse HEDERA_ACCOUNT_ID for the demo'}`);
if (!payToOk) failures++;

console.log(failures === 0 ? '\nREADY: run pay:verdict against a live server.' : `\nNOT READY: ${failures} item(s) above.`);
process.exit(failures === 0 ? 0 : 1);
