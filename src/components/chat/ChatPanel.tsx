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
  Card,
  ScrollArea,
  UnstyledButton,
  Center,
  Loader,
  Select,
} from '@mantine/core';
import {
  IconPlus,
  IconMessageCircle,
  IconTrash,
  IconAlertTriangle,
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

export function ChatPanel({ projectId, deviceId }: ChatPanelProps) {
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load last selected model from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(LAST_MODEL_STORAGE_KEY);
    if (saved && MODEL_OPTIONS.some((m) => m.value === saved)) {
      setSelectedModel(saved);
    }
  }, []);

  // Fetch chat list
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`);
      const data = await res.json();
      setChatList(data);
      return data;
    } catch {
      return [];
    }
  }, [projectId]);

  // Fetch messages for a chat
  const fetchMessages = useCallback(
    async (chatId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chat/${chatId}/messages`,
        );
        const data = await res.json();
        setMessages(data);
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

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, streamingContent, permissions.length, toolActivities.length]);

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

  // Send message with streaming
  const sendMessage = async (content: string) => {
    if (!activeChat || streaming) return;

    // Optimistic add user message
    const userMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      chatId: activeChat,
      role: 'user',
      content,
      toolUses: '[]',
      proposedChanges: '[]',
      attachments: '[]',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');

    try {
      const res = await fetch(
        `/api/projects/${projectId}/chat/${activeChat}/stream`,
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
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'text') {
              accumulated += event.text;
              setStreamingContent(accumulated);
            } else if (event.type === 'done') {
              // Add final assistant message
              const assistantMsg: ChatMsg = {
                id: event.messageId,
                chatId: activeChat,
                role: 'assistant',
                content: accumulated,
                toolUses: '[]',
                proposedChanges: '[]',
                attachments: '[]',
                tokensIn: event.tokensIn,
                tokensOut: event.tokensOut,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMsg]);
              setStreamingContent('');

              // Play a chime once the assistant has finished — long agent
              // turns are the single best place to surface "your turn again".
              playSound('taskComplete');

              // Refresh chat list to update title/cost
              await fetchChats();
            } else if (event.type === 'permission_request') {
              // Agent needs approval for a tool
              console.log('[Chat] Permission request received:', event.toolName, event.toolUseId);
              // Nudge the user — a permission request blocks the agent until
              // they click, so it should never go unnoticed.
              playSound('notification');
              setPermissions((prev) => [
                ...prev,
                {
                  toolUseId: event.toolUseId,
                  toolName: event.toolName,
                  displayName: event.displayName,
                  category: event.category,
                  input: event.input,
                  title: event.title,
                  description: event.description,
                  status: 'pending',
                } as PermissionRequest,
              ]);
            } else if (event.type === 'tool_use') {
              // Auto-allowed tool activity
              setToolActivities((prev) => [
                ...prev,
                {
                  id: event.tool.id,
                  toolName: event.tool.toolName,
                  displayName: event.tool.displayName,
                  status: event.tool.status,
                  input: event.tool.input,
                } as ToolActivity,
              ]);
            } else if (event.type === 'error') {
              notify({
                title: 'AI Error',
                message: event.message,
                color: 'red',
              });
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (error) {
      notify({
        title: 'Error',
        message: 'Failed to get AI response',
        color: 'red',
      });
    } finally {
      setStreaming(false);
      setStreamingContent('');
      // Clear tool activities after stream ends
      setToolActivities([]);
    }
  };

  // Handle permission approval — sends to /permission endpoint
  const approvePermission = async (toolUseId: string) => {
    if (!activeChat) return;
    setRespondingTo(toolUseId);

    try {
      await fetch(
        `/api/projects/${projectId}/chat/${activeChat}/permission`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolUseId, decision: 'allow' }),
        },
      );

      setPermissions((prev) =>
        prev.map((p) =>
          p.toolUseId === toolUseId ? { ...p, status: 'approved' } as PermissionRequest : p,
        ),
      );
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

    try {
      await fetch(
        `/api/projects/${projectId}/chat/${activeChat}/permission`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolUseId, decision: 'deny' }),
        },
      );

      setPermissions((prev) =>
        prev.map((p) =>
          p.toolUseId === toolUseId ? { ...p, status: 'denied' } as PermissionRequest : p,
        ),
      );
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
              chatList.map((chat) => (
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
                    <IconMessageCircle
                      size={12}
                      style={{
                        opacity: chat.id === activeChat ? 0.8 : 0.3,
                        flexShrink: 0,
                      }}
                    />
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
              ))
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
              <IconSparkles size={16} style={{ color: 'var(--mantine-color-brand-5)' }} />
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
            ) : messages.length === 0 && !streaming ? (
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

                {/* Live streaming section */}
                {streaming && (
                  <>
                    {/* Tool Activity (inline during streaming) */}
                    {toolActivities.length > 0 && (
                      <Box px="md" py={4}>
                        {toolActivities.map((ta) => (
                          <ToolActivityBadge key={ta.id} activity={ta} />
                        ))}
                      </Box>
                    )}

                    {streamingContent ? (
                      <ChatMessage
                        message={{
                          id: 'streaming',
                          chatId: activeChat!,
                          role: 'assistant',
                          content: streamingContent,
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
                            {toolActivities.length > 0
                              ? 'Working...'
                              : 'Thinking...'}
                          </Text>
                        </Group>
                      </Box>
                    )}
                  </>
                )}
                {/* Permission Requests */}
                {permissions.length > 0 && (
                  <Box px="xs" py={4}>
                    {permissions.map((perm) => (
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
          <ChatInput onSend={sendMessage} disabled={streaming} />
        )}
      </Box>
    </Box>
  );
}
