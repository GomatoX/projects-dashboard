'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
} from '@mantine/core';
import {
  IconPlus,
  IconMessageCircle,
  IconTrash,
  IconSparkles,
  IconCoins,
} from '@tabler/icons-react';
import { notify } from '@/lib/notify';
import { playSound } from '@/lib/audio';
import { ChatMessage, type ChatMsg } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ToolApprovalCard, ToolActivityBadge, type PermissionRequest, type ToolActivity } from './ToolApprovalCard';

interface Chat {
  id: string;
  projectId: string;
  title: string;
  model: string;
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
}

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

const LAST_MODEL_STORAGE_KEY = 'chat:lastSelectedModel';
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

export function ChatPanel({ projectId, deviceId }: ChatPanelProps) {
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
  const [streamingContents, setStreamingContents] = useState<Record<string, string>>({});
  // Server-reported in-flight turns (e.g. after a refresh, or another tab
  // started the stream). Populated by the chat list poll + the messages
  // fetch on chat switch.
  const [serverStreamingChats, setServerStreamingChats] = useState<Set<string>>(new Set());
  const [permissionsByChat, setPermissionsByChat] = useState<Record<string, PermissionRequest[]>>({});
  const [toolActivitiesByChat, setToolActivitiesByChat] = useState<Record<string, ToolActivity[]>>({});
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

  // Poll for completion when the server says a turn is streaming for the
  // active chat but this browser is not the one driving it (typically after
  // a refresh). When `isStreaming` flips back to false we pick up the new
  // assistant message that the stream route just persisted.
  useEffect(() => {
    if (!activeChat) return;
    if (!serverStreamingChats.has(activeChat)) return;
    // If we own the live SSE feed for this chat, the existing reader will
    // append the assistant message itself — no need to poll.
    if (streamingChats.has(activeChat)) return;

    const chatId = activeChat;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chat/${chatId}/messages`,
        );
        const data = await res.json();
        if (cancelled) return;
        // Drop the result if the user navigated away mid-poll — the next
        // chat switch will fetch fresh state for the new chat.
        if (activeChatRef.current !== chatId) return;
        const msgs = Array.isArray(data) ? data : (data.messages ?? []);
        const stillStreaming =
          !Array.isArray(data) && Boolean(data.isStreaming);
        setMessages(msgs);
        setServerStreamingChats((prev) =>
          stillStreaming ? withAdded(prev, chatId) : withRemoved(prev, chatId),
        );
        if (!stillStreaming) {
          // Stream just finished — refresh the sidebar so the chat title /
          // cost / token totals reflect the new turn.
          fetchChats();
          playSound('taskComplete');
        }
      } catch {
        // Transient network error — keep polling; effect cleanup handles teardown.
      }
    };

    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverStreamingChats, streamingChats, activeChat, projectId, fetchChats]);

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
    activeChat ? streamingContents[activeChat] : null,
    activeChat ? permissionsByChat[activeChat]?.length : 0,
    activeChat ? toolActivitiesByChat[activeChat]?.length : 0,
  ]);

  // Create new chat
  const createChat = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel }),
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
  const sendMessage = async (content: string) => {
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

    // Optimistic add user message
    const userMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      chatId,
      role: 'user',
      content,
      toolUses: '[]',
      proposedChanges: '[]',
      attachments: '[]',
      timestamp: new Date().toISOString(),
    };
    if (activeChatRef.current === chatId) {
      setMessages((prev) => [...prev, userMsg]);
    }
    setStreamingChats((prev) => withAdded(prev, chatId));
    setStreamingContents((prev) => ({ ...prev, [chatId]: '' }));

    let accumulated = '';

    // Single place that knows how to interpret a parsed SSE event. Defined
    // up-front so the buffered reader below can call it from one spot.
    const handleEvent = (event: Record<string, unknown>) => {
      if (event.type === 'text') {
        accumulated += event.text as string;
        setStreamingContents((prev) => ({ ...prev, [chatId]: accumulated }));
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
        // Only patch the visible message list when the user is still on the
        // chat that this stream belongs to. Otherwise the assistant message
        // would land in whichever chat the user navigated to. The server
        // persists the message regardless, so a later visit picks it up.
        if (activeChatRef.current === chatId) {
          setMessages((prev) => [...prev, assistantMsg]);
        }
        setStreamingContents((prev) => {
          const next = { ...prev };
          delete next[chatId];
          return next;
        });
        playSound('taskComplete');
        // Fire-and-forget: refresh sidebar titles/cost without blocking the
        // reader loop.
        fetchChats();
      } else if (event.type === 'permission_request') {
        playSound('notification');
        const perm: PermissionRequest = {
          toolUseId: event.toolUseId as string,
          toolName: event.toolName as string,
          displayName: event.displayName as string,
          category: event.category as PermissionRequest['category'],
          input: event.input as Record<string, unknown>,
          title: event.title as string,
          description: event.description as string | undefined,
          status: 'pending',
        };
        setPermissionsByChat((prev) => ({
          ...prev,
          [chatId]: [...(prev[chatId] ?? []), perm],
        }));
      } else if (event.type === 'tool_use') {
        const tool = event.tool as Record<string, unknown>;
        const activity: ToolActivity = {
          id: tool.id as string,
          toolName: tool.toolName as string,
          displayName: tool.displayName as string,
          status: tool.status as ToolActivity['status'],
          input: tool.input as Record<string, unknown>,
        };
        setToolActivitiesByChat((prev) => ({
          ...prev,
          [chatId]: [...(prev[chatId] ?? []), activity],
        }));
      } else if (event.type === 'error') {
        notify({
          title: 'AI Error',
          message: event.message as string,
          color: 'red',
        });
      }
    };

    try {
      const res = await fetch(
        `/api/projects/${projectId}/chat/${chatId}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content }),
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
      setStreamingContents((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      // Drop any tool-activity badges that were tied to this turn — they're
      // ephemeral UI signals, not persisted state.
      setToolActivitiesByChat((prev) => {
        if (!(chatId in prev)) return prev;
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
    }
  };

  // Handle permission approval — sends to /permission endpoint
  const approvePermission = async (toolUseId: string) => {
    if (!activeChat) return;
    setRespondingTo(toolUseId);
    const chatId = activeChat;

    try {
      await fetch(
        `/api/projects/${projectId}/chat/${chatId}/permission`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolUseId, decision: 'allow' }),
        },
      );

      setPermissionsByChat((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] ?? []).map((p) =>
          p.toolUseId === toolUseId ? { ...p, status: 'approved' } as PermissionRequest : p,
        ),
      }));
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

    try {
      await fetch(
        `/api/projects/${projectId}/chat/${chatId}/permission`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolUseId, decision: 'deny' }),
        },
      );

      setPermissionsByChat((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] ?? []).map((p) =>
          p.toolUseId === toolUseId ? { ...p, status: 'denied' } as PermissionRequest : p,
        ),
      }));
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
  const activeStreamingContent = activeChat ? streamingContents[activeChat] : undefined;
  const activeToolActivities = activeChat ? toolActivitiesByChat[activeChat] ?? [] : [];
  const activePermissions = activeChat ? permissionsByChat[activeChat] ?? [] : [];
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
            py={8}
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
                        c={chat.id === activeChat ? 'gray.2' : 'dimmed'}
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
            py={8}
            justify="space-between"
            style={{
              borderBottom: '1px solid var(--mantine-color-dark-6)',
              backgroundColor: 'var(--mantine-color-dark-9)',
            }}
          >
            <Group gap="sm">
              {activeShowsLiveTurn ? (
                <Tooltip label="Chat is processing…" withArrow>
                  <Box style={{ display: 'flex', alignItems: 'center' }}>
                    <Loader size={14} color="brand" type="oval" />
                  </Box>
                </Tooltip>
              ) : (
                <IconSparkles size={16} style={{ color: 'var(--mantine-color-brand-5)' }} />
              )}
              <Text size="sm" fw={500}>
                {activeChatData.title}
              </Text>
            </Group>
            <Group gap="xs">
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
                    minHeight: '28px',
                    height: '28px',
                    width: '140px',
                  },
                }}
              />
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
