// Public, synthetic signing fixture. This seed is test data, never a release credential.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, input.seed)]),
  format: 'der', type: 'pkcs8',
});
const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
const id = Buffer.from('0102030405060708', 'hex');
const data = Buffer.from(input.data, 'base64');
const signature = sign(null, input.legacy ? data : createHash('blake2b512').update(data).digest(), privateKey);
const globalSignature = sign(null, Buffer.concat([signature, Buffer.from(input.comment, 'utf8')]), privateKey);
const keyText = 'untrusted comment: Synthetic test public key\n' + Buffer.concat([Buffer.from('Ed'), id, publicKey]).toString('base64') + '\n';
const sigText = 'untrusted comment: Synthetic test signature\n' + Buffer.concat([Buffer.from(input.legacy ? 'Ed' : 'ED'), id, signature]).toString('base64') + '\ntrusted comment: ' + input.comment + '\n' + globalSignature.toString('base64') + '\n';
process.stdout.write(JSON.stringify({ key: Buffer.from(keyText).toString('base64'), signature: Buffer.from(sigText).toString('base64') }));
