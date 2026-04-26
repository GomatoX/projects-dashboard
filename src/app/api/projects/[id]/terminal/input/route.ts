import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

// POST /api/projects/[id]/terminal/input — send input to terminal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { sessionId, data } = body;

  if (!sessionId || data === undefined) {
    return NextResponse.json({ error: 'sessionId and data required' }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project?.deviceId) {
    return NextResponse.json({ error: 'No agent' }, { status: 400 });
  }

  const agentManager = getAgentManager();
  if (!agentManager) {
    return NextResponse.json({ error: 'Agent not available' }, { status: 503 });
  }

  try {
    // Fire-and-forget — terminal input doesn't need a response
    const socket = agentManager.getAgentSocket(project.deviceId);
    if (!socket) throw new Error('Agent not connected');

    socket.emit('command', {
      type: 'TERMINAL_INPUT',
      id: nanoid(),
      sessionId,
      data,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send input' },
      { status: 500 },
    );
  }
}
