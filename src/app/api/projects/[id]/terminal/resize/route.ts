import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

// POST /api/projects/[id]/terminal/resize — resize terminal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { sessionId, cols, rows } = body;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project?.deviceId) {
    return NextResponse.json({ error: 'No agent' }, { status: 400 });
  }

  const agentManager = getAgentManager();
  if (!agentManager) {
    return NextResponse.json({ error: 'Agent not available' }, { status: 503 });
  }

  const socket = agentManager.getAgentSocket(project.deviceId);
  if (!socket) {
    return NextResponse.json({ error: 'Agent not connected' }, { status: 503 });
  }

  socket.emit('command', {
    type: 'TERMINAL_RESIZE',
    id: nanoid(),
    sessionId,
    cols,
    rows,
  });

  return NextResponse.json({ ok: true });
}
