import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { AgentCommand } from '@/lib/socket/types';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as
    | AgentManagerModule
    | null;
}

/**
 * POST /api/projects/[id]/claude/cancel
 * Body: { sessionId: string }
 *
 * Aborts the in-flight Claude session on the device. The SSE stream's
 * own abort handler also sends this when the browser disconnects, so
 * this endpoint is for explicit "Cancel" button clicks.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => ({}));
  const sessionId: string | undefined = body.sessionId;

  if (!sessionId) {
    return Response.json({ error: 'sessionId required' }, { status: 400 });
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project?.deviceId) {
    return Response.json({ error: 'No device' }, { status: 400 });
  }

  const agentManager = getAgentManager();
  const socket = agentManager?.getAgentSocket(project.deviceId);
  if (!socket) {
    return Response.json({ error: 'Agent not connected' }, { status: 503 });
  }

  socket.emit('command', {
    type: 'CLAUDE_CANCEL',
    id: nanoid(),
    sessionId,
  } satisfies AgentCommand);

  return Response.json({ ok: true });
}
