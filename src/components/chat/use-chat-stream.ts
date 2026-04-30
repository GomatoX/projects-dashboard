'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useStreamingState } from './streaming-state';
import {
  writePreview as writePreviewToStore,
} from './preview-store';
import { mergePreviewItem } from '@/lib/ai/preview-merge';
import { pushFrame, clearChat as clearBrowserFrames } from '@/lib/ai/browser-frame-store';
import { type ChatMsg } from './ChatMessage';
import { type PendingAttachment } from './ChatInput';
import { type PermissionRequest, type ToolActivity } from './ToolApprovalCard';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/audio';

// Server-side metadata returned by POST /attachments after the file lands
// on disk. This is the exact shape persisted into chatMessages.attachments
// (as JSON) and what ChatMessage renders thumbnails from.
interface UploadedAttachment {
  id: string;
  filename: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

// Helpers for working with the per-chat Sets — keeping these as tiny pure
// functions makes the state updates below much easier to read.
function withAdded(set: Set<string>, key: string): Set<string> {
  if (set.has(key)) return set;
  const next = new Set(set);
  next.add(key);
  return next;
}

function withRemoved(set: Set<string>, key: string): Set<string> {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
}

interface UseChatStreamArgs {
  projectId: string;
  activeChat: string | null;
  serverStreamingChats: ReadonlySet<string>;
  fetchMessages: (chatId: string) => Promise<void>;
  fetchChats: () => Promise<unknown>;
  /** Open the preview panel — called from preview/browser event handlers. */
  openPreview: () => void;
  /** Adds the optimistic user message to the visible list. */
  appendOptimisticUserMessage: (msg: ChatMsg) => void;
  /** Active chat data, for executionMode lookup at send time. */
  chatList: Array<{ id: string; executionMode: 'local' | 'remote' }>;
}

export function useChatStream(args: UseChatStreamArgs) {
  const {
    projectId,
    activeChat,
    serverStreamingChats,
    fetchMessages,
    fetchChats,
    openPreview,
    appendOptimisticUserMessage,
    chatList,
  } = args;

  // ─── Per-chat streaming state ─────────────────────────────────────────
  // Multiple chats can stream concurrently, so every piece of "live turn"
  // state is keyed by chatId. The previous version kept a single boolean /
  // string per panel, which forced the input to be disabled in *every* chat
  // whenever any chat was streaming and leaked the typing indicator into
  // whichever chat happened to be active when an event arrived.
  const [streamingChats, setStreamingChats] = useState<Set<string>>(new Set());
  // Set of chat IDs the user has just clicked Stop on. We disable the
  // button while the cancel request is in flight; cleared once the
  // surviving SSE handler hits `done` (or the network roundtrip fails).
  const [cancellingChats, setCancellingChats] = useState<Set<string>>(new Set());
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  // Per-chat AbortController for the in-flight POST /stream fetch. Held in
  // a ref (not state) because it's mutated from inside `sendMessage`'s
  // closure and the Stop button — neither needs a re-render. Cleaned up in
  // sendMessage's `finally` and on stopChat success. Keyed by chatId so a
  // stop click on one chat can't accidentally abort a sibling stream.
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Tracks the chat the user is currently viewing without re-creating the
  // sendMessage closure on every switch. The streaming reader runs for the
  // full duration of an agent turn and needs an up-to-date reference, not the
  // value captured when sendMessage was called.
  const activeChatRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const streaming = useStreamingState();

  // Shared dispatcher for the three BROWSER_* events emitted by the agent's
  // browser MCP. Returns true when the event was handled (so the caller can
  // early-return and skip the rest of its event-handler chain).
  // Used from BOTH event-handler arms (live SSE loop + replay loop) — extracted
  // to a single function so the two arms can't drift.
  const handleBrowserEvent = useCallback(
    (event: Record<string, unknown>, chatId: string): boolean => {
      if (event.type === 'BROWSER_CONTEXT_OPENED') {
        // Insert a synthetic 'browser' PreviewItem so the rail shows it.
        // Content is empty — the live store carries the frames.
        writePreviewToStore(chatId, (prev) =>
          mergePreviewItem(
            prev,
            {
              type: 'preview',
              id: `browser:${chatId}`,
              contentType: 'browser',
              content: '',
              title: 'Browser',
            },
            Date.now(),
          ),
        );
        // Auto-open the panel the first time a browser context opens for this chat.
        openPreview();
        return true;
      }
      if (event.type === 'BROWSER_CONTEXT_CLOSED') {
        // Remove the browser item from the rail. Other previews stay.
        writePreviewToStore(chatId, (prev) => ({
          ...prev,
          items: prev.items.filter((i) => i.id !== `browser:${chatId}`),
          activeId: prev.activeId === `browser:${chatId}` ? null : prev.activeId,
        }));
        clearBrowserFrames(chatId);
        return true;
      }
      if (event.type === 'BROWSER_FRAME') {
        pushFrame(chatId, {
          frameB64: event.frameB64 as string,
          width: event.width as number,
          height: event.height as number,
          url: event.url as string,
          timestamp: event.timestamp as number,
        });
        return true;
      }
      return false;
    },
    [openPreview],
  );

  // Handles SSE events from the /stream/subscribe endpoint (reattach path).
  // Mirrors `handleEvent` in sendMessage, but writes exclusively through the
  // streaming context (no local `accumulated` string — context.content is the
  // accumulator). Stable as long as `streaming`, `fetchMessages`, and
  // `fetchChats` are stable.
  const handleSubscribedEvent = useCallback(
    (chatId: string, event: Record<string, unknown>) => {
      if (event.type === 'session_started') {
        streaming.setSessionId(chatId, event.sessionId as string);
        return;
      }
      if (event.type === 'text') {
        // The reattach effect calls `streaming.begin(chatId)` once before
        // pumping events into us, so by the time we get here the slice is
        // already active. We deliberately do NOT read `streaming.get` —
        // this callback's `streaming` is captured at mount and `get` is a
        // closure over a stale `byChat`, which would always return
        // EMPTY_STATE and trigger a content-wiping `begin()` on every
        // delta.
        streaming.appendText(chatId, event.text as string);
        return;
      }
      if (event.type === 'turn_break') {
        streaming.appendTurnBreak(chatId);
        return;
      }
      if (event.type === 'tool_use') {
        const tool = event.tool as Record<string, unknown>;
        streaming.addToolActivity(chatId, {
          id: tool.id as string,
          toolName: tool.toolName as string,
          displayName: tool.displayName as string,
          status: tool.status as ToolActivity['status'],
          input: tool.input as Record<string, unknown>,
        });
        return;
      }
      if (event.type === 'permission_request') {
        streaming.addPermission(chatId, {
          toolUseId: (event.toolUseId ?? event.requestId) as string,
          toolName: event.toolName as string,
          displayName: (event.displayName ?? event.toolName) as string,
          category: (event.category ?? 'execute') as PermissionRequest['category'],
          input: event.input as Record<string, unknown>,
          title: (event.title ?? event.reason ?? `${event.toolName}`) as string,
          description: event.description as string | undefined,
          status: 'pending',
        });
        return;
      }
      if (event.type === 'preview') {
        writePreviewToStore(chatId, (prev) =>
          mergePreviewItem(
            prev,
            {
              type: 'preview',
              id: event.id as string,
              contentType: event.contentType as 'html' | 'markdown' | 'mermaid' | 'svg' | 'diff',
              content: event.content as string,
              title: event.title as string | undefined,
            },
            Date.now(),
          ),
        );
        openPreview();
        return;
      }
      if (handleBrowserEvent(event, chatId)) return;
      if (event.type === 'done') {
        streaming.end(chatId);
        if (activeChatRef.current === chatId) {
          // Refetch messages so the persisted assistant row replaces the
          // live bubble, THEN clear the live state. Doing both in this
          // order avoids a flash where the bubble disappears before the
          // persisted row has rendered.
          fetchMessages(chatId).finally(() => {
            streaming.clear(chatId);
          });
        } else {
          // Not the active chat — no bubble to flash. Clear immediately.
          streaming.clear(chatId);
        }
        fetchChats();
        playSound('taskComplete');
        return;
      }
      if (event.type === 'error') {
        notify({
          title: 'AI Error',
          message: event.message as string,
          color: 'red',
        });
        streaming.end(chatId);
      }
    },
    [streaming, fetchMessages, fetchChats, handleBrowserEvent, openPreview],
  );

  // ─── Reattach to a server-side live stream ──────────────────────────────
  // When the server reports a chat is mid-turn but this browser is not
  // driving the POST (page reload, project switch return, tab switch with
  // a different active chat), open a SSE subscription to /stream/subscribe
  // and pipe its events through handleSubscribedEvent. This restores live
  // text deltas, tool activity badges, and pending permission requests
  // with full fidelity.
  // The old polling-based recovery (setInterval → fetchMessages) has been
  // replaced by this subscribe-based approach.
  useEffect(() => {
    if (!activeChat) return;
    if (!serverStreamingChats.has(activeChat)) return;
    if (streamingChats.has(activeChat)) return; // we're already feeding events ourselves

    const chatId = activeChat;
    const since = streaming.get(chatId).lastEventSeq;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chat/${chatId}/stream/subscribe?since=${since}`,
          { signal: controller.signal },
        );
        if (!res.ok || !res.body) {
          // 404 == no longer active — the polling effect will catch the new state
          return;
        }

        // Initialise the streaming slice ONLY when this is a truly fresh
        // subscribe (since=0). On a continuation — e.g. Fast Refresh or any
        // remount that preserved the StreamingStateProvider — the slice
        // already holds the content streamed by the previous subscribe and
        // the server is replaying only events past `lastEventSeq`. Calling
        // begin() here would wipe that pre-remount content and the user
        // would only see the small tail that arrives after this subscribe
        // opens. handleSubscribedEvent doesn't depend on `active` after the
        // earlier stale-closure cleanup, so leaving the slice as-is is safe.
        if (since === 0) {
          streaming.begin(chatId);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let pendingId: number | null = null;

        const dispatch = (rawData: string) => {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            return;
          }
          if (parsed.type === '__subscribe_end__') {
            cancelled = true;
            controller.abort();
            return;
          }
          handleSubscribedEvent(chatId, parsed);
          if (pendingId != null) {
            streaming.bumpSeq(chatId, pendingId);
            pendingId = null;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) break;

          buffer += decoder.decode(value, { stream: true });
          // Split on \r?\n so we tolerate CRLF normalization by intermediaries.
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('id: ')) {
              const n = Number(line.slice(4));
              if (!Number.isNaN(n)) pendingId = n;
              continue;
            }
            if (line.startsWith('data: ')) {
              dispatch(line.slice(6));
              continue;
            }
            // blank line — frame boundary; nothing to do (dispatch already happened on data: line)
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // eslint-disable-next-line no-console
          console.warn('[useChatStream] subscribe failed:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, serverStreamingChats, streamingChats, projectId]);

  // Send message with streaming. Multiple invocations can be in flight in
  // parallel — one per chat — and they share no mutable state besides the
  // per-chat maps in React state.
  //
  // Attachment flow: any pending files are uploaded to disk *first* via
  // POST /attachments, which returns durable metadata (id, url, size, …).
  // That metadata is what we both (a) persist with the user message via the
  // stream route's `attachments` field and (b) render as thumbnails in chat
  // history. The raw `File` objects never reach the stream route — by the
  // time we hit /stream, the bytes already live on disk and we just pass
  // along URLs the agent (and the UI) can read back.
  const sendMessage = async (
    content: string,
    pending: PendingAttachment[] = [],
  ) => {
    if (!activeChat) return;
    // Per-chat guard: a chat that is already streaming (locally or on the
    // server) cannot accept another turn until it finishes. Other chats are
    // unaffected.
    if (streamingChats.has(activeChat) || serverStreamingChats.has(activeChat)) return;

    // Capture the chat id at the moment the user pressed Send. The user may
    // switch chats while the stream is in flight, but every event from this
    // particular agent turn belongs to *this* chat — never to whichever chat
    // happens to be active when the event arrives.
    const chatId = activeChat;

    // Step 1: persist any attachments to disk before kicking off the stream.
    // We do this synchronously (well, awaited) rather than fire-and-forget
    // so the user message we save below already references real, fetchable
    // URLs — there is no window where history shows broken thumbnails.
    let uploaded: UploadedAttachment[] = [];
    if (pending.length > 0) {
      try {
        const fd = new FormData();
        for (const att of pending) {
          fd.append('files', att.file, att.file.name);
        }
        const res = await fetch(`/api/projects/${projectId}/chat/${chatId}/attachments`, {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) throw new Error('upload failed');
        const data = await res.json();
        uploaded = data.attachments ?? [];
      } catch {
        notify({
          title: 'Upload failed',
          message: 'Could not upload attachments — message not sent.',
          color: 'red',
        });
        return;
      }
    }

    // Optimistic add user message — include the uploaded metadata so the
    // bubble shows thumbnails the moment it appears, before the stream even
    // starts. The server saves the same JSON when it persists the user row.
    const attachmentsJson = JSON.stringify(uploaded);
    const userMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      chatId,
      role: 'user',
      content,
      toolUses: '[]',
      proposedChanges: '[]',
      attachments: attachmentsJson,
      timestamp: new Date().toISOString(),
    };
    if (activeChatRef.current === chatId) {
      appendOptimisticUserMessage(userMsg);
    }
    setStreamingChats((prev) => withAdded(prev, chatId));
    streaming.begin(chatId);

    // Single place that knows how to interpret a parsed SSE event. Defined
    // up-front so the buffered reader below can call it from one spot.
    const handleEvent = (event: Record<string, unknown>) => {
      if (event.type === 'session_started') {
        // Remote mode: capture the sessionId for cancel/permission
        streaming.setSessionId(chatId, event.sessionId as string);
      } else if (event.type === 'text') {
        streaming.appendText(chatId, event.text as string);
      } else if (event.type === 'turn_break') {
        // Server signals a multi-turn assistant response (text → tool →
        // more text). Inject a paragraph break so the live bubble shows
        // the same separation as the persisted row will after refetch.
        streaming.appendTurnBreak(chatId);
      } else if (event.type === 'preview') {
        writePreviewToStore(chatId, (prev) =>
          mergePreviewItem(
            prev,
            {
              type: 'preview',
              id: event.id as string,
              contentType: event.contentType as 'html' | 'markdown' | 'mermaid' | 'svg' | 'diff',
              content: event.content as string,
              title: event.title as string | undefined,
            },
            Date.now(),
          ),
        );
        openPreview();
      } else if (handleBrowserEvent(event, chatId)) {
        // handled
      } else if (event.type === 'done') {
        // The server now persists the assistant row BEFORE emitting
        // `done`, so refetching /messages here is race-free and gives us
        // the canonical row (with full tool_uses, tokens, etc.) — which
        // the live `accumulated` text accumulator would not capture. End
        // the slice synchronously so `active` flips false; defer the
        // hard `clear` until after the fetch resolves so the streaming
        // bubble doesn't flash off before the persisted row renders.
        streaming.end(chatId);
        if (activeChatRef.current === chatId) {
          fetchMessages(chatId).finally(() => {
            streaming.clear(chatId);
          });
        } else {
          // Not the active chat — no bubble to flash. Drop immediately.
          streaming.clear(chatId);
        }
        playSound('taskComplete');
        fetchChats();
      } else if (event.type === 'permission_request') {
        playSound('notification');
        // Works for both local format (toolUseId) and remote format (requestId)
        const perm: PermissionRequest = {
          toolUseId: (event.toolUseId ?? event.requestId) as string,
          toolName: event.toolName as string,
          displayName: (event.displayName ?? event.toolName) as string,
          category: (event.category ?? 'execute') as PermissionRequest['category'],
          input: event.input as Record<string, unknown>,
          title: (event.title ?? event.reason ?? `${event.toolName}`) as string,
          description: event.description as string | undefined,
          status: 'pending',
        };
        streaming.addPermission(chatId, perm);
      } else if (event.type === 'tool_use') {
        const tool = event.tool as Record<string, unknown>;
        const activity: ToolActivity = {
          id: tool.id as string,
          toolName: tool.toolName as string,
          displayName: tool.displayName as string,
          status: tool.status as ToolActivity['status'],
          input: tool.input as Record<string, unknown>,
        };
        streaming.addToolActivity(chatId, activity);
      } else if (event.type === 'error') {
        const code = event.code as string | undefined;
        if (code === 'DEVICE_OFFLINE') {
          notify({
            title: 'Device offline',
            message: 'The device is not connected. Switch to Local mode or wait for device.',
            color: 'orange',
          });
        } else {
          notify({
            title: 'AI Error',
            message: event.message as string,
            color: 'red',
          });
        }
      }
    };

    // Abort controller for this turn — the Stop button calls
    // `controller.abort()` to tear the streaming reader down and the
    // separate /cancel POST aborts the server-side SDK query (local) or
    // the device session (remote). We register before the fetch starts so
    // a stop click that lands during the upload phase still cleans up.
    const abortController = new AbortController();
    abortControllersRef.current.set(chatId, abortController);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat/${chatId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The stream route persists `attachments` on the user message and
        // also weaves the file paths into the prompt so Claude Code's
        // Read tool can inspect them.
        body: JSON.stringify({
          message: content,
          attachments: attachmentsJson,
          executionMode: chatList.find((c) => c.id === chatId)?.executionMode ?? 'local',
        }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error('Stream request failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Buffered SSE parsing. The network can split a chunk anywhere — even
      // mid-token inside a JSON payload — so we accumulate bytes and only
      // process complete lines (those terminated by `\n`). The previous
      // implementation called `JSON.parse` on partial lines, which silently
      // dropped any text delta unlucky enough to straddle a chunk boundary.
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        // The last element may be an incomplete line — keep it in the buffer
        // until the next chunk arrives.
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)));
          } catch {
            // Truly malformed JSON — should not happen now that lines are
            // guaranteed complete, but stay defensive.
          }
        }
      }

      // Flush any final complete event left in the buffer (some servers
      // omit the trailing newline on the very last event).
      if (buffer.startsWith('data: ')) {
        try {
          handleEvent(JSON.parse(buffer.slice(6)));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      // AbortError is the expected outcome of the Stop button — don't
      // surface it as a failure toast. Anything else is a real network
      // / server error worth telling the user about.
      const name = (err as { name?: string } | null)?.name;
      if (name !== 'AbortError') {
        notify({
          title: 'Error',
          message: 'Failed to get AI response',
          color: 'red',
        });
      }
    } finally {
      // Drop the controller from the ref FIRST so a late stopChat click
      // (between the SSE reader exit and this finally) doesn't try to
      // abort an already-finished request and inadvertently flag the
      // chat as still cancelling.
      const cur = abortControllersRef.current.get(chatId);
      if (cur === abortController) abortControllersRef.current.delete(chatId);
      setCancellingChats((prev) => withRemoved(prev, chatId));
      setStreamingChats((prev) => withRemoved(prev, chatId));
      streaming.end(chatId);
    }
  };

  // Stop an in-flight turn for the active chat. Two parallel actions:
  //   1. Abort the local fetch reader so the streaming UI tears down
  //      immediately (the server-side agent might still flush a final
  //      `done` event, which is fine — it lands on a controller that
  //      no longer has a listener).
  //   2. POST /cancel so the server actually stops the SDK query (local)
  //      or forwards CLAUDE_CANCEL to the device (remote). The endpoint
  //      decides which path to take based on the chat's executionMode.
  // Either side succeeding is enough to surface the right UI state.
  const stopChat = useCallback(
    async (chatId: string) => {
      if (cancellingChats.has(chatId)) return;
      setCancellingChats((prev) => withAdded(prev, chatId));

      // (1) Local fetch teardown — abort BEFORE the network call so a
      // slow /cancel response doesn't keep the bubble looking active.
      const controller = abortControllersRef.current.get(chatId);
      if (controller) {
        try {
          controller.abort();
        } catch {
          // already aborted
        }
        abortControllersRef.current.delete(chatId);
      }

      // (2) Tell the server to stop. Best-effort — even if this fails
      // (offline, route 500s, etc.) the client side has already been
      // torn down by step 1 and the chat will return to an idle state
      // when the SSE reader exits.
      try {
        const sessionId = streaming.get(chatId).sessionId;
        await fetch(`/api/projects/${projectId}/chat/${chatId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionId ? { sessionId } : {}),
        });
      } catch {
        // Swallow — the local teardown already happened. We deliberately
        // don't toast here: the user's intent was "stop", so any visible
        // "stopping failed" message would be more confusing than helpful.
      }

