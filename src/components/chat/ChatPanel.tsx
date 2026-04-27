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
  // Tracks the chat the user is currently viewing without re-creating the
  // sendMessage closure on every switch. The streaming reader runs for the
  // full duration of an agent turn and needs an up-to-date reference, not the
  // value captured when sendMessage was called.
  const activeChatRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

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
        const msgs = Array.isArray(data) ? data : (data.messages ?? []);
        const isStreaming =
          !Array.isArray(data) && Boolean(data.isStreaming);
        setMessages(msgs);
        setServerStreamingChats((prev) =>
          isStreaming ? withAdded(prev, chatId) : withRemoved(prev, chatId),
        );
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
        // begin() is idempotent if already active; ensures we initialise
        // empty content even if we joined mid-turn.
        const cur = streaming.get(chatId);
        if (!cur.active) streaming.begin(chatId);
        streaming.appendText(chatId, event.text as string);
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
    [streaming, fetchMessages, fetchChats],
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

    let accumulated = '';

    // Single place that knows how to interpret a parsed SSE event. Defined
    // up-front so the buffered reader below can call it from one spot.
    const handleEvent = (event: Record<string, unknown>) => {
      if (event.type === 'session_started') {
        // Remote mode: capture the sessionId for cancel/permission
        streaming.setSessionId(chatId, event.sessionId as string);
      } else if (event.type === 'text') {
        accumulated += event.text as string;
        streaming.appendText(chatId, event.text as string);
      } else if (event.type === 'done') {
        const assistantMsg: ChatMsg = {
          id: event.messageId as string,
          chatId,
          role: 'assistant',
          content: accumulated,
          toolUses: '[]',
          proposedChanges: '[]',
          attachments: '[]',
          tokensIn: event.tokensIn as number,
          tokensOut: event.tokensOut as number,
          timestamp: new Date().toISOString(),
        };
        if (activeChatRef.current === chatId) {
          setMessages((prev) => [...prev, assistantMsg]);
        }
        streaming.clear(chatId);
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
    } catch {
      notify({
        title: 'Error',
        message: 'Failed to get AI response',
        color: 'red',
      });
    } finally {
      setStreamingChats((prev) => withRemoved(prev, chatId));
      streaming.end(chatId);
    }
  };

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
    </Box>
  );
}
