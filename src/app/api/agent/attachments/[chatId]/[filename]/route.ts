import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyAgentBearer } from '@/lib/auth/verify-agent-bearer';

/**
 * Agent-side attachment download.
 *
 * The user-facing GET …/chat/{chatId}/attachments/{filename} endpoint is
 * gated by the dashboard's session cookie and exists for browser thumbnail
 * rendering. Devices don't have that cookie — they authenticate with their
 * agent token — so this parallel route serves the exact same bytes but
 * accepts `Authorization: Bearer <agentToken>` instead.
 *
 * Path: /api/agent/attachments/{chatId}/{filename}
 *
 * Excluded from `middleware.ts` via the matcher so the session-cookie
 * redirect can't intercept the agent's request and bounce it to /login.
 */
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string; filename: string }> },
) {
  const device = await verifyAgentBearer(request);
  if (!device) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { chatId, filename } = await params;

  // Path traversal guard: `path.basename` strips any `../`, and we then
  // double-check the basename matches the input so a request for
  // `../../etc/passwd` can never escape the per-chat directory.
  const safeName = path.basename(filename);
  if (safeName !== filename || safeName.includes('..') || safeName === '') {
    return new Response('Bad request', { status: 400 });
  }

  const filepath = path.join(
    process.cwd(),
    'data',
    'uploads',
    'chats',
    chatId,
    safeName,
  );

  let data: Buffer;
  try {
    data = await readFile(filepath);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const ext = path.extname(safeName).toLowerCase();
  const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      // Files are immutable (filename includes a nanoid). Private cache
      // is fine since the agent's HTTP client may keep it briefly, but
      // we don't want shared proxies storing per-device responses.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
