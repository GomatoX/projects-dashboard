'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useStreamingState } from './streaming-state';
import {
  Box,
  Group,
  Stack,
  Text,
  Button,
  ActionIcon,
  Tooltip,
  Badge,
  ScrollArea,
  Center,
  Loader,
  Select,
  SegmentedControl,
} from '@mantine/core';
import {
  IconPlus,
  IconMessageCircle,
  IconTrash,
  IconSparkles,
  IconCoins,
  IconServer,
  IconCloud,
  IconPlayerStopFilled,
} from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/audio';
import { ChatMessage, type ChatMsg } from './ChatMessage';
import { ChatInput, type PendingAttachment } from './ChatInput';

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
import { ToolApprovalCard, ToolActivityBadge, type PermissionRequest, type ToolActivity } from './ToolApprovalCard';
import { PreviewPanel } from './PreviewPanel';
import { PreviewRail } from './PreviewRail';
import { ResizeHandle } from './ResizeHandle';
import {
  EMPTY_PREVIEW_STATE,
  type PreviewState,
} from '@/lib/ai/preview-types';
import { extractAllPreviews } from '@/lib/ai/preview-detector';
import { mergePreviewItem, removePreviewItem } from '@/lib/ai/preview-merge';
import { useLocalStorage } from '@mantine/hooks';

interface Chat {
  id: string;
  projectId: string;
  title: string;
  model: string;
  executionMode: 'local' | 'remote';
  totalTokensIn: number;
  totalTokensOut: number;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
  isStreaming?: boolean;
}

interface ChatPanelProps {
  projectId: string;
  deviceId: string | null;
  deviceConnected?: boolean;
}

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

const LAST_MODEL_STORAGE_KEY = 'chat:lastSelectedModel';
const LAST_MODE_STORAGE_KEY = 'chat:lastExecutionMode';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const CHAT_LIST_POLL_MS = 3000;

// Helpers for working with the per-chat Sets / Records — keeping these as
// tiny pure functions makes the state updates below much easier to read.
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

