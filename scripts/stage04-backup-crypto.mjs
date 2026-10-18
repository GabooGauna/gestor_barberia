// Binary pipe helper only: stdin = 32-byte AES key followed by payload.
// stdout = authenticated ciphertext (encrypt) or verified plaintext (decrypt).
// Never invoke decrypt into a terminal or persist its stdout as plaintext.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const mode = process.argv[2];
const magic = Buffer.from('GBBK1', 'ascii');
const limit = 256 * 1024 * 1024;
if (process.argv.length !== 3 || !['encrypt', 'decrypt'].includes(mode) || process.stdin.isTTY || process.stdout.isTTY) {
  process.stderr.write('A binary pipe and an explicit encrypt/decrypt mode are required.\n');
  process.exit(1);
}
const chunks = [];
let size = 0;
process.stdin.on('data', chunk => {
  size += chunk.length;
  if (size > limit + 65) {
    for (const part of chunks) part.fill(0);
    chunk.fill(0);
    process.stderr.write('Cryptographic input exceeds the memory limit.\n');
    process.exit(1);
  }
  chunks.push(chunk);
});
process.stdin.on('error', () => {
  for (const part of chunks) part.fill(0);
  process.stderr.write('Cryptographic input failed.\n');
  process.exitCode = 1;
});
process.stdin.on('end', () => {
  let input;
  let result;
  try {
    input = Buffer.concat(chunks);
    if (input.length < 33) throw new Error('invalid input');
    const key = input.subarray(0, 32);
    const payload = input.subarray(32);
    if (mode === 'encrypt') {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(magic);
      const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
      result = Buffer.concat([magic, nonce, cipher.getAuthTag(), ciphertext]);
      ciphertext.fill(0);
    } else {
      if (payload.length < 34 || !payload.subarray(0, 5).equals(magic)) throw new Error('invalid envelope');
      const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(5, 17));
      decipher.setAAD(magic);
      decipher.setAuthTag(payload.subarray(17, 33));
      // Do not emit a single plaintext byte before GCM final authenticates.
      const provisional = decipher.update(payload.subarray(33));
      try {
        result = Buffer.concat([provisional, decipher.final()]);
      } finally {
        provisional.fill(0);
      }
    }
    process.stdout.write(result, error => {
      result.fill(0);
      if (error) process.exitCode = 1;
    });
  } catch {
    result?.fill(0);
    process.stderr.write('Cryptographic authentication or processing failed.\n');
    process.exitCode = 1;
  } finally {
    input?.fill(0);
    for (const part of chunks) part.fill(0);
  }
});