      // The client-side fetch was torn down in step (1), so the original
      // sendMessage SSE reader will never see the server's `done` event
      // — and therefore never refetches /messages to swap the live bubble
      // for the persisted assistant row. Do it explicitly here. The
      // server's catch → persist → finally chain runs after the
      // AbortController flip, so we wait briefly to give the row a
      // chance to land in SQLite. A second pass at ~1.6s covers the
      // remote path (which takes an extra Socket.io round-trip) and any
      // case where the first pass raced ahead of the insert.
      setTimeout(() => {
        fetchMessages(chatId).finally(() => {
          streaming.clear(chatId);
        });
      }, 600);
      setTimeout(() => {
        fetchMessages(chatId);
      }, 1600);

      // Local-streamed turns: the sendMessage `finally` will clear the
      // `cancellingChats` entry as part of its own cleanup. Server-side
      // / reattach turns (where sendMessage isn't running in this tab):
      // clear it once the SSE reader sees `done`/error. Worst case the
      // chat-list poll resyncs `serverStreamingChats` and the spinner
      // disappears — but `cancellingChats` is purely local UX state, so
      // also drop it ourselves on a short delay so the button doesn't
      // stay stuck if no SSE event ever arrives (e.g. journal already
      // ended between snapshot and our cancel landing).
      setTimeout(() => {
        setCancellingChats((prev) => withRemoved(prev, chatId));
      }, 4000);
    },
    [cancellingChats, projectId, streaming, fetchMessages],
  );

  // Handle permission approval — routes to the correct endpoint based on mode
  const approvePermission = async (toolUseId: string) => {
    if (!activeChat) return;
    setRespondingTo(toolUseId);
    const chatId = activeChat;
    const sessionId = streaming.get(chatId).sessionId;

    try {
      if (sessionId) {
        // Remote mode: use /claude/permission with sessionId
        await fetch(`/api/projects/${projectId}/claude/permission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, requestId: toolUseId, decision: 'allow' }),
        });
      } else {
        // Local mode: use /chat/[chatId]/permission with toolUseId
        await fetch(`/api/projects/${projectId}/chat/${chatId}/permission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolUseId, decision: 'allow' }),
        });
      }

      streaming.updatePermission(chatId, toolUseId, 'approved');
    } catch {
      notify({
        title: 'Error',
        message: 'Failed to send permission decision',
        color: 'red',
      });
    } finally {
      setRespondingTo(null);
    }
  };

  const denyPermission = async (toolUseId: string) => {
    if (!activeChat) return;
    const chatId = activeChat;
    const sessionId = streaming.get(chatId).sessionId;

    try {
      if (sessionId) {
        await fetch(`/api/projects/${projectId}/claude/permission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, requestId: toolUseId, decision: 'deny' }),
        });
      } else {
        await fetch(`/api/projects/${projectId}/chat/${chatId}/permission`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolUseId, decision: 'deny' }),
        });
      }

      streaming.updatePermission(chatId, toolUseId, 'denied');
    } catch {
      notify({
        title: 'Error',
        message: 'Failed to send permission decision',
        color: 'red',
      });
    }
  };

  return {
    streamingChats,
    cancellingChats,
    respondingTo,
    sendMessage,
    stopChat,
    approvePermission,
    denyPermission,
  };
}
