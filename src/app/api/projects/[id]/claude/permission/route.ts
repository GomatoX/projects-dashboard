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
 * POST /api/projects/[id]/claude/permission
 *
 * Body: { sessionId: string, requestId: string, decision: 'allow' | 'deny' }
 *
 * Forwards the user's tool-permission decision to the agent. The agent's
 * canUseTool callback is blocked on a promise keyed by `requestId` and
 * resolves it as soon as we relay this event.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => ({}));
  const { sessionId, requestId, decision } = body as {
    sessionId?: string;
    requestId?: string;
    decision?: 'allow' | 'deny';
  };

  if (!sessionId || !requestId || (decision !== 'allow' && decision !== 'deny')) {
    return Response.json(
      { error: 'sessionId, requestId, decision required' },
      { status: 400 },
    );
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
    return Response.json(
      { error: 'Agent not connected' },
      { status: 503 },
    );
  }

  socket.emit('command', {
    type: 'CLAUDE_PERMISSION_RESPONSE',
    id: nanoid(),
    sessionId,
    requestId,
    decision,
  } satisfies AgentCommand);

  return Response.json({ ok: true });
}
