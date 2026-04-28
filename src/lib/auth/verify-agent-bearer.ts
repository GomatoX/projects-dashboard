import bcrypt from 'bcrypt';
import { eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { devices } from '@/lib/db/schema';
import { hashAgentToken, timingSafeEqualHex } from '@/lib/auth/agent-token';

/**
 * Look the device up by an indexed SHA-256 of the token, falling back to a
 * legacy bcrypt scan and lazy backfill. Mirrors the Socket.io auth path in
 * `server.mts` so HTTP and WS use exactly the same trust model — a token
 * good enough to open a socket is good enough to download an attachment
 * for the same agent.
 */
async function verifyToken(rawToken: string): Promise<typeof devices.$inferSelect | null> {
  const candidateHash = hashAgentToken(rawToken);

  const fastHits = await db
    .select()
    .from(devices)
    .where(eq(devices.tokenHash, candidateHash))
    .limit(1);

  if (fastHits.length > 0 && fastHits[0].tokenHash) {
    if (timingSafeEqualHex(fastHits[0].tokenHash, candidateHash)) {
      return fastHits[0];
    }
  }

  // Legacy fallback: scan only rows that haven't been backfilled yet.
  // Bounded set, runs at most once per device. We deliberately skip the
  // backfill write here — it happens on the next Socket.io connect, which
  // is cheaper than two DB roundtrips on every attachment download.
  const legacyDevices = await db
    .select()
    .from(devices)
    .where(isNull(devices.tokenHash));

  for (const device of legacyDevices) {
    if (await bcrypt.compare(rawToken, device.agentToken)) {
      return device;
    }
  }

  return null;
}

/**
 * Pull the bearer token off `Authorization: Bearer …` and verify it.
 * Returns the device row on success, `null` on missing/invalid tokens.
 * The 401 response is the caller's job — different routes want different
 * shapes (plain text for downloads, JSON for APIs).
 */
export async function verifyAgentBearer(
  request: Request,
): Promise<typeof devices.$inferSelect | null> {
  const header = request.headers.get('authorization');
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  return verifyToken(token);
}
