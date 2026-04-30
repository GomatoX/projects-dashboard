// src/components/chat/MessageList.tsx
//
// Virtualized chat-message list. Rendering 1000 messages stays cheap because
// react-virtuoso only mounts ~30 rows at a time. The streaming bubble lives
// in the Footer slot so it stays "below" the persisted messages without
// being virtualized.
//
// Stick-to-bottom behavior comes from virtuoso's `followOutput` + the
// `atBottomStateChange` callback — replaces the bespoke `useStickToBottom`.

'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Box, Button, ActionIcon, Center, Stack, Text } from '@mantine/core';
import { IconSparkles, IconArrowDown, IconPlus } from '@tabler/icons-react';
import { ChatMessage, type ChatMsg } from './ChatMessage';

interface MessageListProps {
  activeChat: string | null;
  messages: ChatMsg[];
  showsLiveTurn: boolean;
  renderStreamingBubble: () => ReactNode;
  onCreate: () => void;
}

export function MessageList({
  activeChat,
  messages,
  showsLiveTurn,
  renderStreamingBubble,
  onCreate,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);

  const Footer = useCallback(
    () => <Box>{renderStreamingBubble()}</Box>,
    [renderStreamingBubble],
  );

  if (!activeChat) {
    return (
      <Center h={300} style={{ flex: 1 }}>
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
            onClick={onCreate}
          >
            New Chat
          </Button>
        </Stack>
      </Center>
    );
  }

  if (messages.length === 0 && !showsLiveTurn) {
    return (
      <Center h={300} style={{ flex: 1 }}>
        <Stack align="center" gap="sm">
          <IconSparkles size={48} style={{ opacity: 0.15 }} />
          <Text size="sm" c="dimmed">
            Send a message to start chatting
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Box style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      <Virtuoso
        ref={virtuosoRef}
        style={{ flex: 1 }}
        data={messages}
        // Reset when the chat switches — virtuoso uses this as a key.
        // (`computeItemKey` ensures stable per-row keys within a chat.)
        computeItemKey={(_, msg) => msg.id}
        itemContent={(_, msg) => <ChatMessage message={msg} />}
        components={{ Footer }}
        // Stick-to-bottom: smooth scroll new content while user is at end.
        followOutput="smooth"
        atBottomStateChange={setAtBottom}
        atBottomThreshold={50}
        increaseViewportBy={{ top: 200, bottom: 600 }}
      />
      {!atBottom &&
        (showsLiveTurn ? (
          <Button
            onClick={() =>
              virtuosoRef.current?.scrollToIndex({
                index: 'LAST',
                align: 'end',
                behavior: 'smooth',
              })
            }
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
            onClick={() =>
              virtuosoRef.current?.scrollToIndex({
                index: 'LAST',
                align: 'end',
                behavior: 'smooth',
              })
            }
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
  );
}
