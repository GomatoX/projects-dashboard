import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  FILE_COMMAND_ALLOWLIST,
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
      return NextResponse.json({ error: 'Project has no device assigned' }, { status: 400 });
    }

    const agentManager = getAgentManager();
    if (!agentManager) {
      return NextResponse.json({ error: 'Agent manager not initialized' }, { status: 503 });
    }

    if (!agentManager.isDeviceConnected(project.deviceId)) {
      return NextResponse.json({ error: 'Device is not connected' }, { status: 404 });
    }

    // Whitelist: drop unknown fields, inject project-trusted ones server-side.
    const built = buildAllowedCommand(body, FILE_COMMAND_ALLOWLIST, {
      projectPath: project.path,
    });
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: built.status });
    }

    // Cast: buildAllowedCommand has already validated `type` and the field
    // shape against the allowlist, so the value is structurally an AgentCommand.
    const command = { ...built.command, id: nanoid() } as unknown as AgentCommand;

    // Longer timeout for search operations
    const timeout = command.type === 'SEARCH_CODEBASE' ? 20000 : 15000;
    const response = await agentManager.sendCommand(project.deviceId, command, timeout);

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'File operation failed';
    console.error('File operation error:', message);

    if (message.includes('timed out')) {
      return NextResponse.json({ error: message }, { status: 504 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
