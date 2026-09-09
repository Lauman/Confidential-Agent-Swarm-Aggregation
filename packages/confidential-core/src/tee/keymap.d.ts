import { type SealedBoxKeyPair } from '../crypto/sealed-box.js';
import { type SignKeyPair } from '../crypto/envelope-sign.js';
export interface KeymapFile {
    keyId: string;
    tee: {
        encPub: string;
        signPub: string;
    };
    agents: Record<string, {
        signPub: string;
    }>;
}
export interface DevSecretsFile {
    keyId: string;
    tee: {
        encPriv: string;
        signPriv: string;
    } & SealedBoxKeyPair;
    agents: Record<string, {
        signPriv: string;
    }>;
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
export declare function generateKeyMaterial(agentIds: string[], keyId?: string): Promise<KeyMaterial>;
export declare function toKeymap(material: KeyMaterial): KeymapFile;
export declare function toDevSecrets(material: KeyMaterial): DevSecretsFile;
export declare function loadKeymap(path: string): KeymapFile;
export declare function loadDevSecrets(path: string): DevSecretsFile;
//# sourceMappingURL=keymap.d.ts.map