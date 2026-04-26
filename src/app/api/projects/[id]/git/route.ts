import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();

    if (!body.type) {
      return NextResponse.json({ error: 'Command type is required' }, { status: 400 });
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.deviceId) {
      return NextResponse.json({ error: 'No device assigned' }, { status: 400 });
    }

    const agentManager = getAgentManager();
    if (!agentManager) {
      return NextResponse.json({ error: 'Agent manager not initialized' }, { status: 503 });
    }

    if (!agentManager.isDeviceConnected(project.deviceId)) {
      return NextResponse.json({ error: 'Device is not connected' }, { status: 404 });
    }

    // Inject projectPath from DB if not provided
    const command = {
      ...body,
      id: nanoid(),
      projectPath: body.projectPath || project.path,
    };

    // Git push/pull can be slow
    const timeout = ['GIT_PUSH', 'GIT_PULL', 'GIT_FETCH'].includes(body.type) ? 30000 : 15000;
    const response = await agentManager.sendCommand(project.deviceId, command, timeout);

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git operation failed';
    console.error('Git command error:', message);

    if (message.includes('timed out')) {
      return NextResponse.json({ error: message }, { status: 504 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
