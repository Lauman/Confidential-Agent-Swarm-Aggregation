import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

// Hackathon ENSv2 deployment: viem's built-in resolver points at the wrong
// (legacy) deployment, so it is overwritten once, per the ENS docs.
const HACKATHON_UNIVERSAL_RESOLVER = '0xd26f2040d083af1cd2962ba303f4bea0c4faf142';

const hackathonSepolia = {
  ...sepolia,
  contracts: {
    ...sepolia.contracts,
    ensUniversalResolver: {
      address: HACKATHON_UNIVERSAL_RESOLVER,
    },
  },
} as const;

let client: ReturnType<typeof createPublicClient> | null = null;

function getClient() {
  if (!client) {
    client = createPublicClient({
      chain: hackathonSepolia,
      transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
    });
  }
  return client;
}

/** TEE signing key from keys.bombus.eth — null when unreachable (offline demo). */
export async function readTeeSignPub(): Promise<string | null> {
  try {
    const value = await getClient().getEnsText({ name: 'keys.bombus.eth', key: 'tee-sign-pub' });
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function agentEnsName(agentId: string): string {
  return `${agentId.replace(/-/g, '')}.bombus.eth`;
}
