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
import { Virtuoso } from 'react-virtuoso';
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
  // Capture the underlying scroller element so the jump-pill can scroll past
  // the Footer (where the streaming bubble lives). `virtuosoRef.scrollToIndex`
  // only reaches the last DATA row, which would land the user above the
  // streaming text — exactly the opposite of the affordance the pill exists
  // for. Native `scrollTo({ top: scrollHeight })` reaches the absolute bottom.
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const Footer = useCallback(
    () => <Box>{renderStreamingBubble()}</Box>,
    [renderStreamingBubble],
  );

  const jumpToBottom = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

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
        // Re-mount the virtualized list when the user switches chats. Without
        // this key, virtuoso reuses one instance and bleeds the previous
        // chat's scroll position into the new chat's first paint.
        key={activeChat}
        scrollerRef={(el) => {
          scrollerRef.current = el as HTMLElement | null;
        }}
        style={{ flex: 1 }}
        data={messages}
        computeItemKey={(_, msg) => msg.id}
        itemContent={(_, msg) => <ChatMessage message={msg} />}
        components={{ Footer }}
        // Stick-to-bottom while at end. `followOutput` triggers on data-length
        // change; mid-stream Footer growth is handled by virtuoso's internal
        // SIZE_INCREASED auto-scroll (kicks in when the user is glued to
        // bottom). The "Writing" pill below covers the scrolled-up case.
        followOutput="smooth"
        atBottomStateChange={setAtBottom}
        atBottomThreshold={50}
        increaseViewportBy={{ top: 200, bottom: 600 }}
      />
      {!atBottom &&
        (showsLiveTurn ? (
          <Button
            onClick={jumpToBottom}
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
            onClick={jumpToBottom}
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
