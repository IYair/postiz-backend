import { encryptApiKey, decryptApiKey } from '../ai.encryption';

describe('AI Encryption', () => {
  const testKey = 'a'.repeat(64); // 32 bytes hex-encoded

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = testKey;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('should encrypt and decrypt a key round-trip', () => {
    const apiKey = 'sk-test-1234567890abcdef';
    const encrypted = encryptApiKey(apiKey);

    expect(encrypted.startsWith('enc_')).toBe(true);
    expect(encrypted).not.toContain(apiKey);

    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(apiKey);
  });

  it('should produce different ciphertexts for same input (unique IV)', () => {
    const apiKey = 'sk-test-same-input';
    const enc1 = encryptApiKey(apiKey);
    const enc2 = encryptApiKey(apiKey);

    expect(enc1).not.toBe(enc2);

    expect(decryptApiKey(enc1)).toBe(apiKey);
    expect(decryptApiKey(enc2)).toBe(apiKey);
  });

  it('should throw on tampered ciphertext', () => {
    const apiKey = 'sk-test-tamper';
    const encrypted = encryptApiKey(apiKey);

    const tampered = encrypted.slice(0, -2) + 'XX';
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it('should throw if ENCRYPTION_KEY is missing', () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    expect(() => encryptApiKey('test')).toThrow('ENCRYPTION_KEY');

    process.env.ENCRYPTION_KEY = saved;
  });
});
