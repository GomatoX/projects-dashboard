// src/app/api/devices/[id]/regenerate-token/route.ts
//
// POST /api/devices/[id]/regenerate-token
//
// Mints a new agent token for an existing device. Use case: user lost the
// original install command (didn't copy it at creation time, reformatted
// laptop, etc.) and needs to re-run the install on the same device row.
//
// SECURITY MODEL — read this before changing.
// We do NOT store the raw token. The DB has only `tokenHash` (sha256, indexed
// for connect-time lookup) and the legacy `agentToken` (bcrypt, kept for
// backwards compat with rows that pre-date the sha256 column). When this
// route returns, the raw token exists only on the wire and in the caller's
// memory — exactly the same handling as POST /api/devices.
//
// ROTATION SEMANTICS
// Rotating the token invalidates the OLD token immediately. If an agent is
// currently connected with the old token, its in-memory socket stays alive
// (we don't re-auth mid-session) but ANY future reconnect will fail until
// it's reinstalled with the new token. That's the intended behavior — the
// caller is doing this precisely because they want the new install to take
// over. The UI surfaces this via a confirm modal.
//
// We do NOT delete the old `agentToken` (bcrypt) column when rotating —
// instead we overwrite both columns with new hashes derived from the new
// raw token, mirroring the create flow. This keeps the dual-hash invariant
// intact so legacy connect paths continue to work uniformly.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { devices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';
import { hashAgentToken } from '@/lib/auth/agent-token';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const [existing] = await db.select().from(devices).where(eq(devices.id, id));
    if (!existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const rawToken = nanoid(32);
    const [bcryptHash, tokenHash] = await Promise.all([
      bcrypt.hash(rawToken, 10),
      Promise.resolve(hashAgentToken(rawToken)),
    ]);

    await db
      .update(devices)
      .set({ agentToken: bcryptHash, tokenHash })
      .where(eq(devices.id, id));

    // Return the raw token ONLY in this response — never persisted, never
    // shown to anyone except the caller of this route.
    return NextResponse.json({
      id: existing.id,
      name: existing.name,
      os: existing.os,
      rawToken,
    });
  } catch (error) {
    console.error('Failed to regenerate device token:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate token' },
      { status: 500 },
    );
  }
}
