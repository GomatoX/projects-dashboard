import crypto from 'node:crypto';

/**
 * Agent tokens are random nanoid(32) strings — ~190 bits of entropy. That is
 * far above any realistic brute-force budget, so a fast hash (SHA-256) is the
 * right primitive: it is constant-time per call and, crucially, indexable in
 * the database. We use SHA-256 only as a lookup key; the comparison itself
 * goes through `timingSafeEqual` to avoid leaking partial matches via timing.
 *
 * Do NOT use this helper for user passwords — those are low-entropy and need
 * an intentionally slow KDF like bcrypt/argon2.
 */
export function hashAgentToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Constant-time equality check on two hex strings of the same length.
 * Returns false (without throwing) when lengths differ.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
