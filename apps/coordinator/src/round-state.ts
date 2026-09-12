import { config } from './config.js';
import { loadKeymap } from './keymap.js';
import { EnvelopeValidator } from './envelope-validator.js';
import { RoundManager } from './round-manager.js';
import { TombstoneStore } from './tombstone-store.js';
import { LocalTeeRunner } from './tee-seam.js';
import { DeployedAttestor } from './deployed-attestor.js';
import { ResultPusher } from './result-pusher.js';

/**
 * Single shared coordinator state. Imported by both the protocol router
 * (coordinator.ts) and the demo theater router (routes/demo.ts) so the demo
 * endpoint mints fresh rounds on the SAME RoundManager that serves
 * /round/current and /submit — never a divergent copy.
 */
const keymap = loadKeymap(config.keymapPath);

export const validator = new EnvelopeValidator({
  keymap,
  allowedUseCases: config.allowedUseCases,
});

export const store = new TombstoneStore(config.stateDir);
export const teeSeam = new LocalTeeRunner(config.devSecretsPath);
export const resultPusher = new ResultPusher(config.resultIngestUrl);

export const deployedAttestor =
  config.creGatewayUrl && config.creWorkflowId && config.coordinatorSigningKey && config.donTeeEncPub
    ? new DeployedAttestor({
        gatewayUrl: config.creGatewayUrl,
        workflowId: config.creWorkflowId,
        signingKey: config.coordinatorSigningKey,
        donTeeEncPub: config.donTeeEncPub,
        devSecretsPath: config.devSecretsPath,
      })
    : undefined;

if (deployedAttestor) {
  console.log(`Deployed CRE trigger armed: workflow ${config.creWorkflowId} via ${config.creGatewayUrl} (signer ${deployedAttestor.signerAddress})`);
} else {
  console.log('Deployed CRE trigger off — set CRE_GATEWAY_URL, CRE_WORKFLOW_ID, a signing key (COORDINATOR_SIGNING_KEY), and DON_TEE_ENC_PUB to arm it');
}

export const roundManager = new RoundManager({
  quorum: config.quorum,
  teeSeam,
  store,
  keyId: keymap.keyId,
  onResult: (result) => void resultPusher.push(result),
  deployedAttestor,
});
