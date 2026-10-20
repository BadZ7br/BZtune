/** Ed25519 verification for the decoded Minisign fields supplied by the validator.
 * Reads public material from stdin. Never executes the installer or loads a private key.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const key = Buffer.from(input.key, 'base64');
  const signature = Buffer.from(input.signature, 'base64');
  const globalSignature = Buffer.from(input.globalSignature, 'base64');
  if (key.length !== 32 || signature.length !== 64 || globalSignature.length !== 64
      || typeof input.trustedComment !== 'string' || typeof input.prehashed !== 'boolean'
      || process.argv.length !== 3) throw Error('Invalid verifier input');
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]),
    format: 'der', type: 'spki',
  });
  let message;
  if (input.prehashed) {
    const hash = createHash('blake2b512');
    for await (const chunk of createReadStream(process.argv[2])) hash.update(chunk);
    message = hash.digest();
  } else {
    message = readFileSync(process.argv[2]);
  }
  if (!verify(null, message, publicKey, signature)
      || !verify(null, Buffer.concat([signature, Buffer.from(input.trustedComment, 'utf8')]), publicKey, globalSignature)) {
    throw Error('Signature mismatch');
  }
  process.stdout.write('verified\n');
} catch {
  process.stderr.write('Signature verification failed.\n');
  process.exitCode = 1;
}
