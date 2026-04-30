// tests/helpers/test-jwt.ts
// Generates a per-test-run ES256 keypair, exposes the public JWKS for the
// auth middleware to use, and signs tokens with the matching private key.
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type KeyLike } from 'jose';

let cached: { privateKey: KeyLike; jwks: ReturnType<typeof createLocalJWKSet> } | null = null;

export async function getTestKeys() {
  if (!cached) {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test';
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';
    const jwks = createLocalJWKSet({ keys: [publicJwk as any] });
    cached = { privateKey, jwks };
  }
  return cached;
}

export async function mintTestJwt(opts: { userId: string; role: 'admin' | 'office' | 'warehouse' }) {
  const { privateKey } = await getTestKeys();
  return new SignJWT({ app_metadata: { role: opts.role } })
    .setProtectedHeader({ alg: 'ES256', kid: 'test' })
    .setSubject(opts.userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}
