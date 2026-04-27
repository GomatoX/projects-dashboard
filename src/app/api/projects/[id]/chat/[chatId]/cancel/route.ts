// src/app/api/projects/[id]/chat/[chatId]/cancel/route.ts
//
// POST /api/projects/[id]/chat/[chatId]/cancel
//
// Stops an in-flight chat turn. The chat row's `executionMode` decides
// whether we abort the LOCAL SDK query (in-process AbortController flip)
// or forward CLAUDE_CANCEL to the REMOTE device over Socket.io.
//
// Body: none required. Response: { ok: true } on success.
//
// Idempotent — calling it on a chat that isn't streaming returns ok with
// `wasActive: false` rather than 4xx, so the UI can fire-and-forget the
// click without races against the natural `done` event.

import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { chats, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { abortLocal, hasLocalAbort } from '@/lib/ai/local-cancel';
import type { AgentCommand } from '@/lib/socket/types';

type AgentManagerModule = typeof import('@/lib/socket/agent-manager');

function getAgentManager(): AgentManagerModule | null {
  return (globalThis as Record<string, unknown>).__agentManager as
    | AgentManagerModule
    | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { id: projectId, chatId } = await params;

  // Optional sessionId in the body — when the live bubble is for a remote
  // turn, the client passes the captured `sessionId` so we can target the
  // right device session. (For local mode, we just use chatId.)
  const body = await request.json().catch(() => ({}));
  const remoteSessionId: string | undefined =
    typeof body.sessionId === 'string' ? body.sessionId : undefined;

  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
  if (!chat) {
    return Response.json({ error: 'Chat not found' }, { status: 404 });
  }

  // Local-mode short-circuit: if there's an SDK query running for this
  // chat in this server process, abort it. We deliberately try this
  // before checking the chat's `executionMode` because a chat can have
  // run locally even when the chat row says remote (e.g. just-switched
  // mode while a previous local turn is still wrapping up).
  if (hasLocalAbort(chatId)) {
    abortLocal(chatId);
    return Response.json({ ok: true, mode: 'local', wasActive: true });
  }

  // Remote path: forward CLAUDE_CANCEL to the device socket. Requires
  // the project to have a connected device and the client to have
  // captured a sessionId from the live `session_started` event.
  if (chat.executionMode === 'remote') {
    if (!remoteSessionId) {
      return Response.json(
        { error: 'sessionId required for remote cancel' },
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
      return Response.json({ error: 'Agent not connected' }, { status: 503 });
    }

    socket.emit('command', {
      type: 'CLAUDE_CANCEL',
      id: nanoid(),
      sessionId: remoteSessionId,
    } satisfies AgentCommand);

    return Response.json({ ok: true, mode: 'remote', wasActive: true });
  }

  // Nothing to do — turn already finished naturally between the user's
  // click and this request landing. Treat as success so the UI doesn't
  // surface a spurious error toast.
  return Response.json({ ok: true, wasActive: false });
}
