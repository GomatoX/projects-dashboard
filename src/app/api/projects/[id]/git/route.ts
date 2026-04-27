import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  GIT_COMMAND_ALLOWLIST,
  buildAllowedCommand,
} from '@/lib/socket/command-allowlist';
import type { AgentCommand } from '@/lib/socket/types';

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

    // Whitelist: client never controls projectPath — it always comes from the
    // project record. Unknown command types and stray fields are dropped.
    const built = buildAllowedCommand(body, GIT_COMMAND_ALLOWLIST, {
      projectPath: project.path,
    });
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: built.status });
    }

    // Cast: buildAllowedCommand has already validated `type` and the field
    // shape against the allowlist, so the value is structurally an AgentCommand.
    const command = { ...built.command, id: nanoid() } as unknown as AgentCommand;

    // Git push/pull/fetch can be slow
    const slowTypes = new Set(['GIT_PUSH', 'GIT_PULL', 'GIT_FETCH']);
    const timeout = slowTypes.has(command.type) ? 30000 : 15000;
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
