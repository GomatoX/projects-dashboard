'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStreamSlice } from './streaming-store';
import {
  Box,
  Stack,
  Text,
  Button,
  ActionIcon,
  ScrollArea,
  Center,
  Loader,
} from '@mantine/core';
import {
  IconPlus,
  IconSparkles,
  IconArrowDown,
} from '@tabler/icons-react';
import { ChatList } from './ChatList';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatHeader } from './ChatHeader';
import { StreamingBubble } from './StreamingBubble';
import { PreviewHost, PreviewRailHost } from './PreviewHost';
import { useStickToBottom } from './useStickToBottom';
import { useChatsList } from './use-chats-list';
import { useChatStream } from './use-chat-stream';

const LAST_MODEL_STORAGE_KEY = 'chat:lastSelectedModel';
const LAST_MODE_STORAGE_KEY = 'chat:lastExecutionMode';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

interface ChatPanelProps {
  projectId: string;
  deviceId: string | null;
  deviceConnected?: boolean;
}

export function ChatPanel({ projectId, deviceId, deviceConnected }: ChatPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const list = useChatsList(projectId, DEFAULT_MODEL);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // When switching chats, leave the panel closed by default — the rail still
  // shows the available previews so the user can click in if they want. Live
  // preview events (mid-stream) will auto-open the panel themselves; there's
  // no reason to force-open just because we navigated.
  useEffect(() => {
    if (!list.activeChat) return;
    setPreviewOpen(false);
    setPreviewExpanded(false);
  }, [list.activeChat]);

  const stream = useChatStream({
    projectId,
    activeChat: list.activeChat,
    serverStreamingChats: list.serverStreamingChats,
    setServerStreamingChats: list.setServerStreamingChats,
    fetchMessages: list.fetchMessages,
    fetchChats: list.fetchChats,
    openPreview: () => setPreviewOpen(true),
    appendOptimisticUserMessage: (m) => list.setMessages((prev) => [...prev, m]),
    chatList: list.chatList,
  });

  // Subscribed read of the active chat's slice. Re-renders the panel ONLY
  // when this chat's streaming state actually changes — token deltas on a
  // background chat do not wake this component.
  const activeStreamState = useChatStreamSlice(list.activeChat);

  // Auto-scroll on new content — only when the user is already at the
  // bottom. When they're scrolled up, surface a "↓" pill instead of
  // yanking them back. See useStickToBottom for the full state machine.
  const { isAtBottom, jumpToBottom } = useStickToBottom(
    scrollRef,
    [
      list.messages,
      activeStreamState?.content,
      activeStreamState?.permissions.length ?? 0,
      activeStreamState?.toolActivities.length ?? 0,
    ],
    list.activeChat,
  );

  if (list.loading) {
    return (
      <Center h={400}>
        <Loader color="brand" type="dots" size="lg" />
      </Center>
    );
  }

  const activeChatData = list.chatList.find((c) => c.id === list.activeChat);
  // Active-chat-scoped views — derived once so the JSX stays readable.
  const activeIsLocallyStreaming = list.activeChat ? stream.streamingChats.has(list.activeChat) : false;
  const activeIsServerStreaming = list.activeChat ? list.serverStreamingChats.has(list.activeChat) : false;
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
      <ChatList
        items={list.chatList}
        activeId={list.activeChat}
        serverStreaming={list.serverStreamingChats}
        onSelect={list.switchChat}
        onDelete={list.deleteChat}
        onCreate={list.createChat}
      />

      {/* Chat-area + preview-dock row. The OUTER box holds the rail too so
          it stays anchored to the right edge. The INNER box (containerRef)
          is the 100% reference for the resize math — it must contain ONLY
          the resizable children (chat, handle, panel). The rail is fixed-
          width and lives outside. */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
      <Box
        ref={containerRef}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
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
          <ChatHeader
            title={activeChatData.title}
            estimatedCost={activeChatData.estimatedCost}
            executionMode={activeChatData.executionMode ?? 'local'}
            selectedModel={list.selectedModel}
            isStreaming={activeShowsLiveTurn}
            isCancelling={!!list.activeChat && stream.cancellingChats.has(list.activeChat)}
            deviceId={deviceId}
            deviceConnected={deviceConnected}
            onStop={() => list.activeChat && stream.stopChat(list.activeChat)}
            onModelChange={(val) => {
              list.setSelectedModel(val);
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(LAST_MODEL_STORAGE_KEY, val);
              }
              if (list.activeChat) {
                fetch(`/api/projects/${projectId}/chat/${list.activeChat}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ model: val }),
                });
                list.setChatList((prev) =>
                  prev.map((c) => (c.id === list.activeChat ? { ...c, model: val } : c)),
                );
              }
            }}
            onModeChange={(mode) => {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(LAST_MODE_STORAGE_KEY, mode);
              }
              if (list.activeChat) {
                fetch(`/api/projects/${projectId}/chat/${list.activeChat}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ executionMode: mode }),
                });
                list.setChatList((prev) =>
                  prev.map((c) =>
                    c.id === list.activeChat ? { ...c, executionMode: mode } : c,
                  ),
                );
              }
            }}
          />
        )}

        {/* Messages — wrapped in a position:relative box so the
            jump-to-latest pill can anchor to the scroll area. */}
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
        <ScrollArea
          style={{ flex: 1 }}
          type="auto"
          viewportRef={scrollRef}
        >
          <Stack gap={0} px="md" py="sm">
            {!list.activeChat ? (
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
                    onClick={list.createChat}
                  >
                    New Chat
                  </Button>
                </Stack>
              </Center>
            ) : list.messages.length === 0 && !activeShowsLiveTurn ? (
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
                {list.messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}

                {list.activeChat && (
                  <StreamingBubble
                    chatId={list.activeChat}
                    serverStreaming={activeIsServerStreaming}
                    respondingToToolUseId={stream.respondingTo}
                    onApprove={stream.approvePermission}
                    onDeny={stream.denyPermission}
                  />
                )}
              </>
            )}
          </Stack>
        </ScrollArea>

          {/* Jump-to-latest pill. Hidden when already at bottom. While
              the assistant is streaming, expands to a labeled "Writing"
              pill so the user knows new content is being produced below
              their current scroll position. */}
          {!isAtBottom &&
            (activeShowsLiveTurn ? (
              <Button
                onClick={() => jumpToBottom('smooth')}
                size="compact-xs"
                radius="xl"
                variant="filled"
                color="blue"
                rightSection={<IconArrowDown size={12} />}
                aria-label="Jump to latest (assistant is writing)"
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 5,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                }}
              >
                Writing
              </Button>
            ) : (
              <ActionIcon
                onClick={() => jumpToBottom('smooth')}
                radius="xl"
                size="sm"
                variant="filled"
                color="gray"
                aria-label="Jump to latest"
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 5,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                }}
              >
                <IconArrowDown size={12} />
              </ActionIcon>
            ))}
        </Box>

        {/* Input */}
        {list.activeChat && (
          <ChatInput onSend={stream.sendMessage} disabled={inputDisabled} />
        )}
      </Box>

        {list.activeChat && (
          <PreviewHost
            chatId={list.activeChat}
            containerRef={containerRef}
            open={previewOpen}
            expanded={previewExpanded}
            onClose={() => setPreviewOpen(false)}
            onToggleExpand={() => setPreviewExpanded((e) => !e)}
          />
        )}
      </Box>
      {list.activeChat && (
        <PreviewRailHost
          chatId={list.activeChat}
          panelOpen={previewOpen}
          onSelect={() => setPreviewOpen(true)}
          onTogglePanel={() => setPreviewOpen((o) => !o)}
        />
      )}
      </Box>
    </Box>
  );
}
