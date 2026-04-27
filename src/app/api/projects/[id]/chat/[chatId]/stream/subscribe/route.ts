// src/app/api/projects/[id]/chat/[chatId]/stream/subscribe/route.ts
//
// GET /api/projects/[id]/chat/[chatId]/stream/subscribe[?since=<seq>]
//
// SSE stream that replays the in-flight chat turn from the SQLite
// journal and then forwards new events in real time via the in-memory
// listener. Used when the original POST connection is gone (tab/project
// switch, page reload, server restart) but the agent is still working
// (or just finished) server-side.
//
// Query params:
//   since: number — last journal seq the client has already seen.
//                   Defaults to 0 (full replay). Last-Event-ID header
//                   takes precedence if present.
//
// Response: text/event-stream. Each frame: `id: <seq>\ndata: <json>\n\n`.
// A final frame `data: {"type":"__subscribe_end__"}\n\n` is emitted once
// the journal is closed, then the response closes.

import { NextRequest } from 'next/server';
import {
  getSnapshot,
  subscribe,
  type JournalEvent,
} from '@/lib/ai/event-journal';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { chatId } = await params;
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since');
  const lastEventIdHeader = request.headers.get('last-event-id');
  const since = Math.max(
    0,
    Number(sinceParam ?? lastEventIdHeader ?? 0) || 0,
  );

  // Resolve the snapshot up front so we can return 404 for unknown chats.
  const initialSnapshot = await getSnapshot(chatId, since);
  if (initialSnapshot.status === 'missing') {
    return new Response(
      JSON.stringify({ error: 'no_active_stream', chatId }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastSentSeq = since;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const emit = (event: JournalEvent) => {
        if (event.seq <= lastSentSeq) return; // dedupe seam
        lastSentSeq = event.seq;
        safeEnqueue(
          encoder.encode(`id: ${event.seq}\ndata: ${event.data}\n\n`),
        );
      };

      // Subscribe FIRST so any event that arrives during the snapshot
      // flush is captured. We dedupe by seq inside `emit`.
      let unsubscribe: (() => void) | null = null;
      if (initialSnapshot.status === 'active') {
        unsubscribe = subscribe(chatId, (event) => {
          if (event.seq === -1) {
            // Journal end sentinel
            safeEnqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: '__subscribe_end__' })}\n\n`,
              ),
            );
            unsubscribe?.();
            unsubscribe = null;
            safeClose();
            return;
          }
          emit(event);
        });
      }

      // Flush the snapshot synchronously after subscribing.
      for (const event of initialSnapshot.events) {
        emit(event);
      }

      // If the journal was already ended at snapshot time, close out now.
      if (initialSnapshot.status === 'ended') {
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: '__subscribe_end__' })}\n\n`,
          ),
        );
        safeClose();
        return;
      }

      // If the client disconnects mid-tail, just detach. Do NOT end the
      // journal — other readers may still be subscribed, and the agent
      // is producing real work that should land in DB regardless.
      request.signal.addEventListener('abort', () => {
        unsubscribe?.();
        unsubscribe = null;
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
