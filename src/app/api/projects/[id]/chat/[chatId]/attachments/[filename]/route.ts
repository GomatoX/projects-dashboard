import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Crude file extension → MIME map. Browsers infer image previews from the
// Content-Type header, so getting common image / pdf types right is enough.
// Anything unknown falls back to octet-stream, which the browser will treat
// as a download instead of trying to render inline.
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

// GET /api/projects/[id]/chat/[chatId]/attachments/[filename]
//
// Streams a previously uploaded attachment back to the client. Used both by
// `<img src>` thumbnails in chat history and by direct download links.
//
// Security: the only meaningful threat is path traversal — `path.basename`
// strips any `../` segments and we additionally reject any filename whose
// basename differs from the input, so a request for `../../etc/passwd` can
// never escape the per-chat directory.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string; filename: string }> },
) {
  const { chatId, filename } = await params;

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
      // Files are immutable once uploaded (filename includes a nanoid), so a
      // long-ish private cache is safe and avoids re-reading from disk for
      // every thumbnail render.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