export function ChatPanel({ projectId, deviceId, deviceConnected }: ChatPanelProps) {
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  // Messages are still shown only for the active chat — switching chats
  // replaces this list. Background streams persist their assistant messages
  // server-side and are picked up on the next switch.
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  // ─── Per-chat streaming state ─────────────────────────────────────────
  // Multiple chats can stream concurrently, so every piece of "live turn"
  // state is keyed by chatId. The previous version kept a single boolean /
  // string per panel, which forced the input to be disabled in *every* chat
  // whenever any chat was streaming and leaked the typing indicator into
  // whichever chat happened to be active when an event arrived.
  const [streamingChats, setStreamingChats] = useState<Set<string>>(new Set());
  // Server-reported in-flight turns (e.g. after a refresh, or another tab
  // started the stream). Populated by the chat list poll + the messages
  // fetch on chat switch.
  const [serverStreamingChats, setServerStreamingChats] = useState<Set<string>>(new Set());
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Per-chat AbortController for the in-flight POST /stream fetch. Held in
  // a ref (not state) because it's mutated from inside `sendMessage`'s
  // closure and the Stop button — neither needs a re-render. Cleaned up in
  // sendMessage's `finally` and on stopChat success. Keyed by chatId so a
  // stop click on one chat can't accidentally abort a sibling stream.
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Set of chat IDs the user has just clicked Stop on. We disable the
  // button while the cancel request is in flight; cleared once the
  // surviving SSE handler hits `done` (or the network roundtrip fails).
  const [cancellingChats, setCancellingChats] = useState<Set<string>>(new Set());
  // Tracks the chat the user is currently viewing without re-creating the
  // sendMessage closure on every switch. The streaming reader runs for the
  // full duration of an agent turn and needs an up-to-date reference, not the
  // value captured when sendMessage was called.
  const activeChatRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const lastPreviewsRef = useRef<Map<string, PreviewState>>(new Map());

  // Persisted chat/preview split — value is the panel-area percentage of the
  // outer flex row (i.e. chat column gets 100 - split%). Clamped on read so a
  // stale localStorage value (e.g. set before clamps existed) can't break the
  // layout.
  const [splitPercentRaw, setSplitPercentRaw] = useLocalStorage<number>({
    key: 'chat:previewSplitPercent',
    defaultValue: 50,
  });
  const splitPercent = Math.min(80, Math.max(20, splitPercentRaw));
  const setSplitPercent = useCallback(
    (next: number) => {
      setSplitPercentRaw(Math.min(80, Math.max(20, next)));
    },
    [setSplitPercentRaw],
  );

  const previewState: PreviewState = activeChat
    ? (lastPreviewsRef.current.get(activeChat) ?? EMPTY_PREVIEW_STATE)
    : EMPTY_PREVIEW_STATE;
  const activeItem = previewState.items.find((i) => i.id === previewState.activeId) ?? null;
  const hasItems = previewState.items.length > 0;

  const writePreview = useCallback(
    (chatId: string, mut: (prev: PreviewState) => PreviewState) => {
      const prev = lastPreviewsRef.current.get(chatId) ?? EMPTY_PREVIEW_STATE;
      const next = mut(prev);
      if (next === prev) return;
      lastPreviewsRef.current.set(chatId, next);
      setPreviewRevision((r) => r + 1);
    },
    [],
  );

  // Re-open the preview panel (collapsed) when switching to a chat that has any items
  useEffect(() => {
    if (!activeChat) return;
    const saved = lastPreviewsRef.current.get(activeChat);
    if (saved && saved.items.length > 0) {
      setPreviewOpen(true);
    } else {
      setPreviewOpen(false);
    }
    setPreviewExpanded(false);
  }, [activeChat]);

  const containerRef = useRef<HTMLDivElement>(null);

  const streaming = useStreamingState();
  // Read the current streaming state slice for the active chat once per render.
  // Passed into effect deps as individual scalar values (not the get() function).
  const activeStreamState = activeChat ? streaming.get(activeChat) : null;

  // Load last selected model from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(LAST_MODEL_STORAGE_KEY);
    if (saved && MODEL_OPTIONS.some((m) => m.value === saved)) {
      setSelectedModel(saved);
    }
  }, []);

  // Fetch chat list. The endpoint annotates each chat with `isStreaming`,
  // which we mirror into `serverStreamingChats` so the panel stays in sync
  // even for chats this browser isn't actively driving.
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`);
      const data: Chat[] = await res.json();
      setChatList(data);
      setServerStreamingChats((prev) => {
        const next = new Set<string>();
        for (const c of data) {
          if (c.isStreaming) next.add(c.id);
        }
        // Avoid pointless re-renders if nothing changed.
        if (next.size === prev.size && [...next].every((id) => prev.has(id))) {
          return prev;
        }
        return next;
      });
      return data;
    } catch {
      return [];
    }
  }, [projectId]);

  // Fetch messages for a chat. Also picks up the server-side `isStreaming`
  // flag so a page refresh mid-turn restores the "Thinking..." indicator.
  const fetchMessages = useCallback(
    async (chatId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chat/${chatId}/messages`,
        );
        const data = await res.json();
        // Tolerate the legacy array-shaped response in case anything still
        // returns it (older client cache, dev hot-reload, etc.).
        const msgs: ChatMsg[] = Array.isArray(data) ? data : (data.messages ?? []);
        const isStreaming =
          !Array.isArray(data) && Boolean(data.isStreaming);
        setMessages(msgs);
        setServerStreamingChats((prev) =>
          isStreaming ? withAdded(prev, chatId) : withRemoved(prev, chatId),
        );

        // Restore the side previews from ALL assistant messages with preview
        // fences (oldest → newest), replayed through the merge logic so the
        // final state matches what the live stream would have produced. Only
        // run this when we don't already have state for this chat (a live
        // stream would have populated it already).
        if (!lastPreviewsRef.current.has(chatId)) {
          let restored: PreviewState = EMPTY_PREVIEW_STATE;
          for (const m of msgs) {
            if (m.role !== 'assistant' || !m.content) continue;
            const events = extractAllPreviews(m.content);
            for (const ev of events) {
              restored = mergePreviewItem(restored, ev, Date.now());
            }
          }
          if (restored.items.length > 0) {
            lastPreviewsRef.current.set(chatId, restored);
            setPreviewRevision((r) => r + 1);
            if (activeChatRef.current === chatId) {
              setPreviewOpen(true);
            }
          }
        }
      } catch {
        setMessages([]);
      }
    },
    [projectId],
  );

  // Load initial data
  useEffect(() => {
    (async () => {
      const existingChats = await fetchChats();
      if (existingChats.length > 0) {
        setActiveChat(existingChats[0].id);
        await fetchMessages(existingChats[0].id);
      }
      setLoading(false);
    })();
  }, [fetchChats, fetchMessages]);

  // Poll the chat list so cross-chat activity (other tabs, background turns,
  // a sibling chat that just finished) is reflected without manual refresh.
  // Cheap query — single SELECT plus an in-memory Map lookup per row.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchChats();
    }, CHAT_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchChats]);

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
        writePreview(chatId, (prev) =>
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
        setPreviewOpen(true);
        return;
      }
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
    [streaming, fetchMessages, fetchChats, writePreview],
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
          console.warn('[ChatPanel] subscribe failed:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, serverStreamingChats, streamingChats, projectId]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [
    messages,
    activeChat,
    activeStreamState?.content,
    activeStreamState?.permissions.length ?? 0,
    activeStreamState?.toolActivities.length ?? 0,
  ]);

  // Create new chat
  const createChat = async () => {
    try {
      const lastMode =
        typeof window !== 'undefined'
          ? (window.localStorage.getItem(LAST_MODE_STORAGE_KEY) as 'local' | 'remote') ?? 'local'
          : 'local';
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, executionMode: lastMode }),
      });
      const chat = await res.json();
      setChatList((prev) => [chat, ...prev]);
      setActiveChat(chat.id);
      setMessages([]);
    } catch {
      notify({ title: 'Error', message: 'Failed to create chat', color: 'red' });
    }
  };

  // Switch chat
  const switchChat = async (chatId: string) => {
    setActiveChat(chatId);
    const chat = chatList.find((c) => c.id === chatId);
    if (chat?.model) {
      setSelectedModel(chat.model);
    }
    await fetchMessages(chatId);
  };

  // Delete chat
  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/chat/${chatId}`, {
        method: 'DELETE',
      });
      const updated = chatList.filter((c) => c.id !== chatId);
      setChatList(updated);
      if (activeChat === chatId) {
        if (updated.length > 0) {
          setActiveChat(updated[0].id);
          await fetchMessages(updated[0].id);
        } else {
          setActiveChat(null);
          setMessages([]);
        }
      }
    } catch {
      notify({ title: 'Error', message: 'Failed to delete chat', color: 'red' });
    }
  };

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
        const res = await fetch(
          `/api/projects/${projectId}/chat/${chatId}/attachments`,
          { method: 'POST', body: fd },
        );
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
      setMessages((prev) => [...prev, userMsg]);
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
        writePreview(chatId, (prev) =>
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
        setPreviewOpen(true);
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
      const res = await fetch(
        `/api/projects/${projectId}/chat/${chatId}/stream`,
        {
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
        },
      );

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
        await fetch(
          `/api/projects/${projectId}/chat/${chatId}/cancel`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionId ? { sessionId } : {}),
          },
        );
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
        await fetch(
          `/api/projects/${projectId}/claude/permission`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, requestId: toolUseId, decision: 'allow' }),
          },
        );
      } else {
        // Local mode: use /chat/[chatId]/permission with toolUseId
        await fetch(
          `/api/projects/${projectId}/chat/${chatId}/permission`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolUseId, decision: 'allow' }),
          },
        );
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
        await fetch(
          `/api/projects/${projectId}/claude/permission`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, requestId: toolUseId, decision: 'deny' }),
          },
        );
      } else {
        await fetch(
          `/api/projects/${projectId}/chat/${chatId}/permission`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolUseId, decision: 'deny' }),
          },
        );
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

  if (loading) {
    return (
      <Center h={400}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  const activeChatData = chatList.find((c) => c.id === activeChat);
  // Active-chat-scoped views — derived once so the JSX stays readable.
  const activeStreamingContent = activeStreamState?.content || undefined;
  const activeToolActivities = activeStreamState?.toolActivities ?? [];
  const activePermissions = activeStreamState?.permissions ?? [];
  const activeIsLocallyStreaming = activeChat ? streamingChats.has(activeChat) : false;
  const activeIsServerStreaming = activeChat ? serverStreamingChats.has(activeChat) : false;
  const activeShowsLiveTurn = activeIsLocallyStreaming || activeIsServerStreaming;
  // Disable input only on the chat that is busy; siblings stay usable.
  const inputDisabled = activeShowsLiveTurn;

  return (
    <Box
      ref={containerRef}
      style={{
        display: 'flex',
        height: '100%',
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-dark-6)',
        overflow: 'hidden',
        backgroundColor: 'var(--mantine-color-dark-8)',
      }}
    >
      {/* Chat List Sidebar */}
      <Box
        style={{
          width: 240,
          minWidth: 200,
          borderRight: '1px solid var(--mantine-color-dark-6)',
          backgroundColor: 'var(--mantine-color-dark-9)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack gap={0}>
          <Group
            gap="xs"
            px="sm"
            h={45}
            align="center"
            wrap="nowrap"
            style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}
          >
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ flex: 1 }}>
              Chats
            </Text>
            <Tooltip label="New Chat">
              <ActionIcon variant="light" size="sm" color="brand" onClick={createChat}>
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Stack>

        <ScrollArea style={{ flex: 1 }} type="auto">
          <Stack gap={0} p={4}>
            {chatList.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="lg">
                No chats yet
              </Text>
            ) : (
              chatList.map((chat) => {
                const isStreaming =
                  streamingChats.has(chat.id) ||
                  serverStreamingChats.has(chat.id) ||
                  Boolean(chat.isStreaming);
                return (
                  <Box
                    key={chat.id}
                    w="100%"
                    py={8}
                    px={10}
                    onClick={() => switchChat(chat.id)}
                    style={{
                      borderRadius: 'var(--mantine-radius-sm)',
                      backgroundColor:
                        chat.id === activeChat
                          ? 'rgba(0, 200, 200, 0.08)'
                          : 'transparent',
                      borderLeft:
                        chat.id === activeChat
                          ? '2px solid var(--mantine-color-brand-5)'
                          : '2px solid transparent',
                      transition: 'background-color 0.1s',
                      cursor: 'pointer',
                    }}
                  >
                    <Group gap={6} wrap="nowrap">
                      {isStreaming ? (
                        <Tooltip label="Chat is processing…" position="right" withArrow>
                          <Box
                            style={{
                              width: 12,
                              height: 12,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Loader size={12} color="brand" type="oval" />
                          </Box>
                        </Tooltip>
                      ) : (
                        <IconMessageCircle
                          size={12}
                          style={{
                            opacity: chat.id === activeChat ? 0.8 : 0.3,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <Text
                        size="xs"
                        lineClamp={1}
                        // Active chat title uses the default body text color so
                        // it stays high-contrast in both schemes. (`gray.2` is
                        // `#e9ecef` — invisible on white in light mode.)
                        c={chat.id === activeChat ? undefined : 'dimmed'}
                        fw={chat.id === activeChat ? 600 : 400}
                        style={{ flex: 1 }}
                      >
                        {chat.title}
                      </Text>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size={16}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(chat.id);
                        }}
                        style={{ opacity: 0.3, flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                      >
                        <IconTrash size={10} />
                      </ActionIcon>
                    </Group>
                    {chat.estimatedCost > 0 && (
                      <Text size="xs" c="dimmed" mt={2} style={{ fontSize: 10 }}>
                        ${chat.estimatedCost.toFixed(4)}
                      </Text>
                    )}
                  </Box>
                );
              })
            )}
          </Stack>
        </ScrollArea>
      </Box>

      {/* Chat Area */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        {activeChatData && (
          <Group
            px="md"
            h={45}
            align="center"
            justify="space-between"
            wrap="nowrap"
            style={{
              borderBottom: '1px solid var(--mantine-color-dark-6)',
              backgroundColor: 'var(--mantine-color-dark-9)',
            }}
          >
            <Group gap="sm" align="center" wrap="nowrap">
              {activeShowsLiveTurn ? (
                <Tooltip label="Chat is processing…" withArrow>
                  <Box style={{ display: 'flex', alignItems: 'center' }}>
                    <Loader size={14} color="brand" type="oval" />
                  </Box>
                </Tooltip>
              ) : (
                <IconSparkles size={16} style={{ color: 'var(--mantine-color-brand-5)', display: 'block' }} />
              )}
              <Text size="sm" fw={500}>
                {activeChatData.title}
              </Text>
              {activeShowsLiveTurn && activeChat && (
                <Tooltip
                  label={
                    cancellingChats.has(activeChat) ? 'Stopping…' : 'Stop generating'
                  }
                  withArrow
                >
                  <ActionIcon
                    size="sm"
                    color="red"
                    variant="light"
                    loading={cancellingChats.has(activeChat)}
                    disabled={cancellingChats.has(activeChat)}
                    onClick={() => stopChat(activeChat)}
                    aria-label="Stop generating"
                  >
                    <IconPlayerStopFilled size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            <Group gap="xs" align="center" wrap="nowrap">
              <Select
                size="xs"
                value={selectedModel}
                onChange={(val) => {
                  if (!val) return;
                  setSelectedModel(val);
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(LAST_MODEL_STORAGE_KEY, val);
                  }
                  if (activeChat) {
                    fetch(`/api/projects/${projectId}/chat/${activeChat}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ model: val }),
                    });
                    setChatList((prev) =>
                      prev.map((c) => (c.id === activeChat ? { ...c, model: val } : c)),
                    );
                  }
                }}
                data={MODEL_OPTIONS}
                allowDeselect={false}
                styles={{
                  input: {
                    backgroundColor: 'var(--mantine-color-dark-7)',
                    borderColor: 'var(--mantine-color-dark-5)',
                    fontSize: '11px',
                    minHeight: '33px',
                    height: '33px',
                    width: '140px',
                  },
                }}
              />
              {deviceId && (
                <SegmentedControl
                  size="xs"
                  value={activeChatData.executionMode ?? 'local'}
                  onChange={(val) => {
                    const mode = val as 'local' | 'remote';
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem(LAST_MODE_STORAGE_KEY, mode);
                    }
                    if (activeChat) {
                      fetch(`/api/projects/${projectId}/chat/${activeChat}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ executionMode: mode }),
                      });
                      setChatList((prev) =>
                        prev.map((c) =>
                          c.id === activeChat ? { ...c, executionMode: mode } : c,
                        ),
                      );
                    }
                  }}
                  data={[
                    {
                      value: 'local',
                      label: (
                        <Group gap={4} wrap="nowrap">
                          <IconServer size={12} />
                          <span>Local</span>
                        </Group>
                      ),
                    },
                    {
                      value: 'remote',
                      label: (
                        <Group gap={4} wrap="nowrap">
                          <IconCloud size={12} />
                          <span>On device</span>
                          {deviceConnected !== undefined && (
                            <Box
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                backgroundColor: deviceConnected
                                  ? 'var(--mantine-color-green-5)'
                                  : 'var(--mantine-color-red-5)',
                              }}
                            />
                          )}
                        </Group>
                      ),
                    },
                  ]}
                  styles={{
                    root: {
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      border: '1px solid var(--mantine-color-dark-5)',
                    },
                  }}
                />
              )}
              {activeChatData.estimatedCost > 0 && (
                <Badge
                  size="xs"
                  variant="light"
                  color="yellow"
                  leftSection={<IconCoins size={8} />}
                >
                  ${activeChatData.estimatedCost.toFixed(4)}
                </Badge>
              )}
            </Group>
          </Group>
        )}

        {/* Messages */}
        <ScrollArea
          style={{ flex: 1 }}
          type="auto"
          viewportRef={scrollRef}
        >
          <Stack gap={0} px="md" py="sm">
            {!activeChat ? (
              <Center h={300}>
                <Stack align="center" gap="sm">
                  <IconSparkles size={48} style={{ opacity: 0.15 }} />
                  <Text size="sm" c="dimmed">
                    Create a new chat to get started
                  </Text>
                  <Button
                    size="sm"
                    variant="light"
                    color="brand"
                    leftSection={<IconPlus size={14} />}
                    onClick={createChat}
                  >
                    New Chat
                  </Button>
                </Stack>
              </Center>
            ) : messages.length === 0 && !activeShowsLiveTurn ? (
              <Center h={300}>
                <Stack align="center" gap="sm">
                  <IconSparkles size={48} style={{ opacity: 0.15 }} />
                  <Text size="sm" c="dimmed">
                    Send a message to start chatting
                  </Text>
                </Stack>
              </Center>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}

                {/* Live streaming section — only render on the chat that is
                    actually streaming. Otherwise switching chats mid-turn
                    would leak the assistant's typing indicator into the wrong
                    conversation. Also rendered when the server reports an
                    in-flight turn that this browser isn't driving (e.g.
                    after a page refresh) so the user knows work is still
                    happening. */}
                {activeShowsLiveTurn && (
                  <>
                    {/* Tool Activity (inline during streaming) */}
                    {activeToolActivities.length > 0 && (
                      <Box px="md" py={4}>
                        {activeToolActivities.map((ta) => (
                          <ToolActivityBadge key={ta.id} activity={ta} />
                        ))}
                      </Box>
                    )}

                    {activeStreamingContent ? (
                      <ChatMessage
                        message={{
                          id: 'streaming',
                          chatId: activeChat!,
                          role: 'assistant',
                          content: activeStreamingContent,
                          toolUses: '[]',
                          proposedChanges: '[]',
                          attachments: '[]',
                          timestamp: new Date().toISOString(),
                        }}
                        isStreaming
                      />
                    ) : (
                      <Box px="md" py="sm">
                        <Group gap="xs">
                          <Loader size={14} color="brand" type="dots" />
                          <Text size="xs" c="dimmed" fs="italic">
                            {activeToolActivities.length > 0
                              ? 'Working...'
                              : 'Thinking...'}
                          </Text>
                        </Group>
                      </Box>
                    )}
                  </>
                )}
                {/* Permission Requests */}
                {activePermissions.length > 0 && (
                  <Box px="xs" py={4}>
                    {activePermissions.map((perm) => (
                      <ToolApprovalCard
                        key={perm.toolUseId}
                        permission={perm}
                        onApprove={approvePermission}
                        onDeny={denyPermission}
                        loading={respondingTo === perm.toolUseId}
                      />
                    ))}
                  </Box>
                )}
              </>
            )}
          </Stack>
        </ScrollArea>

        {/* Input */}
        {activeChat && (
          <ChatInput onSend={sendMessage} disabled={inputDisabled} />
        )}
      </Box>

      {/* Preview dock: rail is always visible whenever any preview exists for
          this chat; resize handle + panel content are conditional on previewOpen. */}
      {hasItems && previewOpen && activeItem && (
        <>
          <ResizeHandle
            onResize={setSplitPercent}
            containerRef={containerRef}
          />
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 0,
              flexShrink: 0,
              flexBasis: `${previewExpanded ? Math.max(splitPercent, 66) : splitPercent}%`,
              minWidth: 280,
              height: '100%',
              minHeight: 0,
              borderLeft: '1px solid var(--mantine-color-dark-6)',
              background: 'var(--mantine-color-dark-7)',
              transition: 'flex-basis 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
            }}
          >
            <PreviewPanel
              key={`${activeItem.id}:${previewRevision}`}
              item={activeItem}
              isExpanded={previewExpanded}
              onClosePanel={() => setPreviewOpen(false)}
              onToggleExpand={() => setPreviewExpanded((e) => !e)}
            />
          </Box>
        </>
      )}
      {hasItems && activeChat && (
        <PreviewRail
          items={previewState.items}
          activeId={previewState.activeId}
          panelOpen={previewOpen}
          onSelect={(id) => {
            writePreview(activeChat, (prev) => ({ ...prev, activeId: id }));
            setPreviewOpen(true);
          }}
          onCloseItem={(id) => {
            writePreview(activeChat, (prev) => removePreviewItem(prev, id));
            // Close the panel if the rail is now empty.
            const after = lastPreviewsRef.current.get(activeChat);
            if (!after || after.items.length === 0) {
              setPreviewOpen(false);
            }
          }}
          onTogglePanel={() => setPreviewOpen((o) => !o)}
        />
      )}
    </Box>
  );
}
