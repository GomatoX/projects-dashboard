import { NextRequest, NextResponse } from 'next/server';
import { resolvePermission } from '@/lib/ai/permission-store';

// POST /api/projects/[id]/chat/[chatId]/permission
// Client sends { toolUseId, decision: 'allow' | 'deny' }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const body = await request.json();
  const { toolUseId, decision } = body;

  if (!toolUseId || !['allow', 'deny'].includes(decision)) {
    return NextResponse.json(
      { error: 'toolUseId and decision (allow|deny) are required' },
      { status: 400 },
    );
  }

  const resolved = resolvePermission(toolUseId, decision);

  if (!resolved) {
    return NextResponse.json(
      { error: 'No pending permission request found for this toolUseId' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
