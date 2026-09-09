import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateKeyMaterial, toDevSecrets, toKeymap } from '../src/tee/keymap.js';
const agentIds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['agent-1', 'agent-2', 'agent-3'];
const outDir = path.resolve(process.cwd(), '.dev-keys');
const material = await generateKeyMaterial(agentIds);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'keymap.json'), JSON.stringify(toKeymap(material), null, 2));
fs.writeFileSync(path.join(outDir, 'dev-secrets.json'), JSON.stringify(toDevSecrets(material), null, 2));
console.log(`Generated ${agentIds.length} agent keypairs + TEE keypair (keyId: ${material.keyId})`);
console.log(`  keymap:      ${path.join(outDir, 'keymap.json')}`);
console.log(`  dev-secrets: ${path.join(outDir, 'dev-secrets.json')}  (gitignored — TEE private keys)`);
//# sourceMappingURL=keygen.js.map