import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

// POST /api/projects/[id]/terminal — spawn a new terminal session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { cols = 80, rows = 24 } = body;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!project.deviceId) {
    return NextResponse.json({ error: 'No agent connected' }, { status: 400 });
  }

  const agentManager = getAgentManager();
  if (!agentManager || !agentManager.isDeviceConnected(project.deviceId)) {
    return NextResponse.json({ error: 'Agent not connected' }, { status: 503 });
  }

  const sessionId = `term-${nanoid(8)}`;

  try {
    await agentManager.sendCommand(project.deviceId, {
      type: 'TERMINAL_SPAWN',
      id: nanoid(),
      sessionId,
      cwd: project.path,
      cols,
      rows,
    });

    return NextResponse.json({ sessionId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to spawn terminal' },
      { status: 500 },
    );
  }
}

// DELETE /api/projects/[id]/terminal — kill a terminal session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { sessionId } = body;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project?.deviceId) {
    return NextResponse.json({ error: 'No agent' }, { status: 400 });
  }

  const agentManager = getAgentManager();
  if (!agentManager) {
    return NextResponse.json({ error: 'Agent not available' }, { status: 503 });
  }

  try {
    await agentManager.sendCommand(project.deviceId, {
      type: 'TERMINAL_KILL',
      id: nanoid(),
      sessionId,
    });

    return NextResponse.json({ killed: true });
  } catch {
    return NextResponse.json({ killed: false }, { status: 500 });
  }
}
