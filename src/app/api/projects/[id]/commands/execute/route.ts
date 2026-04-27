import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { parseCommands } from '@/lib/commands';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

/**
 * POST /api/projects/[id]/commands/execute
 *
 * Body: { commandId: string }
 *
 * Resolves the command from the project's stored list and dispatches it:
 *   - streaming: spawns a PTY session via TERMINAL_SPAWN, returns { mode: 'stream', sessionId }.
 *     Client then connects to /api/projects/[id]/terminal/stream?sessionId=… for output.
 *   - one-shot: runs via RUN_COMMAND with 30s timeout, returns
 *     { mode: 'oneshot', output, exitCode, durationMs }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const commandId = body && typeof body === 'object' ? (body as { commandId?: unknown }).commandId : undefined;

  if (typeof commandId !== 'string' || !commandId) {
    return NextResponse.json({ error: 'commandId required' }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (!project.deviceId) {
    return NextResponse.json({ error: 'No agent connected' }, { status: 400 });
  }

  const command = parseCommands(project.commands).find((c) => c.id === commandId);
  if (!command) {
    return NextResponse.json({ error: 'Command not found' }, { status: 404 });
  }

  const agentManager = getAgentManager();
  if (!agentManager || !agentManager.isDeviceConnected(project.deviceId)) {
    return NextResponse.json({ error: 'Agent not connected' }, { status: 503 });
  }

  // Streaming mode → spawn a PTY session and let the client tail it.
  if (command.streaming) {
    const sessionId = `cmd-${nanoid(8)}`;
    try {
      await agentManager.sendCommand(project.deviceId, {
        type: 'TERMINAL_SPAWN',
        id: nanoid(),
        sessionId,
        cwd: project.path,
        cols: 120,
        rows: 30,
        command: command.cmd,
      });
      return NextResponse.json({
        mode: 'stream',
        sessionId,
        label: command.label,
        cmd: command.cmd,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to spawn command';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // One-shot mode → exec, wait for full output.
  try {
    const response = await agentManager.sendCommand(
      project.deviceId,
      {
        type: 'RUN_COMMAND',
        id: nanoid(),
        projectPath: project.path,
        command: command.cmd,
      },
      35_000, // slightly above agent's 30s exec timeout
    );

    if (response.type !== 'COMMAND_RESULT') {
      return NextResponse.json(
        {
          error:
            response.type === 'COMMAND_ERROR'
              ? (response as { message: string }).message
              : `Unexpected response: ${response.type}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      mode: 'oneshot',
      label: command.label,
      cmd: command.cmd,
      output: response.output,
      exitCode: response.exitCode,
      durationMs: response.durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    if (message.includes('timed out')) {
      return NextResponse.json({ error: message }, { status: 504 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
