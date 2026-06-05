import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX = 'enc_';

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required for AI provider key storage'
    );
  }
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)'
    );
  }
  return buf;
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: enc_ + base64(iv || authTag || ciphertext)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return PREFIX + combined.toString('base64');
}

export function decryptApiKey(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    throw new Error('Invalid encrypted key format: missing enc_ prefix');
  }

  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext.slice(PREFIX.length), 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final('utf8');
}
