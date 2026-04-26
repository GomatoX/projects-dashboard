import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as AgentManagerModule | null;
}

// GET /api/projects/[id]/terminal/stream?sessionId=xxx — SSE stream for terminal output
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('sessionId required', { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project?.deviceId) {
    return new Response('No agent', { status: 400 });
  }

  const agentManager = getAgentManager();
  if (!agentManager) {
    return new Response('Agent not available', { status: 503 });
  }

  const socket = agentManager.getAgentSocket(project.deviceId);
  if (!socket) {
    return new Response('Agent not connected', { status: 503 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Listen for terminal output events
      const onEvent = (event: Record<string, unknown>) => {
        if (
          event.type === 'TERMINAL_OUTPUT' &&
          event.sessionId === sessionId
        ) {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'output', data: event.data })}\n\n`,
              ),
            );
          } catch {
            // Stream closed
          }
        } else if (
          event.type === 'TERMINAL_EXIT' &&
          event.sessionId === sessionId
        ) {
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'exit', exitCode: event.exitCode })}\n\n`,
              ),
            );
            controller.close();
          } catch {
            // Already closed
          }
        }
      };

      socket.on('event', onEvent);

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        socket.off('event', onEvent);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
