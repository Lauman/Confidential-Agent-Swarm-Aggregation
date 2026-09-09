import * as fs from 'node:fs';
import { generateEncKeyPair, type SealedBoxKeyPair } from '../crypto/sealed-box.js';
import { generateSignKeyPair, type SignKeyPair } from '../crypto/envelope-sign.js';

export interface KeymapFile {
  keyId: string;
  tee: { encPub: string; signPub: string };
  agents: Record<string, { signPub: string }>;
}

export interface DevSecretsFile {
  keyId: string;
  tee: { encPriv: string; signPriv: string } & SealedBoxKeyPair;
  agents: Record<string, { signPriv: string }>;
}

export interface AgentKeyMaterial {
  agentId: string;
  sign: SignKeyPair;
}

export interface KeyMaterial {
  keyId: string;
  teeEnc: SealedBoxKeyPair;
  teeSign: SignKeyPair;
  agents: AgentKeyMaterial[];
}

export async function generateKeyMaterial(agentIds: string[], keyId = 'enclave-1'): Promise<KeyMaterial> {
  const [teeEnc, teeSign] = await Promise.all([generateEncKeyPair(), generateSignKeyPair()]);
  const agents: AgentKeyMaterial[] = [];
  for (const agentId of agentIds) {
    agents.push({ agentId, sign: await generateSignKeyPair() });
  }
  return { keyId, teeEnc, teeSign, agents };
}

export function toKeymap(material: KeyMaterial): KeymapFile {
  return {
    keyId: material.keyId,
    tee: { encPub: material.teeEnc.publicKey, signPub: material.teeSign.publicKey },
    agents: Object.fromEntries(
      material.agents.map((a) => [a.agentId, { signPub: a.sign.publicKey }])
    ),
  };
}

export function toDevSecrets(material: KeyMaterial): DevSecretsFile {
  return {
    keyId: material.keyId,
    tee: {
      publicKey: material.teeEnc.publicKey,
      privateKey: material.teeEnc.privateKey,
      encPriv: material.teeEnc.privateKey,
      signPriv: material.teeSign.privateKey,
    },
    agents: Object.fromEntries(
      material.agents.map((a) => [a.agentId, { signPriv: a.sign.privateKey }])
    ),
  };
}

export function loadKeymap(path: string): KeymapFile {
  return JSON.parse(fs.readFileSync(path, 'utf-8')) as KeymapFile;
}

export function loadDevSecrets(path: string): DevSecretsFile {
  return JSON.parse(fs.readFileSync(path, 'utf-8')) as DevSecretsFile;
}
