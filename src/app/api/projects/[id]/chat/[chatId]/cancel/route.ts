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
import { abortRemote } from '@/lib/ai/remote-cancel';
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
    // Defensive: release any leftover remote cleanup if the chat raced
    // mode mid-stream. abortRemote is a no-op when nothing is registered.
    await abortRemote(chatId);
    return Response.json({ ok: true, mode: 'local', wasActive: true });
  }

  // Remote path: best-effort. We try to (a) tell the device-side agent to
  // stop and (b) release any cleanup closure registered by the stream
  // handler. Either side may be a no-op (no sessionId after page reload,
  // device offline) — we still want to "succeed" the cancel so the UI
  // stops showing a streaming spinner.
  if (chat.executionMode === 'remote') {
    let socketEmitted = false;
    if (remoteSessionId) {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));
      if (project?.deviceId) {
        const agentManager = getAgentManager();
        const socket = agentManager?.getAgentSocket(project.deviceId);
        if (socket) {
          try {
            socket.emit('command', {
              type: 'CLAUDE_CANCEL',
              id: nanoid(),
              sessionId: remoteSessionId,
            } satisfies AgentCommand);
            socketEmitted = true;
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[cancel] socket emit failed', { chatId, err });
          }
        }
      }
    }

    const releasedRegistry = await abortRemote(chatId);
    const wasActive = socketEmitted || releasedRegistry;
    return Response.json({ ok: true, mode: 'remote', wasActive });
  }

  // Nothing to do — turn already finished naturally between the user's
  // click and this request landing. Treat as success so the UI doesn't
  // surface a spurious error toast.
  //
  // Defensive: if a stale remote cleanup is still registered (e.g. mode
  // flipped mid-stream and CLAUDE_DONE never arrived), release it so the
  // active-streams counter doesn't stay pinned.
  const releasedStale = await abortRemote(chatId);
  return Response.json({ ok: true, wasActive: releasedStale });
}
