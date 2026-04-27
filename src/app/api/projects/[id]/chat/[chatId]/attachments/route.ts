import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';

// POST /api/projects/[id]/chat/[chatId]/attachments
//
// Accepts multipart/form-data with one or more files under the `files` key
// and persists them to disk under `data/uploads/chats/<chatId>/`. Returns
// JSON metadata that the client then forwards to the stream route together
// with the message text.
//
// Storage layout was chosen over base64-in-DB so SQLite stays small and the
// raw bytes never have to be re-encoded on every history fetch — the stream
// route reads them straight from disk when building the user turn for Claude.
//
// No artificial size cap is enforced here: this dashboard runs on a local
// machine, and Anthropic's own API already rejects images >5MB / PDFs >32MB
// with a clear error, which is the "real" wall the user would hit anyway.
// We do sanitize filenames to prevent path traversal and reuse the saved
// name when reading back in the stream route.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id: projectId, chatId } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data body' },
      { status: 400 },
    );
  }

  const files = formData.getAll('files');
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const uploadDir = path.join(
    process.cwd(),
    'data',
    'uploads',
    'chats',
    chatId,
  );
  await mkdir(uploadDir, { recursive: true });

  const results: Array<{
    id: string;
    filename: string;
    name: string;
    type: string;
    size: number;
    url: string;
  }> = [];

  for (const f of files) {
    if (!(f instanceof File)) continue;

    // Strip path components from the user-supplied name and reduce to a safe
    // ASCII subset. The random nanoid prefix guarantees uniqueness even when
    // multiple files share the same display name.
    const id = nanoid(12);
    const cleanName = path
      .basename(f.name || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    const filename = `${id}-${cleanName || 'file'}`;
    const filepath = path.join(uploadDir, filename);

    const bytes = Buffer.from(await f.arrayBuffer());
    await writeFile(filepath, bytes);

    results.push({
      id,
      filename,
      name: f.name || cleanName,
      type: f.type || 'application/octet-stream',
      size: f.size,
      url: `/api/projects/${projectId}/chat/${chatId}/attachments/${filename}`,
    });
  }

  return NextResponse.json({ attachments: results });
}
